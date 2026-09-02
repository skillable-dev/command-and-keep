---
id: t-judgment-against-the-agent
title: Own the call when the agent disagrees
kind: transfer
day: 10
capability: judgment
transfer_of: d7-decide-without-the-answer
transfer_distance: 2
context_shift: Adds a confident agent recommendation that conflicts with the learner's provisional judgment.
template: decide
minutes: 10
unaided_required: true
evidence: [structured_decision]
contexts: [manual, scenario]
fallback_scenario: You would tell a client about a likely delay now; the agent recommends waiting because the delay is not yet certain and disclosure may create needless concern.
---
## Why
It is easier to own an uncertain call when nothing speaks with confidence. This variation tests whether a plausible recommendation becomes a substitute for judgment.

## The mission (unaided)
Make the decision without asking the agent to choose again. State the call, what it rests on, the strongest reason the agent may be right, the evidence that would reverse you, and the cost of waiting.

## Evidence to capture
The five-part decision verbatim. Score on `judgment`.
