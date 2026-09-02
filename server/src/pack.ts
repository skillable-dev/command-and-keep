// Skill pack loader and validator.
// A pack is a folder: SKILL.md (Agent Skills spec) plus the Skillable extension files.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import YAML from "yaml";

export type Half = "command" | "keep";
export type MissionKind = "diagnostic" | "mission" | "transfer" | "capstone" | "reflection" | "review";
export type Level = 1 | 2 | 3 | 4;

export interface Capability {
  id: string;
  half: Half;
  name: string;
  tell: string;
  review_prompt: string;
}

export interface RubricDimension {
  id: string;
  name: string;
  levels: Record<Level, string>;
}

export interface Rubric {
  capability: string;
  dimensions: RubricDimension[];
}

export interface Mission {
  id: string;
  title: string;
  kind: MissionKind;
  day: number;
  capability: string;
  capabilities: string[];
  template: string;
  minutes: number;
  unaided_required: boolean;
  transfer_of?: string;
  transfer_distance: number;
  context_shift?: string;
  evidence: string[];
  contexts: string[];
  fallback_scenario?: string;
  body: string;
}

export interface Misconception {
  id: string;
  capability: string;
  tell: string;
  repair: string;
}

export interface EvidenceRules {
  per_capability: {
    min_attempts: number;
    min_unaided_attempts: number;
    min_distinct_contexts: number;
    min_level: number;
  };
  credential: {
    min_capabilities_met: number;
    capstone_required: string;
    retrospective_required: string;
    human_sampling: { capstone: boolean; rate: number };
  };
  review_schedule_days: number[];
  hint_budget_per_mission: number;
  unaided_kinds: MissionKind[];
}

export interface Campaign {
  id: string;
  title: string;
  version: string;
  duration_days: number;
  intensities: string[];
  default_intensity: string;
  halves: Record<Half, { days: [number, number]; capabilities: string[] }>;
  capstone: string;
  retrospective: string;
  diagnostic: string;
  contract: string;
}

export interface Pack {
  root: string;
  skill: { name: string; description: string; metadata?: Record<string, unknown>; body: string };
  campaign: Campaign;
  capabilities: Capability[];
  rubrics: Record<string, Rubric>;
  missions: Record<string, Mission>;
  misconceptions: Misconception[];
  lenses: Record<number, string>;
  evidenceRules: EvidenceRules;
  safety: Record<string, unknown>;
  credential: Record<string, unknown>;
}

export function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  return { data: (YAML.parse(m[1]) as Record<string, unknown>) ?? {}, body: m[2].trim() };
}

function readYaml<T>(path: string): T {
  return YAML.parse(readFileSync(path, "utf8")) as T;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadMissionsFrom(dir: string): Mission[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, body } = splitFrontmatter(readFileSync(join(dir, f), "utf8"));
      const d = data as Partial<Mission> & { capabilities?: string[] };
      const id = (d.id as string) ?? basename(f, ".md");
      const capability = d.capability as string;
      const capabilities = d.capabilities && d.capabilities.length > 0 ? d.capabilities : [capability];
      return {
        id,
        title: (d.title as string) ?? id,
        kind: (d.kind as MissionKind) ?? "mission",
        day: Number(d.day ?? 0),
        capability,
        capabilities,
        template: (d.template as string) ?? "decide",
        minutes: Number(d.minutes ?? 15),
        unaided_required: Boolean(d.unaided_required ?? false),
        transfer_of: d.transfer_of as string | undefined,
        transfer_distance: Number(d.transfer_distance ?? 0),
        context_shift: d.context_shift as string | undefined,
        evidence: (d.evidence as string[]) ?? [],
        contexts: (d.contexts as string[]) ?? ["manual"],
        fallback_scenario: d.fallback_scenario as string | undefined,
        body,
      } satisfies Mission;
    });
}

export function loadPack(root: string): Pack {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Pack directory not found: ${root}`);
  }
  const skillRaw = readFileSync(join(root, "SKILL.md"), "utf8");
  const { data: skillData, body: skillBody } = splitFrontmatter(skillRaw);
  const campaign = readYaml<Campaign>(join(root, "campaign.yaml"));
  const capabilities = readYaml<Capability[]>(join(root, "capabilities.yaml"));
  const lensesRaw = readYaml<Record<string | number, string>>(join(root, "lenses.yaml"));
  const lenses: Record<number, string> = {};
  for (const [k, v] of Object.entries(lensesRaw)) lenses[Number(k)] = v;

  const rubrics: Record<string, Rubric> = {};
  const rubricDir = join(root, "rubrics");
  for (const f of readdirSync(rubricDir).filter((f) => f.endsWith(".yaml"))) {
    const r = readYaml<Rubric>(join(rubricDir, f));
    rubrics[r.capability] = r;
  }

  const missions: Record<string, Mission> = {};
  for (const m of [...loadMissionsFrom(join(root, "missions")), ...loadMissionsFrom(join(root, "transfer"))]) {
    missions[m.id] = m;
  }

  const pack: Pack = {
    root,
    skill: {
      name: String(skillData.name ?? ""),
      description: String(skillData.description ?? ""),
      metadata: skillData.metadata as Record<string, unknown> | undefined,
      body: skillBody,
    },
    campaign,
    capabilities,
    rubrics,
    missions,
    misconceptions: readYaml<Misconception[]>(join(root, "misconceptions.yaml")),
    lenses,
    evidenceRules: readJson<EvidenceRules>(join(root, "evidence-rules.json")),
    safety: readJson<Record<string, unknown>>(join(root, "safety.json")),
    credential: readJson<Record<string, unknown>>(join(root, "credential.json")),
  };
  return pack;
}

/** Automated structural publishing gates. Returns a list of problems; empty means the pack structure passes. */
export function validatePack(pack: Pack): string[] {
  const problems: string[] = [];
  const capIds = new Set(pack.capabilities.map((c) => c.id));

  if (!pack.skill.name) problems.push("SKILL.md: missing `name` in frontmatter");
  if (!pack.skill.description) problems.push("SKILL.md: missing `description` in frontmatter");
  if (pack.skill.name && !/^[a-z0-9-]+$/.test(pack.skill.name)) {
    problems.push(`SKILL.md: name '${pack.skill.name}' must be lowercase letters, digits and hyphens`);
  }
  if (pack.skill.description.length > 1024) problems.push("SKILL.md: description longer than 1024 characters");

  for (const c of pack.capabilities) {
    if (!pack.rubrics[c.id]) problems.push(`capability '${c.id}' has no rubric`);
    else {
      const r = pack.rubrics[c.id];
      if (r.dimensions.length < 2) problems.push(`rubric '${c.id}' needs at least two dimensions`);
      for (const d of r.dimensions) {
        for (const lvl of [1, 2, 3, 4] as Level[]) {
          if (!d.levels?.[lvl]) problems.push(`rubric '${c.id}' dimension '${d.id}' missing level ${lvl}`);
        }
      }
    }
    if (!c.review_prompt) problems.push(`capability '${c.id}' has no review_prompt`);
    if (!c.tell) problems.push(`capability '${c.id}' has no tell`);
    const missions = Object.values(pack.missions).filter((m) => m.capabilities.includes(c.id));
    if (!missions.some((m) => m.kind === "mission")) problems.push(`capability '${c.id}' has no authentic mission`);
    if (!missions.some((m) => m.kind === "transfer")) problems.push(`capability '${c.id}' has no transfer mission`);
    if (!pack.misconceptions.some((mc) => mc.capability === c.id)) problems.push(`capability '${c.id}' has no misconception`);
  }

  for (const m of Object.values(pack.missions)) {
    for (const cid of m.capabilities) {
      if (!capIds.has(cid)) problems.push(`mission '${m.id}' references unknown capability '${cid}'`);
    }
    if (m.kind === "transfer") {
      if (!m.transfer_of) {
        problems.push(`transfer '${m.id}' has no transfer_of mission`);
      } else {
        const source = pack.missions[m.transfer_of];
        if (!source) {
          problems.push(`transfer '${m.id}' references unknown mission '${m.transfer_of}'`);
        } else {
          if (source.kind !== "mission") problems.push(`transfer '${m.id}' must reference an authentic mission, not '${source.kind}'`);
          for (const cid of m.capabilities) {
            if (!source.capabilities.includes(cid)) {
              problems.push(`transfer '${m.id}' capability '${cid}' is not covered by source mission '${source.id}'`);
            }
          }
        }
      }
      if (!m.unaided_required) problems.push(`transfer '${m.id}' must be unaided_required`);
      if (m.transfer_distance < 1) problems.push(`transfer '${m.id}' must have a positive transfer_distance`);
      if (!m.context_shift?.trim()) problems.push(`transfer '${m.id}' must explain its context_shift`);
    } else if (m.transfer_of) {
      problems.push(`mission '${m.id}' declares transfer_of but is not a transfer`);
    }
    if (m.day < 0 || m.day > pack.campaign.duration_days) problems.push(`mission '${m.id}' day ${m.day} outside campaign`);
    if (!m.body.trim()) problems.push(`mission '${m.id}' has an empty body`);
  }

  for (const mc of pack.misconceptions) {
    if (!capIds.has(mc.capability)) problems.push(`misconception '${mc.id}' references unknown capability '${mc.capability}'`);
    if (!mc.repair) problems.push(`misconception '${mc.id}' has no repair`);
  }

  for (const key of ["capstone", "retrospective", "diagnostic"] as const) {
    if (!pack.missions[pack.campaign[key]]) problems.push(`campaign.${key} '${pack.campaign[key]}' is not a mission`);
  }
  for (let d = 0; d <= pack.campaign.duration_days; d++) {
    if (!pack.lenses[d]) problems.push(`no lens for day ${d}`);
  }

  const s = pack.safety as Record<string, unknown>;
  for (const key of ["max_prompts_per_day", "permitted_hours", "reality_check_required", "pause_always_available"]) {
    if (s[key] === undefined) problems.push(`safety.json missing '${key}'`);
  }
  const allowedContexts = new Set(Array.isArray(s.context_tiers_allowed) ? s.context_tiers_allowed.map(String) : []);
  if (allowedContexts.size === 0) problems.push("safety.json: context_tiers_allowed must not be empty");
  for (const m of Object.values(pack.missions)) {
    for (const context of m.contexts) {
      if (!allowedContexts.has(context)) problems.push(`mission '${m.id}' uses context '${context}' outside the safety allowlist`);
    }
  }
  if (!pack.evidenceRules.credential?.capstone_required) problems.push("evidence-rules.json: credential.capstone_required missing");

  return problems;
}
