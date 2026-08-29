#!/usr/bin/env bash
# Installs the Command & Keep pack as a personal Claude Code skill (symlink) and builds the MCP server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
mkdir -p "$SKILLS_DIR"
ln -sfn "$ROOT/skills/command-and-keep" "$SKILLS_DIR/command-and-keep"
echo "skill  → $SKILLS_DIR/command-and-keep"
(cd "$ROOT/server" && npm install --silent && npm run build --silent && npm run validate --silent)
echo "server → $ROOT/server/dist/index.js"
echo
echo "Claude Code: open this folder ($ROOT); .mcp.json registers the 'skillable' server."
echo "Claude Desktop: add to claude_desktop_config.json:"
echo "  \"skillable\": { \"command\": \"node\", \"args\": [\"$ROOT/server/dist/index.js\"] }"
echo
echo "Then say: \"Start my Command & Keep campaign.\""
