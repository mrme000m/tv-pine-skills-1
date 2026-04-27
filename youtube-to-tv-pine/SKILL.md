---
name: youtube-to-tv-pine
description: >
  Convert a YouTube trading-indicator video into a fully-working TradingView Pine Script skill.
  Use this skill when the user provides a YouTube URL of a TradingView indicator review/tutorial
  and wants to: extract the indicator name, find the public Pine script, pull the source code,
  and generate a runnable local skill (runner script + SKILL.md + presets) that replicates the
  indicator's analysis on any symbol/timeframe. Triggers on "youtube to tradingview",
  "video to pine script", "indicator from youtube", "create skill from video", or any YouTube
  URL combined with TradingView indicator terms.
version: 2.0.0
license: MIT
author: TradingView Pine Skills
compatibility: Node.js 18+, nlm CLI, firecrawl CLI, tv.cjs / tv-optimized.cjs at project root
metadata:
  hermes:
    tags: [tradingview, pine-script, youtube, notebooklm, firecrawl, skill-generator, delegation, claude-code]
    category: trading
required_environment_variables:
  - name: SESSION
    prompt: TradingView sessionid cookie
    help: From browser DevTools → Application → Cookies → tradingview.com → sessionid
    required_for: authenticated operations (pull source, run indicator)
  - name: SIGNATURE
    prompt: TradingView sessionid_sign cookie
    help: From browser DevTools → Application → Cookies → tradingview.com → sessionid_sign
    required_for: authenticated operations
  - name: TV_USER
    prompt: TradingView username
    help: Your TradingView username
    required_for: write operations
---

# YouTube → TradingView Pine Script Skill Generator

Convert any YouTube indicator review or tutorial into a local, runnable TradingView skill.

## When to Use

- User pastes a YouTube URL of a TradingView indicator review
- User says "make a skill for this indicator" with a video link
- User wants to run an indicator they saw on YouTube against their own symbols
- User wants to automate backtesting of a video-discussed strategy
- Trigger phrases: "youtube to pine", "video to tradingview skill", "indicator from youtube",
  "create runner from video", "turn this video into a script"

## Architecture: Orchestrator + Claude Code Generation

This skill uses a **two-phase pattern** where the context gatherer produces a
manifest, then **Claude Code** (via the `claude-code` skill) generates the
indicator runner and SKILL.md:

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: Context Gathering (Parent Agent — you)                │
│  ─────────────────────────────────────────────────────────────  │
│  1. Run context gatherer → JSON manifest with indicator metadata│
│  2. Read reference skill files for code examples                │
│  3. Prepare generation prompt + manifest                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ claude -p
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: Code Generation (Claude Code — print mode)            │
│  ─────────────────────────────────────────────────────────────  │
│  1. Receives manifest (piped stdin) + file references           │
│  2. Reads reference skill examples from disk                    │
│  3. Reasons about indicator behavior from metadata              │
│  4. Writes runner .cjs + SKILL.md + references/                 │
│  5. Runs node --check + dry-run smoke test                      │
│  6. Returns structured JSON with file paths and results         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: Verification (Parent Agent — you)                     │
│  ─────────────────────────────────────────────────────────────  │
│  1. Review generated files                                      │
│  2. Run live test: node <slug>.cjs BTCUSDT --agent              │
│  3. Present final skill to user                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why Claude Code?** Pine script graphic output varies wildly across indicators.
A deterministic template cannot handle SMC boxes, volume profile rows, EMA ribbons,
and histogram panels all correctly. Claude Code's reasoning agent, armed with
reference examples and the indicator manifest, can infer the correct parser logic
and write production-quality runner code in a single `claude -p` invocation.

## Procedure

### Step 1: Gather Context

```bash
node scripts/youtube-to-tv-pine.cjs "https://youtube.com/watch?v=..."
```

This outputs a JSON manifest containing:
- `indicatorName` — extracted from NLM or Firecrawl
- `pineId` — resolved TradingView script ID
- `inputs` — input definitions with types and defaults
- `description` — indicator short description
- `youtubeUrl` — original video URL
- `source` — how the indicator was found (nlm, firecrawl, manual)

Save this manifest to a file:

```bash
node scripts/youtube-to-tv-pine.cjs "<url>" > /tmp/indicator-manifest.json
```

### Step 2: Read Reference Examples

Before generating, read 1–2 existing skill runners as examples for Claude Code:

```bash
# Read a simple indicator (boxes + labels)
cat smart-money-concepts/scripts/smart-money-concepts.cjs | head -300

# Read a volume-profile indicator (rows + delta panel)
cat volume-gaps-imbalances-zeiierman/scripts/volume-gaps-imbalances-zeiierman.cjs | head -300
```

### Step 3: Generate Code via Claude Code

Use Claude Code in **print mode** (`-p`) for one-shot code generation. Pipe the
manifest as stdin and restrict tools to `Read,Edit,Write,Bash`:

```bash
cd /Volumes/ExMac/code/tradingview/js-experiment06

cat /tmp/indicator-manifest.json | claude -p \
  "You are generating a TradingView Pine Script skill.

   READ the manifest JSON from stdin first. It contains:
   - indicator.name, indicator.slug, indicator.pineId
   - inputs (type, default, options)
   - description

   Then READ these reference files for code patterns:
   - smart-money-concepts/scripts/smart-money-concepts.cjs (boxes + labels)
   - volume-gaps-imbalances-zeiierman/scripts/volume-gaps-imbalances-zeiierman.cjs (profile + panels)

   CREATE the following under <slug>/ (where <slug> comes from manifest.indicator.slug):

   1. scripts/<slug>.cjs with:
      - Standard boilerplate (root resolver, CLI, WebSocket runner)
      - INPUT_MAP built from manifest.inputs
      - parseGraphicOutput with heuristics for this indicator type
      - transformForAgentMode with <<<AGENT_JSON_START>>> delimiters
      - Exit codes: SUCCESS=0, CRITICAL=1, NO_DATA=2, TIMEOUT=3, VALIDATION=4

   2. SKILL.md with Hermes-compliant frontmatter

   3. references/indicator-behavior-analysis.md

   4. default.json preset from input defaults

   After writing, RUN:
     node --check <slug>/scripts/<slug>.cjs
     node <slug>/scripts/<slug>.cjs BTCUSDT --dry-run

   Report file paths, syntax-check result, and dry-run output." \
  --allowedTools "Read,Edit,Write,Bash" \
  --max-turns 25 \
  --output-format json
```

**Why print mode?** Per the `claude-code` skill, `-p` skips all interactive dialogs,
auto-exits when done, and returns structured output — ideal for automation.

### Step 4: Verify Live

After Claude Code returns, run the generated skill:

```bash
node <indicator-slug>/scripts/<indicator-slug>.cjs BTCUSDT --agent
```

Check that:
1. JSON output contains `status: "ok"`
2. Graphic elements are present (`summary.totalBoxes`, `summary.totalLabels`, etc.)
3. No critical errors

If the output is incomplete (e.g., boxes not categorized correctly), pipe the
live output back to Claude Code for a refinement pass:

```bash
node <slug>/scripts/<slug>.cjs BTCUSDT --agent --json | \
  claude -p \
    "Refine the graphic parser in <slug>/scripts/<slug>.cjs.
     The live output shows these graphic elements that are not correctly parsed.
     Update parseGraphicOutput heuristics and re-run dry-run." \
    --allowedTools "Read,Edit,Bash" \
    --max-turns 15
```

## Quick Reference

```bash
# Gather context only
node scripts/youtube-to-tv-pine.cjs "https://youtube.com/watch?v=..."

# Auto-select top search result (non-interactive)
node scripts/youtube-to-tv-pine.cjs "<url>" --auto

# Use existing NLM notebook
node scripts/youtube-to-tv-pine.cjs "<url>" --nlm-notebook-id <uuid>

# Output manifest to file
node scripts/youtube-to-tv-pine.cjs "<url>" > /tmp/manifest.json

# Dry run (no network, test pipeline)
node scripts/youtube-to-tv-pine.cjs "<url>" --dry-run
```

## Claude Code Prerequisites

This skill delegates code generation to **Claude Code** (Anthropic's CLI agent).

### Install & Auth

```bash
npm install -g @anthropic-ai/claude-code
claude auth login --console   # or --sso for Enterprise
claude auth status            # verify
claude doctor                 # health check
```

### Configuration

Set defaults in `~/.claude/settings.json` for faster startup:

```json
{
  "permissions": {
    "allow": ["Read", "Edit", "Write", "Bash(node --check *)", "Bash(node *.cjs --dry-run)"]
  }
}
```

Or pass flags per invocation (as shown in Step 3):
- `--allowedTools "Read,Edit,Write,Bash"` — restrict to needed tools
- `--max-turns 25` — prevent runaway loops
- `--output-format json` — structured result for parsing

See `references/delegation-config.md` for full Claude Code setup.

## Pitfalls

- **NLM not authenticated**: Run `nlm login` before using this skill
- **Firecrawl rate limits**: Video pages with heavy JS may need `--firecrawl-wait 3000`
- **No script link in description**: Some YouTubers omit the TV link; falls back to title-based search
- **Private scripts**: Invite-only indicators won't appear in public search
- **SESSION required for pull**: `publist.cjs` search works without auth, but pulling metadata requires SESSION
- **TradingView encodes public Pine source**: The actual Pine code is not retrievable in plain text.
  Claude Code must infer behavior from inputs, description, and observed graphic output.
- **Graphic parser is heuristic on first pass**: Expect 1–2 refinement iterations for complex indicators
- **Claude Code cost**: Each `claude -p` invocation costs ~$0.05–0.50 depending on context size.
  Use `--max-budget-usd 1.00` for cost caps.

## Verification

1. Run context gatherer: `node scripts/youtube-to-tv-pine.cjs "<url>" --dry-run`
2. Confirm manifest JSON is well-formed and contains `pineId`
3. Run Claude Code generation and confirm `node --check` passed
4. Run generated skill: `node <slug>/scripts/<slug>.cjs BTCUSDT --agent`
5. Confirm JSON output has `status: "ok"` and graphic element counts

## References

- **[references/delegation-config.md](references/delegation-config.md)** — Claude Code install, auth, and print-mode setup
- **[references/nlm-workflow.md](references/nlm-workflow.md)** — NotebookLM source ingestion & querying
- **[references/firecrawl-workflow.md](references/firecrawl-workflow.md)** — Video page scraping for TV links
- **[references/tv-discovery.md](references/tv-discovery.md)** — Public script search & Pine ID resolution
- **[references/code-generation.md](references/code-generation.md)** — Claude Code generation flow, prompt template, and refinement
