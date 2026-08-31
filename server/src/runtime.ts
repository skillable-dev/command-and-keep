// The six operations. Pure over (pack, ledger, clock) so they can be tested without MCP.
import { createHash } from "node:crypto";
import type { Pack, Mission, Level, Capability } from "./pack.js";
import { Ledger, isoDate, addDays, daysBetween, type Attempt, type Score } from "./ledger.js";

export class RuntimeError extends Error {}

export interface ScoreInput {
  capability: string;
  dimension: string;
  level: number;
  rationale: string;
}

export interface SubmitInput {
  attempt_id: string;
  evidence_type: string;
  evidence: string;
  artifact_ref?: string;
  context?: string;
  hints_used: number;
  assisted_by_agent: boolean;
  confidence?: number;
  scores: ScoreInput[];
  misconceptions?: string[];
  offer_taken?: boolean;
}

const REVIEW_PREFIX = "review:";

export class Runtime {
  constructor(
    public pack: Pack,
    public ledger: Ledger,
    public clock: () => Date = () => new Date(),
  ) {}

  today(): string {
    return isoDate(this.clock());
  }

  /** Calendar day of the campaign: 0 on the start day. null if not started. */
  campaignDay(): number | null {
    const c = this.ledger.data.campaign;
    if (!c) return null;
    return Math.min(daysBetween(c.started_on, this.today()), this.pack.campaign.duration_days);
  }

  private capability(id: string): Capability {
    const c = this.pack.capabilities.find((x) => x.id === id);
    if (!c) throw new RuntimeError(`Unknown capability '${id}'`);
    return c;
  }

  private reviewMission(capId: string): Mission {
    const c = this.capability(capId);
    return {
      id: `${REVIEW_PREFIX}${capId}`,
      title: `Review: ${c.name}`,
      kind: "review",
      day: 0,
      capability: capId,
      capabilities: [capId],
      template: "prove",
      minutes: 3,
      unaided_required: true,
      transfer_distance: 1,
      evidence: ["structured_decision"],
      contexts: ["manual"],
      body: `## Unaided retrieval (no hints)\n${c.review_prompt}\n\nScore on the '${capId}' rubric. Keep it under three minutes.`,
    };
  }

  private mission(id: string): Mission {
    if (id.startsWith(REVIEW_PREFIX)) return this.reviewMission(id.slice(REVIEW_PREFIX.length));
    const m = this.pack.missions[id];
    if (!m) throw new RuntimeError(`Unknown mission '${id}'. Call todays_lens for the list of available missions.`);
    return m;
  }

  /** Day up to which missions are unlocked. Adaptive/immersive learners may run one day ahead once today is done. */
  private effectiveDay(): number {
    const day = this.campaignDay();
    if (day === null) return -1;
    const c = this.ledger.data.campaign!;
    if (c.intensity === "guided") return day;
    const dueToday = Object.values(this.pack.missions).filter((m) => m.day <= day);
    const allDone = dueToday.every((m) => this.ledger.completed(m.id));
    return allDone && day < this.pack.campaign.duration_days ? day + 1 : day;
  }

  private availableMissions(): Mission[] {
    const eff = this.effectiveDay();
    return Object.values(this.pack.missions)
      .filter((m) => m.day <= eff && !this.ledger.completed(m.id))
      .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  }

  private dueReviewItems() {
    const today = this.today();
    return this.ledger.data.reviews.filter((r) => !r.done_attempt_id && r.due_on <= today);
  }

  private progressSnapshot(nextStep: string) {
    const day = this.campaignDay();
    const submitted = this.ledger.data.attempts.filter((a) => a.submitted_at);
    const capsWithEvidence = new Set(submitted.flatMap((a) => a.capabilities));
    const ofDays = this.pack.campaign.duration_days;
    const ofCapabilities = this.pack.capabilities.length;
    const position = day === null
      ? `Not started — ${ofDays} days when you choose to begin`
      : day === 0
      ? `Diagnostic — before Day 1 of ${ofDays}`
      : `Day ${day} of ${ofDays}`;
    const attemptWord = submitted.length === 1 ? "attempt" : "attempts";
    const capabilityVerb = capsWithEvidence.size === 1 ? "has" : "have";

    return {
      campaign_position: { day, of_days: ofDays, label: position },
      attempts: submitted.length,
      recorded_attempts: submitted.length,
      capabilities_with_evidence: capsWithEvidence.size,
      of_capabilities: ofCapabilities,
      next_step: nextStep,
      summary:
        `${position}. ${submitted.length} recorded ${attemptWord}; ${capsWithEvidence.size} of ${ofCapabilities} capabilities ${capabilityVerb} evidence. Next: ${nextStep}`,
      proof_note:
        "Campaign day is journey position, not proof. Evidence means work is recorded; it does not by itself mean passed, verified, credentialed, or human-reviewed.",
    };
  }

  // ---------------------------------------------------------------- 1. todays_lens
  todaysLens(opts: { intensity?: string; learner_name?: string } = {}) {
    const { campaign: cfg, contract } = { campaign: this.pack.campaign, contract: this.pack.campaign.contract };
    if (opts.learner_name) this.ledger.data.learner.name = opts.learner_name;

    if (!this.ledger.data.campaign) {
      if (!opts.intensity) {
        return {
          state: "not_started" as const,
          campaign: { id: cfg.id, title: cfg.title, duration_days: cfg.duration_days },
          contract,
          intensities: cfg.intensities,
          default_intensity: cfg.default_intensity,
          progress: this.progressSnapshot("Choose an intensity, or leave without starting."),
          instructions:
            "Read the contract to the learner in your own words. Ask which intensity they want. Then call todays_lens again with `intensity`, and start the diagnostic with start_mission('" +
            cfg.diagnostic +
            "').",
        };
      }
      if (!cfg.intensities.includes(opts.intensity)) {
        throw new RuntimeError(`Unknown intensity '${opts.intensity}'. Choose one of: ${cfg.intensities.join(", ")}`);
      }
      this.ledger.data.campaign = { pack_id: cfg.id, started_on: this.today(), intensity: opts.intensity, paused: false };
      this.ledger.save();
    }

    const c = this.ledger.data.campaign;
    if (c.paused) {
      return {
        state: "paused" as const,
        day: this.campaignDay()!,
        of_days: cfg.duration_days,
        intensity: c.intensity,
        progress: this.progressSnapshot("Resume when you choose; nothing advances while paused."),
        instructions: "The campaign is paused. Nothing is recorded until the learner asks to resume.",
      };
    }
    const day = this.campaignDay()!;
    const available = this.availableMissions();
    const due = this.dueReviewItems();
    const safety = this.pack.safety as { max_prompts_per_day?: number; permitted_hours?: string };
    const nextStep = due.length > 0
      ? `Complete ${due.length} due review${due.length === 1 ? "" : "s"} first.`
      : available.length > 0
      ? `Choose one eligible mission: ${available[0].title}.`
      : "Nothing new is unlocked; wait or re-attempt one capability in a new context.";

    return {
      state: "active" as const,
      day,
      of_days: cfg.duration_days,
      intensity: c.intensity,
      lens: this.pack.lenses[day] ?? this.pack.lenses[cfg.duration_days],
      half: day === 0 ? "diagnostic" : day <= cfg.halves.command.days[1] ? "command" : day <= cfg.halves.keep.days[1] ? "keep" : "prove",
      available_missions: available.map((m) => ({
        id: m.id,
        title: m.title,
        kind: m.kind,
        day: m.day,
        minutes: m.minutes,
        unaided_required: m.unaided_required,
        capability: m.capability,
      })),
      in_progress: this.ledger.inProgress().map((a) => ({ attempt_id: a.id, mission_id: a.mission_id, started_at: a.started_at })),
      due_reviews: due.length,
      progress: this.progressSnapshot(nextStep),
      budget: { max_prompts_per_day: safety.max_prompts_per_day, permitted_hours: safety.permitted_hours },
      instructions: [
        due.length > 0 ? `Run the ${due.length} due review(s) first via due_reviews.` : null,
        available.length > 0
          ? `Offer one mission only. Shortest first if the learner is short of time. Start it with start_mission.`
          : `Nothing new is unlocked today. Offer a review or a re-attempt of a mission in a new context.`,
        `The learner can say "pause", "reality check" or "what have you stored" at any time.`,
      ].filter(Boolean),
    };
  }

  // ---------------------------------------------------------------- 2. start_mission
  startMission(missionId: string, context?: string) {
    if (!this.ledger.data.campaign) {
      if (missionId === this.pack.campaign.diagnostic) {
        this.todaysLens({ intensity: this.pack.campaign.default_intensity });
      } else {
        throw new RuntimeError("The campaign has not started. Call todays_lens first.");
      }
    }
    if (this.ledger.data.campaign!.paused) throw new RuntimeError("The campaign is paused.");

    const m = this.mission(missionId);
    if (m.kind !== "review") {
      const eff = this.effectiveDay();
      if (m.day > eff) {
        throw new RuntimeError(`'${m.id}' unlocks on day ${m.day}; today is day ${this.campaignDay()}. Offer an available mission instead.`);
      }
    }
    const open = this.ledger.inProgress().find((a) => a.mission_id === m.id);
    if (open) {
      return this.startPayload(m, open, context, true);
    }

    const rules = this.pack.evidenceRules;
    const attempt: Attempt = {
      id: this.ledger.newId(),
      mission_id: m.id,
      capability_id: m.capability,
      capabilities: m.capabilities,
      kind: m.kind,
      started_at: this.clock().toISOString(),
      context,
      hints_used: 0,
      assisted_by_agent: false,
      unaided: m.unaided_required,
      evaluator: "agent",
      human_review_required: m.kind === "capstone" && rules.credential.human_sampling.capstone,
      human_reviewed: false,
      transfer_distance: m.transfer_distance,
      feedback_delivered: false,
    };
    this.ledger.data.attempts.push(attempt);
    this.ledger.save();
    return this.startPayload(m, attempt, context, false);
  }

  private startPayload(m: Mission, attempt: Attempt, context: string | undefined, resumed: boolean) {
    const rules = this.pack.evidenceRules;
    const unaided = m.unaided_required || rules.unaided_kinds.includes(m.kind);
    return {
      attempt_id: attempt.id,
      resumed,
      mission: {
        id: m.id,
        title: m.title,
        kind: m.kind,
        day: m.day,
        minutes: m.minutes,
        capabilities: m.capabilities,
        unaided_required: unaided,
        fallback_scenario: m.fallback_scenario,
        evidence_expected: m.evidence,
        body: m.body,
      },
      context: context ?? attempt.context ?? null,
      rubrics: m.capabilities.map((cid) => this.pack.rubrics[cid]),
      misconceptions_to_watch: this.pack.misconceptions
        .filter((mc) => m.capabilities.includes(mc.capability))
        .map((mc) => ({ id: mc.id, tell: mc.tell })),
      constraints: {
        hint_budget: unaided ? 0 : rules.hint_budget_per_mission,
        unaided_required: unaided,
        never_do_the_task: true,
        ask_before_you_tell: true,
        score_strictly: "Level 2 is the default for competent-but-generic work; level 3 requires the anchor behaviours.",
      },
      next: "Deliver the brief in two or three sentences. Ask for the real context. When the learner has produced evidence, call submit_evidence with every rubric dimension scored.",
    };
  }

  // ---------------------------------------------------------------- 3. submit_evidence
  submitEvidence(input: SubmitInput) {
    const a = this.ledger.findAttempt(input.attempt_id);
    if (!a) throw new RuntimeError(`Unknown attempt '${input.attempt_id}'`);
    if (a.submitted_at) throw new RuntimeError(`Attempt '${a.id}' was already submitted.`);
    if (!input.evidence || !input.evidence.trim()) throw new RuntimeError("Evidence must not be empty. Record what the learner actually produced.");

    // Every dimension of every capability in the attempt must be scored.
    const scores: Record<string, Score> = {};
    const missing: string[] = [];
    for (const cid of a.capabilities) {
      const r = this.pack.rubrics[cid];
      for (const d of r.dimensions) {
        const s = input.scores.find((x) => x.capability === cid && x.dimension === d.id);
        if (!s) missing.push(`${cid}.${d.id}`);
        else {
          if (![1, 2, 3, 4].includes(s.level)) throw new RuntimeError(`Level for ${cid}.${d.id} must be 1–4`);
          if (!s.rationale?.trim()) throw new RuntimeError(`Rationale missing for ${cid}.${d.id}; a human must be able to check it.`);
          scores[`${cid}.${d.id}`] = { level: s.level as Level, rationale: s.rationale };
        }
      }
    }
    if (missing.length) throw new RuntimeError(`Missing scores for: ${missing.join(", ")}`);
    for (const s of input.scores) {
      if (!a.capabilities.includes(s.capability)) throw new RuntimeError(`Capability '${s.capability}' is not part of this attempt`);
    }
    const knownMc = new Set(this.pack.misconceptions.map((m) => m.id));
    for (const id of input.misconceptions ?? []) {
      if (!knownMc.has(id)) throw new RuntimeError(`Unknown misconception id '${id}'`);
    }

    const m = this.mission(a.mission_id);
    const rules = this.pack.evidenceRules;
    const mustBeUnaided = m.unaided_required || rules.unaided_kinds.includes(m.kind);
    const unaided = input.hints_used === 0 && !input.assisted_by_agent;
    const integrity: string[] = [];
    if (mustBeUnaided && !unaided) integrity.push("This attempt required no assistance but hints or agent work were recorded; it will not count as unaided evidence.");
    if (input.hints_used > rules.hint_budget_per_mission) integrity.push(`Hint budget (${rules.hint_budget_per_mission}) exceeded.`);

    a.submitted_at = this.clock().toISOString();
    a.context = input.context ?? a.context ?? "manual";
    a.hints_used = input.hints_used;
    a.assisted_by_agent = input.assisted_by_agent;
    a.unaided = unaided;
    a.evidence = { type: input.evidence_type, content: input.evidence, artifact_ref: input.artifact_ref };
    a.confidence = input.confidence;
    a.scores = scores;
    a.misconceptions = input.misconceptions ?? [];
    a.offer_taken = input.offer_taken;
    if (!a.human_review_required && rules.credential.human_sampling.rate > 0 && a.kind !== "review") {
      const h = parseInt(createHash("sha256").update(a.id).digest("hex").slice(0, 8), 16) % 100;
      a.human_review_required = h < rules.credential.human_sampling.rate * 100;
    }

    // Spaced review: schedule for each capability, unless one is already pending.
    if (a.kind !== "review") {
      for (const cid of a.capabilities) {
        const pending = this.ledger.data.reviews.some((r) => r.capability_id === cid && !r.done_attempt_id);
        if (pending) continue;
        for (const d of rules.review_schedule_days) {
          this.ledger.data.reviews.push({
            id: this.ledger.newId(),
            capability_id: cid,
            due_on: addDays(this.today(), d),
            scheduled_from_attempt: a.id,
          });
        }
      }
    } else {
      const item = this.ledger.data.reviews
        .filter((r) => r.capability_id === a.capability_id && !r.done_attempt_id && r.due_on <= this.today())
        .sort((x, y) => x.due_on.localeCompare(y.due_on))[0];
      if (item) item.done_attempt_id = a.id;
    }
    this.ledger.save();

    return {
      recorded: true,
      attempt_id: a.id,
      unaided,
      human_review_required: a.human_review_required,
      integrity_notes: integrity,
      progress: this.progressSnapshot("Get feedback for this recorded attempt."),
      next: "Call get_feedback and deliver it in the required order.",
    };
  }

  // ---------------------------------------------------------------- 4. get_feedback
  getFeedback(attemptId: string) {
    const a = this.ledger.findAttempt(attemptId);
    if (!a) throw new RuntimeError(`Unknown attempt '${attemptId}'`);
    if (!a.submitted_at || !a.scores) throw new RuntimeError("Submit evidence before asking for feedback.");

    const perCapability = a.capabilities.map((cid) => {
      const r = this.pack.rubrics[cid];
      const dims = r.dimensions.map((d) => {
        const s = a.scores![`${cid}.${d.id}`];
        return { dimension: d.id, name: d.name, level: s.level, rationale: s.rationale, next_anchor: s.level < 4 ? d.levels[(s.level + 1) as Level] : null };
      });
      const weakest = [...dims].sort((x, y) => x.level - y.level)[0];
      const strongest = [...dims].sort((x, y) => y.level - x.level)[0];
      const previous = this.ledger
        .attemptsFor(cid)
        .filter((p) => p.id !== a.id && p.submitted_at! < a.submitted_at!)
        .sort((x, y) => y.submitted_at!.localeCompare(x.submitted_at!))[0];
      const delta = previous
        ? dims.map((d) => ({ dimension: d.dimension, from: previous.scores?.[`${cid}.${d.dimension}`]?.level ?? null, to: d.level }))
        : null;
      return {
        capability: cid,
        name: this.capability(cid).name,
        level: Math.min(...dims.map((d) => d.level)),
        dimensions: dims,
        strongest: strongest.level >= 3 ? strongest : null,
        weakest,
        delta_from_previous: delta,
        progress: this.capabilityProgress(cid),
      };
    });

    const repairs = (a.misconceptions ?? []).map((id) => {
      const mc = this.pack.misconceptions.find((m) => m.id === id)!;
      return { id, tell: mc.tell, repair: mc.repair };
    });

    const primary = perCapability[0];
    const allGood = perCapability.every((c) => c.level >= 3) && a.unaided;
    let suggestion: { kind: string; mission_id?: string; why: string };
    const transfer = Object.values(this.pack.missions).find(
      (m) => m.kind === "transfer" && m.capabilities.includes(primary.capability) && !this.ledger.completed(m.id) && m.day <= this.effectiveDay(),
    );
    if (allGood && transfer) {
      suggestion = { kind: "transfer", mission_id: transfer.id, why: "All dimensions at level 3+ and unaided: try the same capability under different conditions." };
    } else if (repairs.length > 0) {
      suggestion = { kind: "repair", mission_id: a.mission_id, why: `Repair first: ${repairs[0].repair} Then retry in a different context.` };
    } else if (primary.level < 3) {
      suggestion = { kind: "retry", mission_id: a.mission_id, why: `Weakest dimension is '${primary.weakest.name}'. Retry the mission in a new context aiming at: ${primary.weakest.next_anchor}` };
    } else {
      const next = this.availableMissions().find((m) => m.id !== a.mission_id);
      suggestion = { kind: "next", mission_id: next?.id, why: next ? "Good. Move on." : "Good. Nothing more unlocks today." };
    }

    a.feedback_delivered = true;
    this.ledger.save();

    return {
      attempt_id: a.id,
      mission_id: a.mission_id,
      unaided: a.unaided,
      hints_used: a.hints_used,
      capabilities: perCapability,
      misconception_repairs: repairs,
      suggested_next: suggestion,
      delivery_rules: [
        "1. One thing that met level 3+, and why, quoting the learner.",
        "2. The weakest dimension and the gap to the next anchor.",
        "3. One concrete thing to try (the suggested next step).",
        "Under 150 words. No praise inflation. State the levels plainly.",
      ],
    };
  }

  // ---------------------------------------------------------------- 5. due_reviews
  dueReviews() {
    const today = this.today();
    const due = this.dueReviewItems().map((r) => {
      const c = this.capability(r.capability_id);
      return {
        review_id: r.id,
        capability: c.id,
        name: c.name,
        due_on: r.due_on,
        overdue_days: daysBetween(r.due_on, today),
        prompt: c.review_prompt,
        start_with: `${REVIEW_PREFIX}${c.id}`,
      };
    });
    const upcoming = this.ledger.data.reviews
      .filter((r) => !r.done_attempt_id && r.due_on > today)
      .sort((x, y) => x.due_on.localeCompare(y.due_on))
      .slice(0, 5)
      .map((r) => ({ capability: r.capability_id, due_on: r.due_on }));
    return {
      due,
      upcoming,
      instructions:
        due.length === 0
          ? "No reviews due."
          : "Run each review unaided and under three minutes: start_mission with `start_with`, ask the prompt, then submit_evidence with the answer verbatim and rubric scores.",
    };
  }

  // ---------------------------------------------------------------- 6. credential_status
  private capabilityProgress(cid: string) {
    const rules = this.pack.evidenceRules.per_capability;
    const attempts = this.ledger.attemptsFor(cid);
    const levelOf = (a: Attempt) => {
      const r = this.pack.rubrics[cid];
      return Math.min(...r.dimensions.map((d) => a.scores?.[`${cid}.${d.id}`]?.level ?? 1));
    };
    const unaided = attempts.filter((a) => a.unaided);
    const contexts = new Set(attempts.map((a) => a.context ?? "manual"));
    const best = attempts.length ? Math.max(...attempts.map(levelOf)) : 0;
    const bestUnaided = unaided.length ? Math.max(...unaided.map(levelOf)) : 0;
    const sorted = [...attempts].sort((x, y) => x.submitted_at!.localeCompare(y.submitted_at!));
    const latest = sorted.length ? levelOf(sorted[sorted.length - 1]) : 0;
    const checks = {
      attempts: { have: attempts.length, need: rules.min_attempts, met: attempts.length >= rules.min_attempts },
      unaided_attempts: { have: unaided.length, need: rules.min_unaided_attempts, met: unaided.length >= rules.min_unaided_attempts },
      distinct_contexts: { have: contexts.size, need: rules.min_distinct_contexts, met: contexts.size >= rules.min_distinct_contexts },
      unaided_level: { have: bestUnaided, need: rules.min_level, met: bestUnaided >= rules.min_level },
    };
    return {
      capability: cid,
      attempts: attempts.length,
      unaided_attempts: unaided.length,
      contexts: [...contexts],
      best_level: best,
      best_unaided_level: bestUnaided,
      latest_level: latest,
      hint_trend: sorted.length ? { first: sorted[0].hints_used, last: sorted[sorted.length - 1].hints_used } : null,
      checks,
      met: Object.values(checks).every((c) => c.met),
    };
  }

  credentialStatus() {
    const rules = this.pack.evidenceRules.credential;
    const caps = this.pack.capabilities.map((c) => ({ name: c.name, half: c.half, ...this.capabilityProgress(c.id) }));
    const met = caps.filter((c) => c.met);
    const capstoneDone = this.ledger.completed(rules.capstone_required);
    const retroDone = this.ledger.completed(rules.retrospective_required);
    const pendingHuman = this.ledger.data.attempts.filter((a) => a.submitted_at && a.human_review_required && !a.human_reviewed);
    const missing: string[] = [];
    if (met.length < rules.min_capabilities_met) missing.push(`${rules.min_capabilities_met - met.length} more capabilities need to meet the evidence rules`);
    if (!capstoneDone) missing.push(`capstone '${rules.capstone_required}' not completed`);
    if (!retroDone) missing.push(`retrospective '${rules.retrospective_required}' not completed`);
    const evidenceComplete = missing.length === 0;
    if (pendingHuman.length) missing.push(`${pendingHuman.length} attempt(s) await human review`);

    const strongest = [...caps].sort((x, y) => y.best_unaided_level - x.best_unaided_level || y.unaided_attempts - x.unaided_attempts).slice(0, 2);
    const weakest = [...caps].sort((x, y) => x.best_unaided_level - y.best_unaided_level || x.attempts - y.attempts).slice(0, 2);
    const cred = this.pack.credential as { name?: string; claims?: string; open_badges?: Record<string, unknown> };

    return {
      eligible: missing.length === 0,
      eligible_pending_human_review: evidenceComplete,
      capabilities_met: met.length,
      capabilities_total: caps.length,
      capstone_completed: capstoneDone,
      retrospective_completed: retroDone,
      human_review_pending: pendingHuman.length,
      missing,
      strongest: strongest.map((c) => c.capability),
      weakest: weakest.map((c) => c.capability),
      capabilities: caps,
      badge_preview: {
        "@context": ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"],
        type: ["VerifiableCredential", "OpenBadgeCredential"],
        name: cred.name,
        credentialSubject: {
          type: ["AchievementSubject"],
          achievement: { type: ["Achievement"], name: cred.name, description: cred.claims, achievementType: "Competency" },
          evidence: caps
            .filter((c) => c.attempts > 0)
            .map((c) => ({
              type: ["Evidence"],
              name: c.name,
              description: `${c.attempts} attempt(s), ${c.unaided_attempts} unaided, ${c.contexts.length} context(s), best unaided level ${c.best_unaided_level}/4`,
              evaluator: "agent",
            })),
        },
        honest_note: "AI-evaluated against an expert-authored rubric. Not human-verified unless stated. Preview only; issuance requires the missing items above.",
      },
    };
  }

  // ---------------------------------------------------------------- learner controls
  pause(paused: boolean) {
    if (!this.ledger.data.campaign) throw new RuntimeError("No campaign to pause.");
    this.ledger.data.campaign.paused = paused;
    this.ledger.save();
    return { paused };
  }
}
