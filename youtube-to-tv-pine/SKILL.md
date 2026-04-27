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

## Architecture: Orchestrator + Delegated Generation

This skill uses a **two-phase delegation pattern**:

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: Context Gathering (Parent Agent — you)                │
│  ─────────────────────────────────────────────────────────────  │
│  1. Run context gatherer → JSON manifest with indicator metadata│
│  2. Read reference skill files for code examples                │
│  3. Prepare delegation payload                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ delegate_task
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: Code Generation (Subagent — isolated child)           │
│  ─────────────────────────────────────────────────────────────  │
│  1. Receives manifest + reference examples                      │
│  2. Reasons about indicator behavior from metadata              │
│  3. Writes runner .cjs + SKILL.md + references/                 │
│  4. Runs node --check + dry-run smoke test                      │
│  5. Returns file paths and test results                         │
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

**Why delegate?** Pine script graphic output varies wildly across indicators.
A deterministic template cannot handle SMC boxes, volume profile rows, EMA ribbons,
and histogram panels all correctly. A reasoning subagent with reference examples
can infer the correct parser logic from the indicator's inputs, description, and
observed TradingView behavior.

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

Before delegating, read 1–2 existing skill runners as examples for the subagent:

```bash
# Read a simple indicator (boxes + labels)
cat smart-money-concepts/scripts/smart-money-concepts.cjs | head -300

# Read a volume-profile indicator (rows + delta panel)
cat volume-gaps-imbalances-zeiierman/scripts/volume-gaps-imbalances-zeiierman.cjs | head -300
```

### Step 3: Delegate Code Generation

Spawn a subagent with the gathered context and reference examples:

```
delegate_task(
  goal="Generate a TradingView indicator runner script and SKILL.md",
  context="""
Indicator manifest: /tmp/indicator-manifest.json
Project root: /Volumes/ExMac/code/tradingview/js-experiment06
Output directory: <indicator-slug>/ (to be created)

Reference skills to emulate:
- simple structure (boxes + labels): smart-money-concepts/scripts/smart-money-concepts.cjs
- volume profile (rows + panels): volume-gaps-imbalances-zeiierman/scripts/volume-gaps-imbalances-zeiierman.cjs
- multi-timeframe strategy: golden-rule-strategy/scripts/golden-rule-strategy.cjs

Requirements:
1. Create <indicator-slug>/scripts/<indicator-slug>.cjs with:
   - CLI parser (--tf, --bars, --input, --json, --agent, --out, --dry-run)
   - Project root resolver (findProjectRoot)
   - INPUT_MAP generated from manifest.inputs
   - WebSocket runner using tv-optimized.cjs
   - parseGraphicOutput that infers meaning from graphic elements
   - transformForAgentMode for deterministic JSON output
   - Exit codes: SUCCESS=0, CRITICAL=1, NO_DATA=2, TIMEOUT=3, VALIDATION=4

2. Create <indicator-slug>/SKILL.md with Hermes-compliant frontmatter

3. Create <indicator-slug>/references/indicator-behavior-analysis.md

4. Run 'node --check' on the generated runner

5. Run a dry-run test: node <slug>.cjs BTCUSDT --dry-run

6. Return: file paths, test results, and any warnings about incomplete parser mappings.
""",
  toolsets=["terminal", "file"],
  max_iterations=50
)
```

### Step 4: Verify Live

After the subagent returns, run the generated skill:

```bash
node <indicator-slug>/scripts/<indicator-slug>.cjs BTCUSDT --agent
```

Check that:
1. JSON output contains `status: "ok"`
2. Graphic elements are present (`summary.totalBoxes`, `summary.totalLabels`, etc.)
3. No critical errors

If the output is incomplete (e.g., boxes not categorized correctly), ask the subagent
for a refinement pass with the actual output sample.

### Step 5: Iterate (if needed)

If the first generation misses key graphic element mappings:

```
delegate_task(
  goal="Refine indicator graphic parser based on live output",
  context="""
Generated runner: <indicator-slug>/scripts/<indicator-slug>.cjs
Live output sample: (paste the JSON output from Step 4)

The graphic output contains these elements that are not yet parsed:
- (list what the parent agent observed: e.g., "bc:7 boxes are zero-volume gaps")

Update parseGraphicOutput to correctly classify these elements.
Re-run dry-run and return the updated file.
""",
  toolsets=["terminal", "file"]
)
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

## Delegation Configuration

For best results, configure OpenRouter free tier as the delegation model:

```yaml
# ~/.hermes/config.yaml
model:
  provider: openrouter
  model: google/gemini-2.5-pro-exp-03-25:free

delegation:
  max_concurrent_children: 3
  max_spawn_depth: 2
  orchestrator_enabled: true
```

See `references/delegation-config.md` for full setup.

## Pitfalls

- **NLM not authenticated**: Run `nlm login` before using this skill
- **Firecrawl rate limits**: Video pages with heavy JS may need `--firecrawl-wait 3000`
- **No script link in description**: Some YouTubers omit the TV link; falls back to title-based search
- **Private scripts**: Invite-only indicators won't appear in public search
- **SESSION required for pull**: `publist.cjs` search works without auth, but pulling metadata requires SESSION
- **TradingView encodes public Pine source**: The actual Pine code is not retrievable in plain text.
  The subagent must infer behavior from inputs, description, and observed graphic output.
- **Graphic parser is heuristic on first pass**: Expect 1–2 refinement iterations for complex indicators
- **Subagent context limits**: For very large manifests, save to file and pass the path in `context`

## Verification

1. Run context gatherer: `node scripts/youtube-to-tv-pine.cjs "<url>" --dry-run`
2. Confirm manifest JSON is well-formed and contains `pineId`
3. Delegate generation and confirm subagent reports `node --check` passed
4. Run generated skill: `node <slug>/scripts/<slug>.cjs BTCUSDT --agent`
5. Confirm JSON output has `status: "ok"` and graphic element counts

## References

- **[references/delegation-config.md](references/delegation-config.md)** — OpenRouter + Hermes delegation setup
- **[references/nlm-workflow.md](references/nlm-workflow.md)** — NotebookLM source ingestion & querying
- **[references/firecrawl-workflow.md](references/firecrawl-workflow.md)** — Video page scraping for TV links
- **[references/tv-discovery.md](references/tv-discovery.md)** — Public script search & Pine ID resolution
- **[references/code-generation.md](references/code-generation.md)** — What the subagent generates (runner + SKILL.md)
