---
id: t-equip-an-edge-case
title: Repair the skill, not the result
kind: transfer
day: 5
capability: equip
transfer_of: d2-equip-your-agent
transfer_distance: 2
context_shift: Moves from encoding the normal procedure to repairing it after an unfamiliar edge case exposes a hidden decision.
template: intervene
minutes: 15
unaided_required: true
evidence: [artifact, action_receipt]
contexts: [user_shared_artifact, manual]
fallback_scenario: Your complaint-triage skill receives a message that is both a billing dispute and a safety complaint, a combination the original rules never covered.
---
## Why
A useful skill survives the case its author did not have in mind. Transfer is whether you improve the procedure rather than quietly repair one output.

## The mission (unaided)
Run the skill you made on a case outside its happy path. Do not edit the result. Identify the hidden decision, change the skill so the decision is explicit, and rerun the same case.

## Evidence to capture
The first run's deviation, the skill-file diff, and the rerun receipt. Score on `equip`.
