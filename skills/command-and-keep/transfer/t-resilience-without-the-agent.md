---
id: t-resilience-without-the-agent
title: Re-plan with the agent unavailable
kind: transfer
day: 14
capability: resilience
transfer_of: d12-recover-and-replan
transfer_distance: 2
context_shift: Removes the agent during recovery so the learner must preserve agency without handing the next decision back to the tool.
template: recover
minutes: 8
unaided_required: true
evidence: [structured_decision, action_receipt]
contexts: [focus_state, scenario]
fallback_scenario: The agent and its connected tools will be unavailable for the next hour. A deliverable is due in ninety minutes and the last generated draft may contain an error.
---
## Why
Recovery that depends on the same unavailable system is not resilience. This variation tests the human fallback.

## The mission (unaided)
State the minimum safe outcome, the first action you can take without the agent, what you will defer, who needs to know, and the condition for reconnecting the tool. Take the first action.

## Evidence to capture
The five-part re-plan and a receipt for the first action. Score on `resilience`.
