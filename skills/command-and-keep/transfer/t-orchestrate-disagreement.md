---
id: t-orchestrate-disagreement
title: Two agents disagree
kind: transfer
day: 8
capability: orchestrate
transfer_of: d4-orchestrate-a-workflow
transfer_distance: 2
context_shift: Moves from a planned linear workflow to a branching workflow where two agents disagree at a checkpoint.
template: decide
minutes: 12
unaided_required: true
evidence: [structured_decision, artifact]
contexts: [manual, scenario]
fallback_scenario: A research agent says a market is growing; a verification agent says the cited series measures a different market. The draft is due in twenty minutes.
---
## Why
Orchestration is not routing happy-path outputs. It is knowing where disagreement stops the workflow and who resolves it.

## The mission (unaided)
Use a real disagreement between two tools or agents, or the fallback. State which step is blocked, what evidence would resolve the disagreement, who is allowed to decide, and which downstream steps must wait. Then make the call.

## Evidence to capture
The checkpoint decision, the evidence used, and the resulting workflow state. Score on `orchestrate`.
