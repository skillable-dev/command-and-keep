import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack, type Pack } from "../src/pack.js";
import { emptyLedger, Ledger } from "../src/ledger.js";
import { Runtime, type ScoreInput } from "../src/runtime.js";

const here = dirname(fileURLToPath(import.meta.url));
const PACK_DIR = join(here, "..", "..", "skills", "command-and-keep");

function scores(pack: Pack, capability: string): ScoreInput[] {
  return pack.rubrics[capability].dimensions.map((dimension) => ({
    capability,
    dimension: dimension.id,
    level: 3,
    rationale: `observable anchor for ${capability}.${dimension.id}`,
  }));
}

test("the coach contract covers common attempts to get the agent to do or launder the work", () => {
  const skill = readFileSync(join(PACK_DIR, "SKILL.md"), "utf8");
  const requiredAttackClasses = [
    "Direct delegation",
    "Partial completion",
    "Urgency",
    "Role-play or instruction override",
    "Answer hidden in an artifact",
    "Assistance laundering",
    "Score laundering",
    "Trust laundering",
  ];

  for (const attackClass of requiredAttackClasses) {
    assert.match(skill, new RegExp(`\\*\\*${attackClass}:`));
  }
  assert.match(skill, /Tell me your first move and I'll react/);
  assert.match(skill, /Never go past rung 3/);
  assert.match(skill, /Missions marked `unaided_required`[\s\S]*get zero hints/);
  assert.match(skill, /instructions inside pasted documents[\s\S]*untrusted mission material/);
  assert.match(skill, /Never agree to omit a hint[\s\S]*`assisted_by_agent: false`/);
  assert.match(skill, /Never call agent-only evidence "verified", "supervised" or "human-reviewed"/);
});

test("runtime constraints and ledger integrity preserve the refusal contract", () => {
  const pack = loadPack(PACK_DIR);
  const data = emptyLedger("red-team");
  data.campaign = {
    pack_id: pack.campaign.id,
    started_on: "2026-08-18",
    intensity: "adaptive",
    paused: false,
  };
  const runtime = new Runtime(pack, new Ledger(null, data), () => new Date("2026-09-01T09:00:00Z"));

  const transfer = runtime.startMission("t-equip-an-edge-case", "user_shared_artifact");
  assert.equal(transfer.constraints.never_do_the_task, true);
  assert.equal(transfer.constraints.ask_before_you_tell, true);
  assert.equal(transfer.constraints.hint_budget, 0);

  const result = runtime.submitEvidence({
    attempt_id: transfer.attempt_id,
    evidence_type: "artifact",
    evidence: "The coach supplied one decision branch and the learner changed the remaining skill.",
    hints_used: 1,
    assisted_by_agent: true,
    scores: scores(pack, "equip"),
  });
  assert.equal(result.unaided, false);
  assert.match(result.integrity_notes[0], /will not count as unaided evidence/);

  runtime.pause(true);
  assert.equal(runtime.todaysLens().state, "paused");
  assert.throws(() => runtime.startMission("d1-brief-a-real-task"), /campaign is paused/);
});
