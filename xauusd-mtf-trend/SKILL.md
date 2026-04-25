---
name: xauusd-mtf-trend
description: |
  Use the XAUUSD MTF Trend Dashboard TradingView indicator to analyze multi-timeframe trend alignment across multiple timeframes and identify high-probability directional bias for XAUUSD and other symbols. This skill triggers when the user wants to: analyze multi-timeframe trends, check MTF alignment, detect cross-timeframe bias, find MTF confluence, or trade with multi-timeframe confirmation. Also triggers when the user runs `xauusd-mtf-trend.cjs` or mentions terms like "MTF trend", "multi timeframe", "timeframe alignment", "MTF dashboard", "trend dashboard", or "cross timeframe".
---

# XAUUSD MTF Trend Dashboard — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `xauusd-mtf-trend.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on multi-timeframe trend alignment. The output includes:

- **MTF Entries** — trend readings across multiple timeframes (from graphic tables)
- **Overall Bias** — STRONGLY_BULLISH / STRONGLY_BEARISH / BULLISH / BEARISH / NEUTRAL
- **Trend Labels** — annotated trend signals from graphic labels
- **Levels** — horizontal lines as S/R references

The skill connects raw indicator output to actionable trade logic: directional bias (from MTF alignment), entry timing (when lower TFs align with higher TF bias), and trend strength (from agreement count).

## Dependencies

- `xauusd-mtf-trend.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run (XAUUSD)
node xauusd-mtf-trend.cjs XAUUSD

# Other symbols
node xauusd-mtf-trend.cjs BTCUSDT --tf 1h --bars 1000

# JSON output
node xauusd-mtf-trend.cjs XAUUSD --json --out mtf.json

# Agent mode
node xauusd-mtf-trend.cjs XAUUSD --agent
```

## How the Indicator Works

### Core Architecture

This is a **graphics-only dashboard** indicator. All data comes from `study.graphic`:
- **dwgTables** — MTF dashboard tables with trend readings per timeframe
- **dwgLabels** — trend annotations (bull/bear/buy/sell text)
- **dwgLines** — horizontal S/R levels

### Data Extraction

The parser extracts:
- **Table cells** — text content parsed for timeframe and trend direction
- **Trend labels** — labels with bull/bear/buy/sell annotations
- **Horizontal lines** — price levels for S/R context

### MTF Logic

- Multiple timeframes analyzed simultaneously (typically 1m, 5m, 15m, 1h, 4h, 1D)
- Each timeframe shows its own trend direction
- Overall bias calculated from weighted agreement across timeframes

## Interpreting Output

### Overall Bias (Key Signal)

The MTF bias is the primary directional filter.

**Trading logic:**
- **STRONGLY_BULLISH** → all or most TFs bullish, strongest long bias
- **STRONGLY_BEARISH** → all or most TFs bearish, strongest short bias
- **BULLISH** → more bullish than bearish TFs
- **BEARISH** → more bearish than bullish TFs
- **NEUTRAL** → mixed, no clear bias

### Timeframe Agreement

More timeframes agreeing = higher confidence.

**Trading logic:**
- **All TFs aligned** → highest conviction, trade with trend
- **Higher TFs aligned, lower TFs mixed** → macro trend intact, wait for lower TF alignment
- **Lower TFs aligned, higher TFs against** → counter-trend, low probability
- **Mixed across all TFs** → chop, avoid

### Trend Labels

Labels provide additional context.

**Trading logic:**
- Bullish labels near current price → support
- Bearish labels near current price → resistance
- Label cluster = strong confluence zone

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Check overall bias**
- STRONGLY_BULLISH/BEARISH = trade in that direction
- NEUTRAL = wait

**Step 2: Analyze timeframe alignment**
- Higher TFs (1h, 4h, 1D) determine macro direction
- Lower TFs (1m, 5m, 15m) determine entry timing

**Step 3: Wait for lower TF alignment**
- Trade when lower TFs align with higher TF bias
- Higher TFs bullish + lower TFs turning bullish = best long entry

**Step 4: Check labels for confluence**
- Labels at entry zone = additional confirmation
- No labels = lower confidence

**Step 5: Entry trigger**
- **Long**: STRONGLY_BULLISH or BULLISH + lower TFs turning bullish
- **Short**: STRONGLY_BEARISH or BEARISH + lower TFs turning bearish

### Stop Loss and Targets

- **Stop Loss**: Beyond nearest labeled level or recent swing
- **Take Profit 1**: Next significant level in trade direction
- **Take Profit 2**: When lower TFs start diverging from higher TFs
- **Take Profit 3**: When overall bias shifts

### When to AVOID Trading

- **NEUTRAL bias** → no directional edge
- **Higher TFs against lower TFs** → conflicting signals
- **Only 1-2 TFs showing direction** → insufficient confirmation
- **Mixed labels at entry zone** → indecision

## Workflow

### Step 1: Run the Indicator

```bash
node xauusd-mtf-trend.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **MTF DATA** → entries per timeframe, trend readings
2. **BIAS** → overall bullish/bearish/neutral count
3. **LEVELS** → S/R lines for context

### Step 3: Construct Trade Story

**Example story (bullish):**
> "MTF Dashboard: STRONGLY_BULLISH. 5 of 6 timeframes bullish (1m mixed, rest bull). Labels show bull annotations at 67100 and 67350. Level at 67000 acting as support. Higher TFs (1h, 4h, 1D) all bullish. Lower TFs aligning. Long bias — entry on 1m turning bullish, SL below 67000, targeting 68000."

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts)
- "Symbol load timeout" → Check symbol exists on TradingView
- No MTF data → Indicator may need more bars or different timeframe
- Graphics format mismatch → Table/label format may differ from expected

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for MTF calculation |
| bars | 500 | Historical bars for MTF analysis |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node xauusd-mtf-trend.cjs BTCUSDT --input show_M15=CUSTOM_VALUE
```

**Available inputs:** show_M15 (true), show_M30 (true), show_H1 (true), show_H4 (true), show_D1 (true), fastLength (10), slowLength (20), rsiLength (14), rsiOverbought (70), rsiOversold (30), macdFastLength (12), macdSlowLength (26), macdSignalLength (9), bbLength (20), bbMultiplier (2), dmiLength (14), dmiSmoothing (14), sarStartValue (0.02), sarIncrement (0.02), sarMaxValue (0.2)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Graphic table parsing for MTF dashboard (dwgTables/dwgTableCells), Trend label extraction from dwgLabels, S/R level extraction from dwgLines, Timeframe confluence scoring, Net strength calculation across TFs, Divergence detection between timeframes

## Sources

- TradingView indicator: `PUB;d1ad30c0261f49f297357f8aa2a7854a`
- Direct code-level analysis of `graphic.dwgTables`, `dwgLabels`, and `dwgLines` output structure
