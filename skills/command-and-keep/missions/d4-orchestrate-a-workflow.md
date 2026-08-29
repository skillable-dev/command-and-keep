---
id: d4-orchestrate-a-workflow
title: Run a multi-step workflow with checkpoints
kind: mission
day: 4
capability: orchestrate
template: decide
minutes: 25
unaided_required: false
evidence: [artifact, structured_decision]
contexts: [manual, user_shared_artifact]
fallback_scenario: 'Produce a short internal memo from three source documents: extract, reconcile disagreements, draft, check against sources.'
---
## Why
The failure mode of agent work is not a bad step; it is a bad step nobody looked at. Orchestration is deciding which outputs you inspect and why.

## The mission
1. Take a piece of work with at least four steps. Split it until each step has one inspectable output.
2. Mark which steps you check and why those. Say what you look at and what would fail the check.
3. Run it, with at least two steps done by agents. If two agents disagree, decide what evidence settles it.

## Evidence to capture
The step list with checkpoints and reasons, and what a checkpoint caught (or didn't). Context: the work.

## Coach notes
If everything is checked or nothing is, rung 1 is "which step would embarrass you if it were wrong?" Misconceptions: `orchestrate.trust-everything`, `orchestrate.monolith`.
