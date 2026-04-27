# Code Generation via Claude Code

This skill does **not** use deterministic templates for code generation.
Instead, it uses **Claude Code** (`claude -p`) — Anthropic's autonomous CLI agent
in print mode — to reason about the indicator and write appropriate code.

## Why Claude Code?

Pine script graphic output varies wildly:

| Indicator Type | Graphic Elements | Parser Complexity |
|----------------|------------------|-------------------|
| SMC (LuxAlgo) | Boxes (FVG/OB), Labels (BOS/CHoCH), Lines (trends) | High — many element types |
| Volume Profile | Boxes (rows), Tables (delta panel), fills | High — volume-based geometry |
| EMA Ribbon | Lines (5+ EMAs), fills (ribbon cloud), plots | Medium — line intersections |
| Oscillator | Plots (lines), hlines, bgcolor | Low — standard plots |
| Strategy | StrategyReport (trades/performance), arrows | High — trade table parsing |

A deterministic template would need to handle all of these, becoming unmaintainable.
Claude Code, armed with the indicator manifest and reference examples, reasons about
the correct parser logic and writes production-quality code in a single invocation.

## Generation Flow

```
Parent Agent (Hermes)
│
├─ 1. Run context gatherer → manifest.json
├─ 2. Read reference skill files (1–2 examples)
│
└─► claude -p \
      "Generate skill from manifest + references..." \
      --allowedTools "Read,Edit,Write,Bash" \
      --max-turns 25 \
      --output-format json

    Claude Code (print mode)
    │
    ├─ 1. Read manifest from stdin
    ├─ 2. Read reference skill examples from disk
    ├─ 3. Reason about indicator behavior from inputs + description
    ├─ 4. Write <slug>/scripts/<slug>.cjs
    ├─ 5. Write <slug>/SKILL.md
    ├─ 6. Write <slug>/references/indicator-behavior-analysis.md
    ├─ 7. Run 'node --check' on runner
    ├─ 8. Run dry-run smoke test
    └─ 9. Return structured JSON with file paths and results

Parent Agent (Hermes)
│
├─ 1. Review generated files
├─ 2. Run live test: node <slug>.cjs BTCUSDT --agent
└─ 3. Present to user (or pipe live output back to Claude for refinement)
```

## What Claude Code Generates

### 1. Runner Script (`scripts/<slug>.cjs`)

Claude Code writes a Node.js script with these sections:

```javascript
// ─── Standard Boilerplate (always present) ───
// Project root resolver, dotenv, tv-optimized.cjs, agent-output.cjs
// CLI parser: --symbol, --tf, --bars, --input, --json, --agent, --out, --dry-run
// Input applier: maps INPUT_MAP to indicator.setOption()
// WebSocket runner: tv.Client → Chart → Study → wait for updates
// Agent mode transformer: deterministic JSON with <<<AGENT_JSON_START>>> delimiters
// Exit codes: SUCCESS=0, CRITICAL=1, NO_DATA=2, TIMEOUT=3, VALIDATION=4

// ─── Custom Parser (indicator-specific) ───
function parseGraphicOutput(rawData, timeframe) {
  const graphic = rawData?.graphic || {};
  // Claude Code writes heuristic mappings based on manifest.inputs and reference examples
  // e.g., for SMC: boxes → FVG/OB, labels → BOS/CHoCH
  // e.g., for Volume Profile: boxes → profile rows, tables → delta panel
}
```

### 2. SKILL.md

Hermes-compliant frontmatter + standard sections:
- `## When to Use` — trigger conditions
- `## How the Indicator Works` — core architecture from description
- `## JSON Output Schema` — fields produced by parseGraphicOutput
- `## Trading Methodology` — how to interpret output (inferred from indicator type)
- `## Pitfalls` — common issues
- `## Verification` — test commands

### 3. Behavior Analysis (`references/indicator-behavior-analysis.md`)

Document for the user on how to refine the parser:
- Input reference table
- Detected graphic elements
- Refinement guide (run with --verbose, inspect output, update heuristics)

## Reference Examples for Claude Code

The prompt should direct Claude Code to read 1–2 reference skill files:

**For structure indicators** (boxes + labels):
```
Path: smart-money-concepts/scripts/smart-money-concepts.cjs
Patterns: BOS/CHoCH labels, FVG/OB boxes, trend lines, equal highs/lows
Key parser logic: label text → signal type, box size + position → FVG vs OB
```

**For volume/profile indicators** (rows + panels):
```
Path: volume-gaps-imbalances-zeiierman/scripts/volume-gaps-imbalances-zeiierman.cjs
Patterns: Volume profile rows (boxes per price level), delta panel (tables)
Key parser logic: bc:7 = zero-volume gap, bc:5/6 = bear/bull rows, table cells = delta %
```

**For multi-timeframe strategies**:
```
Path: golden-rule-strategy/scripts/golden-rule-strategy.cjs
Patterns: Multiple WebSocket runs (W→D→4H), local oscillator computation
Key parser logic: Aggregate results across timeframes, compute RSI/Stoch/MACD locally
```

## Claude Code Prompt Template

```bash
cat /tmp/indicator-manifest.json | claude -p \
  "You are generating a TradingView Pine Script skill.

   READ the manifest JSON from stdin first. It contains:
   - indicator.name, indicator.slug, indicator.pineId
   - inputs (type, default, options)
   - description

   Then READ these reference files for code patterns:
   - smart-money-concepts/scripts/smart-money-concepts.cjs (boxes + labels)
   - volume-gaps-imbalances-zeiierman/scripts/volume-gaps-imbalances-zeiierman.cjs (profile + panels)

   CREATE the following under <slug>/:

   A. scripts/<slug>.cjs
      - Standard boilerplate (root resolver, CLI, WebSocket runner)
      - INPUT_MAP built from manifest.inputs
      - parseGraphicOutput with heuristics for this indicator type
      - transformForAgentMode with <<<AGENT_JSON_START>>> delimiters
      - Exit codes: SUCCESS=0, CRITICAL=1, NO_DATA=2, TIMEOUT=3, VALIDATION=4

   B. SKILL.md
      - Hermes frontmatter with name, description, version, metadata.hermes tags
      - When to Use, How it Works, Output Schema, Trading Methodology, Pitfalls, Verification

   C. references/indicator-behavior-analysis.md
      - Input reference table
      - Graphic element guide
      - Refinement instructions

   D. default.json
      - Default input preset from manifest.inputs values

   After writing, RUN:
     node --check <slug>/scripts/<slug>.cjs
     node <slug>/scripts/<slug>.cjs BTCUSDT --dry-run

   Report file paths, syntax-check result, and dry-run output." \
  --allowedTools "Read,Edit,Write,Bash" \
  --max-turns 25 \
  --output-format json
```

## Iterative Refinement

The first generation may misclassify graphic elements. The parent agent should:

1. Run the generated skill live:
   ```bash
   node <slug>/scripts/<slug>.cjs BTCUSDT --agent --out /tmp/live-test.json
   ```

2. Inspect the output:
   ```bash
   cat /tmp/live-test.json | jq '.summary'
   ```

3. If elements are miscategorized, pipe the live output back to Claude Code:
   ```bash
   cat /tmp/live-test.json | claude -p \
     "Refine parseGraphicOutput in <slug>/scripts/<slug>.cjs.
      The live output shows these elements are not correctly classified.
      Update heuristics and re-run dry-run." \
     --allowedTools "Read,Edit,Bash" \
     --max-turns 15
   ```

Typical refinement takes 1–2 iterations for complex indicators.
