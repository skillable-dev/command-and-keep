# Command & Keep — Skillable PoC

The first proof of concept for agent-native Skillable: **one skill pack, six MCP tools, an evidence ledger, zero UI.**
The learner runs a 14-day campaign inside their own Claude (or any MCP + Agent Skills client). Their assistant is the coach; this server is the runtime and the ledger.

```
packs/command-and-keep/     the course, as a folder (Agent Skills spec + Skillable extensions)
  SKILL.md                  coach instructions and the tool protocol — this is the UX
  campaign.yaml             14 days, two halves, the learner contract
  capabilities.yaml         12 observable capabilities with a "tell" and a review prompt
  rubrics/<capability>.yaml behaviour-anchored, 4 levels, 3 dimensions each
  missions/                 d0 diagnostic, d1–d12 one per capability, d13 The Incident, d14 retrospective
  transfer/                 harder variants, always unaided
  misconceptions.yaml       20 ways people get it wrong, the tell, the repair
  evidence-rules.json       what counts, what must be unaided, human sampling
  safety.json               interrupt budget, hours, prohibitions
  credential.json           what the badge claims and how it decays
server/                     the runtime: six MCP tools over the pack and a JSON ledger
```

## Install (Claude Code, ~1 minute)

```bash
./scripts/install-skill.sh
```

This symlinks the pack into `~/.claude/skills/`, builds the server and runs the publishing gates. Open this folder in Claude Code (`.mcp.json` registers the `skillable` server) and say:

> Start my Command & Keep campaign.

For Claude Desktop, add the server to `claude_desktop_config.json` (the script prints the snippet) and copy the pack into your skills directory.

The ledger lives at `~/.skillable/command-and-keep/ledger.json`. Read it any time; that is "what have you stored about me". Delete it to start over. `SKILLABLE_LEDGER` and `SKILLABLE_PACK` override the paths.

## The six tools

| Tool | Does |
|---|---|
| `todays_lens` | Day, lens, available missions, due reviews, progress. Starts the campaign with `intensity`. Pause/resume. |
| `start_mission` | Opens an attempt; returns the brief, rubrics, misconceptions to watch, hint budget. `review:<capability>` for spaced reviews. |
| `submit_evidence` | Records the learner's output, the agent's rubric scores with rationales, hints used, whether the agent did any of the work. Schedules spaced reviews. |
| `get_feedback` | Levels, weakest dimension and next anchor, delta from last attempt, misconception repairs, suggested next step. |
| `due_reviews` | Spaced retrieval due today. |
| `credential_status` | Per-capability evidence against the rules, what's missing, Open Badges 3.0 preview. |

Intensity: `guided` unlocks strictly one calendar day at a time; `adaptive`/`immersive` let the learner run one day ahead once today's missions are done.

## Develop

```bash
cd server
npm test          # runtime tests with an in-memory ledger and a fixed clock
npm run validate  # publishing gates for the pack
npm run build
```

The runtime (`src/runtime.ts`) is pure over `(pack, ledger, clock)`; the MCP layer (`src/index.ts`) is thin.

## What this PoC deliberately leaves out

- Remote/OAuth MCP and a Supabase-backed ledger (the main repo has both; port once the loop feels right).
- The App Intents transport (the `FieldModeCore` Swift package mirrors these six verbs later).
- Agent-initiated nudges. The lens is pulled; the OS transport will push, within `safety.json`'s budget.
- A human-review UI. Attempts flagged `human_review_required` sit in the ledger until someone reads them.
- Real code execution or audio grading. Everything is AI-evaluated against the rubric and says so.

## What to measure with the first ten learners

Time to first authentic action; hint dependence over the 14 days; unaided level at day 14 vs day 0; contexts per capability; interruption regret; and whether anyone asks to see the ledger.
