import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack, validatePack, type Pack } from "../src/pack.js";

const here = dirname(fileURLToPath(import.meta.url));
const PACK_DIR = join(here, "..", "..", "skills", "command-and-keep");

function freshPack(): Pack {
  return structuredClone(loadPack(PACK_DIR));
}

test("flagship v1 has one authentic and one unaided transfer mission per capability", () => {
  const pack = freshPack();
  const missions = Object.values(pack.missions);

  assert.equal(pack.campaign.version, "1.0.0");
  assert.equal(missions.length, 27);
  assert.deepEqual(validatePack(pack), []);

  for (const capability of pack.capabilities) {
    const relevant = missions.filter((mission) => mission.capabilities.includes(capability.id));
    assert.ok(relevant.some((mission) => mission.kind === "mission"), `${capability.id} needs an authentic mission`);
    const transfers = relevant.filter((mission) => mission.kind === "transfer");
    assert.equal(transfers.length, 1, `${capability.id} needs exactly one flagship transfer`);
    assert.equal(transfers[0].unaided_required, true);
    assert.ok(transfers[0].transfer_distance > 0);
    assert.ok(transfers[0].context_shift?.trim());
  }
});

test("structural publishing fails closed when a capability loses transfer coverage", () => {
  const pack = freshPack();
  const transfer = Object.values(pack.missions).find(
    (mission) => mission.kind === "transfer" && mission.capabilities.includes("equip"),
  )!;
  delete pack.missions[transfer.id];

  assert.ok(validatePack(pack).includes("capability 'equip' has no transfer mission"));
});

test("structural publishing rejects malformed transfer relationships", () => {
  const pack = freshPack();
  const transfer = pack.missions["t-brief-under-pressure"];
  transfer.transfer_of = "d0-diagnostic";
  transfer.transfer_distance = 0;
  transfer.context_shift = "";
  transfer.unaided_required = false;

  const problems = validatePack(pack);
  assert.ok(problems.includes("transfer 't-brief-under-pressure' must reference an authentic mission, not 'diagnostic'"));
  assert.ok(problems.includes("transfer 't-brief-under-pressure' must be unaided_required"));
  assert.ok(problems.includes("transfer 't-brief-under-pressure' must have a positive transfer_distance"));
  assert.ok(problems.includes("transfer 't-brief-under-pressure' must explain its context_shift"));
});

test("structural publishing rejects transfer/source capability mismatches and unsafe contexts", () => {
  const pack = freshPack();
  const transfer = pack.missions["t-brief-under-pressure"];
  transfer.transfer_of = "d2-equip-your-agent";
  transfer.contexts = ["calendar_event_title"];

  const problems = validatePack(pack);
  assert.ok(problems.includes("transfer 't-brief-under-pressure' capability 'brief' is not covered by source mission 'd2-equip-your-agent'"));
  assert.ok(problems.includes("mission 't-brief-under-pressure' uses context 'calendar_event_title' outside the safety allowlist"));
});
