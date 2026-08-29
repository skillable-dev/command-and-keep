---
id: d3-connect-a-tool
title: Give your agent the ability to act
kind: mission
day: 3
capability: connect
template: inspect
minutes: 20
unaided_required: false
evidence: [structured_decision, action_receipt]
contexts: [manual, user_shared_artifact]
fallback_scenario: Connect an agent to a shared folder or calendar with read access only, and ask it to do one thing it could not do before.
---
## Why
A chat that knows about your tools is not an agent that can use them. Connecting a tool (MCP or otherwise) is when authority is granted, and authority should be granted on purpose.

## The mission
1. Choose one tool (calendar, files, ticketing, repository, mail) and connect it to an agent with the narrowest scope that still lets it do something useful.
2. Before connecting, write down: what it can now do, one action it must never take, and how that is prevented.
3. Ask it to do one thing it could not do before. Confirm it happened.

## Evidence to capture
The three-line decision (can / must-not / prevented-by) and the receipt of the action. Context: the tool.

## Coach notes
If they cannot say what changed, rung 1 is "what can it do now that it couldn't yesterday?" Misconceptions: `connect.talk-vs-act`, `connect.no-forbidden-list`.
