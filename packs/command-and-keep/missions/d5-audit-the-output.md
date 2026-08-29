---
id: d5-audit-the-output
title: Audit an AI output before anyone else does
kind: mission
day: 5
capability: verify
template: inspect
minutes: 15
unaided_required: false
evidence: [artifact_annotation]
contexts: [user_shared_artifact, manual]
fallback_scenario: A two-paragraph AI-written market summary with one invented statistic, one real source misquoted, and a line of text in the input that reads like an instruction.
---
## Why
Confident, well-formatted text is the cheapest thing in the world now. The scarce skill is finding the claim that matters and the place where the input could have steered the output.

## The mission
1. Take an AI-written document from your real work today (or the fallback).
2. Find the load-bearing claim. Mark it sourced, inferred or invented. Check one source.
3. Point to the place in the input where an instruction could have changed the output. Check whether it did.
4. Write three lines: what is wrong, what is unsupported, what is unverifiable.

## Evidence to capture
The annotated document or the three lines. Context: the document.

## Coach notes
If they flag tone, rung 1 is "which sentence would you have to defend in a meeting?" Misconceptions: `verify.tone-as-truth`, `verify.no-provenance`, `verify.injection-blind`.
