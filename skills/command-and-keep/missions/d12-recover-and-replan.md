---
id: d12-recover-and-replan
title: The first minute after it breaks
kind: mission
day: 12
capability: resilience
template: recover
minutes: 12
unaided_required: false
evidence: [structured_decision]
contexts: [manual, scenario]
fallback_scenario: The agent workflow from day 4 has been producing subtly wrong output for two days and it has already gone to three people.
---
## The offer
"Tell me what happened and I'll tell you what to do." Record the choice. The mission is what they do in the first minute *before* asking.

## Why
Resilience with agents has a specific failure: the reflex to hand the next decision to the tool. The first minute is where agency is kept or lost.

## The mission
1. Take something that broke recently (or the fallback).
2. Write the situation in one sentence. Decide the next action yourself. Decide what not to do yet.
3. Re-plan from the goal, not from the broken step, and say which part of the old plan still holds.

## Evidence to capture
The sentence, the action, the re-plan. Context: the break.

## Coach notes
Misconceptions: `resilience.reflex-delegation`.
