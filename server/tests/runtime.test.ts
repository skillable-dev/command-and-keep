import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadPack, validatePack, type Pack } from "../src/pack.js";
import { Ledger, emptyLedger } from "../src/ledger.js";
import { Runtime, RuntimeError, type ScoreInput } from "../src/runtime.js";

const here = dirname(fileURLToPath(import.meta.url));
const PACK = join(here, "..", "..", "skills", "command-and-keep");

function fixedClock(start = "2026-09-01T09:00:00Z") {
  let t = new Date(start);
  return { now: () => t, advance: (days: number) => (t = new Date(t.getTime() + days * 86_400_000)) };
}

function fullScores(pack: Pack, caps: string[], level = 3): ScoreInput[] {
  return caps.flatMap((cid) => pack.rubrics[cid].dimensions.map((d) => ({ capability: cid, dimension: d.id, level, rationale: `test ${cid}.${d.id}` })));
}

function fresh() {
  const pack = loadPack(PACK);
  const clock = fixedClock();
  const rt = new Runtime(pack, new Ledger(null, emptyLedger("test")), clock.now);
  return { pack, rt, clock };
}

test("the real pack passes every automated structural publishing gate", () => {
  const pack = loadPack(PACK);
  assert.deepEqual(validatePack(pack), []);
  assert.equal(pack.capabilities.length, 12);
  assert.equal(Object.keys(pack.missions).length, 27);
  assert.equal(Object.values(pack.missions).filter((mission) => mission.kind === "transfer").length, 12);
});

test("before start, todays_lens returns the contract; with intensity it starts on day 0", () => {
  const { rt } = fresh();
  const first = rt.todaysLens();
  assert.equal(first.state, "not_started");
  assert.match((first as { contract: string }).contract, /pause/);
  const started = rt.todaysLens({ intensity: "adaptive" });
  assert.equal(started.state, "active");
  const s = started as Extract<ReturnType<Runtime["todaysLens"]>, { state: "active" }>;
  assert.equal(s.day, 0);
  assert.deepEqual(s.available_missions.map((m) => m.id), ["d0-diagnostic"]);
  assert.throws(() => rt.startMission("d1-brief-a-real-task"), /unlocks on day 1/);
});

test("diagnostic → submit → feedback, reviews scheduled, unaided recorded", () => {
  const { rt, pack, clock } = fresh();
  const start = rt.startMission("d0-diagnostic");
  assert.equal(start.mission.unaided_required, true);
  assert.equal(start.constraints.hint_budget, 0);
  assert.equal(start.rubrics.length, 3);

  assert.throws(
    () => rt.submitEvidence({ attempt_id: start.attempt_id, evidence_type: "artifact", evidence: "x", hints_used: 0, assisted_by_agent: false, scores: fullScores(pack, ["brief"]) }),
    /Missing scores for: verify\./,
  );

  const sub = rt.submitEvidence({
    attempt_id: start.attempt_id,
    evidence_type: "artifact",
    evidence: "brief: ...; verify: the 31% claim; judgment: ship, rests on ...",
    hints_used: 0,
    assisted_by_agent: false,
    confidence: 3,
    context: "scenario",
    scores: fullScores(pack, ["brief", "verify", "judgment"], 2),
    misconceptions: ["brief.vague-done"],
  });
  assert.equal(sub.unaided, true);
  assert.equal(rt.ledger.data.reviews.filter((r) => r.capability_id === "brief").length, 3);
  assert.deepEqual(
    rt.ledger.data.reviews.filter((r) => r.capability_id === "brief").map((r) => r.due_on),
    ["2026-09-02", "2026-09-04", "2026-09-08"],
  );

  const fb = rt.getFeedback(start.attempt_id);
  assert.equal(fb.capabilities.length, 3);
  assert.equal(fb.misconception_repairs[0].id, "brief.vague-done");
  assert.equal(fb.suggested_next.kind, "repair");
  assert.equal(rt.ledger.findAttempt(start.attempt_id)!.feedback_delivered, true);

  clock.advance(1);
  const lens = rt.todaysLens() as Extract<ReturnType<Runtime["todaysLens"]>, { state: "active" }>;
  assert.equal(lens.day, 1);
  assert.equal(lens.due_reviews, 3);
  assert.ok(lens.available_missions.some((m) => m.id === "d1-brief-a-real-task"));

  const due = rt.dueReviews();
  assert.equal(due.due.length, 3);
  const rv = rt.startMission("review:brief");
  assert.equal(rv.mission.kind, "review");
  rt.submitEvidence({ attempt_id: rv.attempt_id, evidence_type: "structured_decision", evidence: "brief in three lines", hints_used: 0, assisted_by_agent: false, scores: fullScores(pack, ["brief"], 3) });
  assert.equal(rt.dueReviews().due.length, 2);
  assert.equal(rt.ledger.data.reviews.filter((r) => r.capability_id === "brief" && r.done_attempt_id).length, 1);
});

test("hints on an unaided mission are recorded and the attempt does not count as unaided", () => {
  const { rt, pack } = fresh();
  const start = rt.startMission("d0-diagnostic");
  const sub = rt.submitEvidence({ attempt_id: start.attempt_id, evidence_type: "artifact", evidence: "x", hints_used: 2, assisted_by_agent: false, scores: fullScores(pack, ["brief", "verify", "judgment"]) });
  assert.equal(sub.unaided, false);
  assert.equal(sub.integrity_notes.length, 1);
  const status = rt.credentialStatus();
  assert.equal(status.eligible, false);
  const brief = status.capabilities.find((c) => c.capability === "brief")!;
  assert.equal(brief.attempts, 1);
  assert.equal(brief.unaided_attempts, 0);
  assert.ok(status.missing.some((m) => /capstone/.test(m)));
});

test("adaptive learners unlock one day ahead once today is done; guided learners do not", () => {
  for (const intensity of ["adaptive", "guided"] as const) {
    const { rt, pack, clock } = fresh();
    rt.todaysLens({ intensity });
    const d0 = rt.startMission("d0-diagnostic");
    rt.submitEvidence({ attempt_id: d0.attempt_id, evidence_type: "artifact", evidence: "x", hints_used: 0, assisted_by_agent: false, scores: fullScores(pack, ["brief", "verify", "judgment"]) });
    const lens = rt.todaysLens() as Extract<ReturnType<Runtime["todaysLens"]>, { state: "active" }>;
    const ids = lens.available_missions.map((m) => m.id);
    if (intensity === "adaptive") assert.deepEqual(ids, ["d1-brief-a-real-task"]);
    else assert.deepEqual(ids, []);
    clock.advance(1);
    assert.ok((rt.todaysLens() as { available_missions: { id: string }[] }).available_missions.some((m) => m.id === "d1-brief-a-real-task"));
  }
});

test("capstone requires human review; a full campaign becomes eligible pending that review", () => {
  const { rt, pack, clock } = fresh();
  rt.todaysLens({ intensity: "adaptive" });
  // Walk the calendar, doing every mission the day it unlocks, twice in different contexts for evidence rules.
  for (let day = 0; day <= 14; day++) {
    const lens = rt.todaysLens() as Extract<ReturnType<Runtime["todaysLens"]>, { state: "active" }>;
    for (const m of lens.available_missions) {
      if (m.day !== day) continue;
      const a = rt.startMission(m.id, "context-a");
      rt.submitEvidence({ attempt_id: a.attempt_id, evidence_type: "artifact", evidence: `evidence for ${m.id}`, hints_used: 0, assisted_by_agent: false, scores: fullScores(pack, a.mission.capabilities, 3) });
      if (m.kind === "mission") {
        const b = rt.startMission(m.id, "context-b");
        rt.submitEvidence({ attempt_id: b.attempt_id, evidence_type: "artifact", evidence: `second evidence for ${m.id}`, hints_used: 0, assisted_by_agent: false, scores: fullScores(pack, b.mission.capabilities, 3) });
      }
    }
    for (const r of rt.dueReviews().due) {
      const a = rt.startMission(r.start_with, "review");
      rt.submitEvidence({ attempt_id: a.attempt_id, evidence_type: "structured_decision", evidence: "review answer", hints_used: 0, assisted_by_agent: false, scores: fullScores(pack, [r.capability], 3) });
    }
    clock.advance(1);
  }
  const capstone = rt.ledger.data.attempts.find((a) => a.mission_id === "d13-the-incident")!;
  assert.equal(capstone.human_review_required, true);
  const status = rt.credentialStatus();
  assert.equal(status.capstone_completed, true);
  assert.equal(status.retrospective_completed, true);
  assert.equal(status.capabilities_met, 12);
  assert.ok(status.human_review_pending >= 1);
  assert.equal(status.eligible, false);
  assert.equal(status.eligible_pending_human_review, true);
  assert.equal(status.badge_preview.credentialSubject.evidence.length, 12);
});

test("errors are RuntimeErrors with actionable messages", () => {
  const { rt } = fresh();
  assert.throws(() => rt.startMission("d1-brief-a-real-task"), RuntimeError);
  assert.throws(() => rt.getFeedback("nope"), /Unknown attempt/);
  rt.todaysLens({ intensity: "adaptive" });
  assert.throws(() => rt.startMission("does-not-exist"), /Unknown mission/);
});
