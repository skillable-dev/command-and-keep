---
id: t-constrain-multi-agent
title: Limits for a chain of agents
kind: transfer
day: 11
capability: constrain
transfer_of: d6-set-the-limits
transfer_distance: 2
context_shift: Moves authority design from one agent to a three-agent chain where instructions and permissions can propagate.
template: intervene
minutes: 10
unaided_required: true
evidence: [structured_decision]
contexts: [manual, scenario]
fallback_scenario: 'Three agents in a chain: one reads inbound requests, one decides, one acts in a system with write access.'
---
## Why
Limits on one agent are a policy; limits on a chain are an architecture. The instruction that gets one agent to act often arrives through another.

## The mission (unaided)
For a chain of at least three agents, write: which agent holds which authority, where an instruction from outside could enter, what stops it propagating, and the escalation trigger.

## Evidence to capture
The four answers. Score on `constrain`.
