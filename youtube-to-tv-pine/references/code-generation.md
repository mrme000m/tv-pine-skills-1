# Code Generation via Subagent Delegation

This skill does **not** use deterministic templates for code generation.
Instead, it delegates to a Hermes subagent that reasons about the indicator
and writes appropriate code.

## Why Delegation?

Pine script graphic output varies wildly:

| Indicator Type | Graphic Elements | Parser Complexity |
|----------------|------------------|-------------------|
| SMC (LuxAlgo) | Boxes (FVG/OB), Labels (BOS/CHoCH), Lines (trends) | High — many element types |
| Volume Profile | Boxes (rows), Tables (delta panel), fills | High — volume-based geometry |
| EMA Ribbon | Lines (5+ EMAs), fills (ribbon cloud), plots | Medium — line intersections |
| Oscillator | Plots (lines), hlines, bgcolor | Low — standard plots |
| Strategy | StrategyReport (trades/performance), arrows | High — trade table parsing |

A deterministic template would need to handle all of these, becoming unmaintainable.
A reasoning subagent with reference examples infers the correct approach per indicator.

## Delegation Flow

```
Parent Agent
│
├─ 1. Run context gatherer → manifest.json
├─ 2. Read reference skill files (1–2 examples)
├─ 3. Build delegation context string
│
└─► delegate_task(
      goal="Generate indicator runner and SKILL.md",
      context="manifest + reference files + requirements",
      toolsets=["terminal", "file"],
      max_iterations=50
    )

Subagent (isolated, fresh context)
│
├─ 1. Read manifest.json
├─ 2. Read reference skill examples
├─ 3. Reason about indicator behavior from inputs + description
├─ 4. Write <slug>/scripts/<slug>.cjs
├─ 5. Write <slug>/SKILL.md
├─ 6. Write <slug>/references/indicator-behavior-analysis.md
├─ 7. Run 'node --check' on runner
├─ 8. Run dry-run smoke test
└─ 9. Return: file paths, test results, warnings

Parent Agent
│
├─ 1. Review generated files
├─ 2. Run live test: node <slug>.cjs BTCUSDT --agent
└─ 3. Present to user (or delegate refinement)
```

## What the Subagent Generates

### 1. Runner Script (`scripts/<slug>.cjs`)

The subagent writes a Node.js script with these sections:

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
  // Subagent writes heuristic mappings based on manifest.inputs and reference examples
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

## Reference Examples for the Subagent

The parent agent should include 1–2 reference skill files in the delegation context:

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

## Subagent Prompt Template

```
You are generating a TradingView Pine Script skill. You have:

1. A manifest at /tmp/indicator-manifest.json containing:
   - indicator.name, indicator.slug, indicator.pineId
   - inputs (with types, defaults, options)
   - description
   - referenceSkills (paths to example skills)

2. Read these reference skill runners for code patterns:
   - <path1> (simple structure indicator)
   - <path2> (complex indicator matching the target type)

Generate the following files in <output-dir>/<slug>/:

A. scripts/<slug>.cjs
   - Standard boilerplate (root resolver, CLI, WebSocket runner)
   - INPUT_MAP built from manifest.inputs
   - parseGraphicOutput with heuristics appropriate for this indicator type
   - transformForAgentMode with <<<AGENT_JSON_START>>> delimiters
   - Use exit codes: SUCCESS=0, CRITICAL=1, NO_DATA=2, TIMEOUT=3, VALIDATION=4

B. SKILL.md
   - Hermes frontmatter with name, description, version, metadata.hermes tags
   - When to Use, How it Works, Output Schema, Trading Methodology, Pitfalls, Verification

C. references/indicator-behavior-analysis.md
   - Input reference table
   - Graphic element guide
   - Refinement instructions

D. default.json
   - Default input preset from manifest.inputs values

After writing, run:
  node --check scripts/<slug>.cjs
  node scripts/<slug>.cjs BTCUSDT --dry-run

Report any syntax errors or warnings.
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

3. If elements are miscategorized (e.g., boxes counted but none typed as FVG),
   delegate a refinement pass with the live output as context.

Typical refinement takes 1–2 iterations for complex indicators.
