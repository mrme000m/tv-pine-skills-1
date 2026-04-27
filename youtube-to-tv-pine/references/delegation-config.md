# Claude Code Configuration

This skill delegates code generation to **Claude Code** — Anthropic's autonomous
CLI agent (`claude`). The parent agent gathers context; Claude Code writes and
verifies the runner code in print mode (`claude -p`).

## Why Claude Code?

- **Reasoning-heavy generation**: Writing a correct graphic parser requires
  understanding the indicator's purpose from its inputs and description
- **Full file system access**: Claude Code can read reference files, write new
  code, and run shell commands (`node --check`, dry-run tests) autonomously
- **Print mode for automation**: `claude -p` skips all interactive dialogs,
  runs one-shot, and returns structured JSON output
- **No context window bloat**: Claude Code runs in its own process with its own
  context — the parent Hermes agent only sees the final result

## Install & Authenticate

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Authenticate (choose one)
claude auth login --console     # API key billing
claude auth login --sso         # Enterprise SSO
claude auth login               # Browser OAuth (Pro/Max)

# Verify
claude auth status
claude doctor
claude --version
```

## Print Mode (`claude -p`) — The Primary Interface

For this skill, always use **print mode** (`-p`). It is non-interactive,
auto-exits when done, and skips all permission dialogs.

```bash
claude -p "task description" \
  --allowedTools "Read,Edit,Write,Bash" \
  --max-turns 25 \
  --output-format json
```

| Flag | Purpose | Recommended Value |
|------|---------|-------------------|
| `-p, --print` | Non-interactive one-shot mode | Required |
| `--allowedTools` | Whitelist tools | `Read,Edit,Write,Bash` |
| `--max-turns` | Limit agentic loops | 25 for generation, 15 for refinement |
| `--output-format json` | Structured output | Recommended for parsing results |
| `--max-budget-usd` | Cost cap | 1.00 |
| `--bare` | Skip plugins/hooks (fastest) | Optional for CI |

## Tool Whitelist for This Skill

Restrict Claude Code to only the tools it needs:

```bash
--allowedTools "Read,Edit,Write,Bash"
```

This allows:
- **Read** — read manifest, reference files, existing code
- **Edit** — modify generated runner during refinement
- **Write** — create new runner, SKILL.md, references/
- **Bash** — run `node --check`, `node *.cjs --dry-run`

It blocks:
- WebSearch/WebFetch (not needed — all context is local)
- Git operations (parent agent handles git)
- MCP tools (not needed for this workflow)

## Piped Input Pattern

Pass the manifest as stdin so Claude Code can read it as context:

```bash
cat /tmp/indicator-manifest.json | claude -p \
  "Generate a TradingView skill from the manifest in stdin..." \
  --allowedTools "Read,Edit,Write,Bash" \
  --max-turns 25
```

Per the `claude-code` skill: "Pipe input instead of having Claude read files
when you just need analysis of known content."

## Session Continuation (for Refinement)

If the first generation needs fixes, continue the session:

```bash
# Save session ID from first run
cat /tmp/manifest.json | claude -p "..." --output-format json > /tmp/session.json
SESSION_ID=$(cat /tmp/session.json | jq -r '.session_id')

# Resume for refinement
cat /tmp/live-output.json | claude -p \
  "Refine the graphic parser..." \
  --resume "$SESSION_ID" \
  --allowedTools "Read,Edit,Bash" \
  --max-turns 15
```

## Settings for Faster Startup

Create `~/.claude/settings.json` to set default permissions:

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Edit",
      "Write",
      "Bash(node --check *)",
      "Bash(node *.cjs --dry-run)",
      "Bash(node *.cjs BTCUSDT --agent)"
    ]
  }
}
```

This skips permission prompts for common verification commands.

## Cost & Performance Tips

1. **Use `--max-turns 25`** — prevents runaway loops. Most generations complete in 10–20 turns.
2. **Use `--max-budget-usd 1.00`** — caps API spend per invocation.
3. **Use `--bare`** for fastest startup (skips plugin/hook discovery).
4. **Pipe the manifest** — faster than asking Claude to read the file via tool call.
5. **Set `ANTHROPIC_API_KEY`** — avoids OAuth overhead in automated workflows.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Not authenticated" | Session expired | `claude auth login --console` |
| "Permission denied" | Tool not in `--allowedTools` | Add `Read,Edit,Write,Bash` |
| Runs too long / too expensive | No `--max-turns` or `--max-budget` | Add `--max-turns 25 --max-budget-usd 1.00` |
| Trust dialog appears | First run in directory | Use `-p` (print mode skips dialogs) |
| Output is not JSON | Missing `--output-format json` | Add the flag |
