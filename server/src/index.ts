#!/usr/bin/env node
// Skillable runtime PoC: six MCP tools over one skill pack and a local evidence ledger.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";
import { loadPack, validatePack } from "./pack.js";
import { Ledger } from "./ledger.js";
import { Runtime, RuntimeError } from "./runtime.js";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = resolve(process.env.SKILLABLE_PACK ?? join(here, "..", "..", "skills", "command-and-keep"));
const ledgerPath = resolve(process.env.SKILLABLE_LEDGER ?? join(homedir(), ".skillable", "command-and-keep", "ledger.json"));

const pack = loadPack(packDir);
const problems = validatePack(pack);
if (problems.length) {
  console.error(`Pack '${pack.skill.name}' fails ${problems.length} publishing gate(s):\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
const runtime = new Runtime(pack, new Ledger(ledgerPath));

const server = new McpServer({ name: "skillable", version: "0.1.0" });

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function run<T>(fn: () => T) {
  try {
    return ok(fn());
  } catch (e) {
    const msg = e instanceof RuntimeError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { isError: true, content: [{ type: "text" as const, text: msg }] };
  }
}

server.registerTool(
  "todays_lens",
  {
    title: "Today's lens",
    description:
      "Orientation for the Command & Keep campaign: the day, the lens, available missions, due reviews and progress. Call first. If the campaign has not started it returns the contract; call again with `intensity` to begin.",
    inputSchema: {
      intensity: z.enum(["guided", "adaptive", "immersive"]).optional().describe("Starts the campaign when it has not started"),
      learner_name: z.string().optional(),
      pause: z.boolean().optional().describe("true to pause recording, false to resume"),
    },
  },
  async ({ intensity, learner_name, pause }) =>
    run(() => {
      if (pause !== undefined) runtime.pause(pause);
      return runtime.todaysLens({ intensity, learner_name });
    }),
);

server.registerTool(
  "start_mission",
  {
    title: "Start a mission",
    description:
      "Opens an attempt and returns the mission brief, the rubric(s), misconceptions to watch and the coaching constraints. Use `review:<capability>` for a spaced review. Returns an error if the mission is not yet unlocked.",
    inputSchema: {
      mission_id: z.string(),
      context: z.string().optional().describe("The learner's real situation, e.g. 'weekly vendor report', or 'scenario' for the fallback"),
    },
  },
  async ({ mission_id, context }) => run(() => runtime.startMission(mission_id, context)),
);

server.registerTool(
  "submit_evidence",
  {
    title: "Submit evidence",
    description:
      "Records what the learner produced for an attempt, with your rubric scores (every dimension of every capability in the attempt), hints used, whether you did any of the work, the learner's confidence and any misconceptions observed. Writes the evidence ledger.",
    inputSchema: {
      attempt_id: z.string(),
      evidence_type: z.string().describe("e.g. artifact, structured_decision, artifact_annotation, reflection, final_scenario_score"),
      evidence: z.string().describe("The learner's output verbatim, or a faithful summary of an artifact"),
      artifact_ref: z.string().optional(),
      context: z.string().optional(),
      hints_used: z.number().int().min(0),
      assisted_by_agent: z.boolean().describe("true if you contributed any of the substance"),
      confidence: z.number().int().min(1).max(5).optional().describe("Learner's own confidence, 1–5"),
      scores: z
        .array(
          z.object({
            capability: z.string(),
            dimension: z.string(),
            level: z.number().int().min(1).max(4),
            rationale: z.string().describe("One line a human could check"),
          }),
        )
        .min(1),
      misconceptions: z.array(z.string()).optional().describe("Misconception ids observed"),
      offer_taken: z.boolean().optional().describe("Keep missions: did the learner accept the agent's offer to do it?"),
    },
  },
  async (input) => run(() => runtime.submitEvidence(input)),
);

server.registerTool(
  "get_feedback",
  {
    title: "Get feedback",
    description: "Structured feedback for a submitted attempt: levels per dimension, weakest dimension and next anchor, delta from the previous attempt, misconception repairs, capability progress against the evidence rules, and the suggested next step.",
    inputSchema: { attempt_id: z.string() },
  },
  async ({ attempt_id }) => run(() => runtime.getFeedback(attempt_id)),
);

server.registerTool(
  "due_reviews",
  {
    title: "Due reviews",
    description: "Spaced-retrieval reviews due today (and the next few upcoming). Each has a prompt and the mission id to start it with.",
    inputSchema: {},
  },
  async () => run(() => runtime.dueReviews()),
);

server.registerTool(
  "credential_status",
  {
    title: "Credential status",
    description: "What the learner can prove: per-capability evidence against the rules, what is missing, strongest and weakest, and an Open Badges 3.0 preview. Read it honestly.",
    inputSchema: {},
  },
  async () => run(() => runtime.credentialStatus()),
);

server.registerResource(
  "skill",
  "skillable://pack/SKILL.md",
  { title: "Coach instructions", description: "The pack's SKILL.md", mimeType: "text/markdown" },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: pack.skill.body }] }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`skillable mcp: pack '${pack.skill.name}' (${Object.keys(pack.missions).length} missions), ledger ${ledgerPath}`);
