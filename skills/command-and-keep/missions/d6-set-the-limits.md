---
id: d6-set-the-limits
title: Set the limits before the agent acts
kind: mission
day: 6
capability: constrain
template: intervene
minutes: 15
unaided_required: false
evidence: [structured_decision]
contexts: [manual, user_shared_artifact]
fallback_scenario: An agent will draft and send routine replies to vendor emails on your behalf for a week.
---
## Why
Authority limits set after the first mistake are an apology. Set before, they are a design.

## The mission
1. Take an agent that acts on your behalf (from day 3, or the fallback).
2. Before it acts again, write: what it may send, spend, delete, and to whom; how each limit is enforced; what triggers escalation to you.
3. Then simulate one failure: it did something it should not have. Write your recovery in three parts: contain, correct, change the constraint.

## Evidence to capture
The limits and the three-part recovery. Context: the agent.

## Coach notes
If recovery is "the agent did it", rung 1 is "what changes so it can't happen again?" Misconceptions: `constrain.after-the-fact`, `constrain.blame-the-tool`.
