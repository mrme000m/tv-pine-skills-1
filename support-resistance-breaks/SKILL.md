---
name: support-resistance-breaks
description: |
  Use the Support and Resistance Breaks TradingView indicator to detect pivot-based S/R level breaks, measure break intensity, and identify price position relative to key structural levels.
version: 1.0.0
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, support-resistance, pivot]
    category: trading
---

# Support and Resistance Breaks — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `support-resistance-breaks.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on pivot S/R break detection. The output includes:

- **Break Counts** — total breaks, support breaks, resistance breaks
- **Break Intensity** — frequency of breaks (breaks per bar)
- **Current Levels** — active support and resistance prices
- **Price Position** — ABOVE_RESISTANCE / BELOW_SUPPORT / BETWEEN_LEVELS
- **Distance to Levels** — how far price is from S/R

The skill connects raw indicator output to actionable trade logic: entry on confirmed breaks, fade false breaks, and use S/R levels as stop/target references.

## Dependencies

- `support-resistance-breaks.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node support-resistance-breaks.cjs BTCUSDT

# Specific timeframe
node support-resistance-breaks.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node support-resistance-breaks.cjs BTCUSDT --json --out breaks.json

# Agent mode
node support-resistance-breaks.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator detects breaks of pivot-based support and resistance levels:
- **Resistance** — calculated resistance price level
- **Support** — calculated support price level
- **Break/Break2/Break3/Break4** — different break types/confirmations
- **SupportBroken** — support was breached
- **ResistanceBroken** — resistance was breached

### Signal Detection

**Break Types:**
- Break1-4 represent different break confirmation levels
- SupportBroken/ResistanceBroken = confirmed breach

**Price Position:**
- ABOVE_RESISTANCE → breakout to upside
- BELOW_SUPPORT → breakdown to downside
- BETWEEN_LEVELS → within range

## Interpreting Output

### Price Position (Key Signal)

Price position relative to S/R is the primary setup identifier.

**Trading logic:**
- **ABOVE_RESISTANCE** → long bias, resistance now support
- **BELOW_SUPPORT** → short bias, support now resistance
- **BETWEEN_LEVELS** → range-bound, trade the range or wait

### Break Intensity

Break frequency indicates volatility and momentum.

**Trading logic:**
- **High intensity (>5%)** → volatile market, many opportunities
- **Low intensity (<2%)** → calm market, fewer but cleaner setups
- **Sudden intensity spike** → potential trend change

### Break Distribution

Support vs resistance break counts show directional bias.

**Trading logic:**
- More resistance breaks → bullish momentum
- More support breaks → bearish momentum
- Balanced → ranging, no clear bias

### Distance to Levels

Proximity to S/R levels helps with entry timing.

**Trading logic:**
- **Near resistance in uptrend** → watch for breakout
- **Near support in downtrend** → watch for breakdown
- **At nearest level** → highest probability test/setup

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Check price position**
- Above resistance or below support = directional setup
- Between levels = range trade or wait

**Step 2: Check break intensity**
- High intensity = volatile, use wider stops
- Low intensity = calm, tighter stops work

**Step 3: Check break distribution**
- More breaks in your direction = confirmation
- Opposite breaks increasing = potential reversal

**Step 4: Check distance to levels**
- Near level = potential test/setup
- Far from levels = momentum trade

**Step 5: Entry trigger**
- **Long**: Price above resistance + high break intensity + resistance breaks dominant
- **Short**: Price below support + high break intensity + support breaks dominant

### Stop Loss and Targets

- **Stop Loss**: Below broken resistance (for longs) or above broken support (for shorts)
- **Take Profit 1**: Next S/R level in trade direction
- **Take Profit 2**: Measured move from broken level
- **Take Profit 3**: When break intensity drops significantly

### When to AVOID Trading

- **BETWEEN_LEVELS with no recent breaks** → no directional edge
- **Very high intensity with mixed breaks** → chop, avoid
- **Price far from levels after break** → missed entry, wait for retest
- **Break intensity < 1%** → dead market

## Workflow

### Step 1: Run the Indicator

```bash
node support-resistance-breaks.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **BREAKS** → total, support, resistance, intensity
2. **CURRENT BAR** → close, S/R levels, position, distances
3. **RECENT BREAKS** → last 20 break events

### Step 3: Construct Trade Story

**Example story (bullish):**
> "Price is ABOVE_RESISTANCE at 68900. Break intensity: 0.045 (4.5%). Resistance breaks: 12 vs Support breaks: 5. Current resistance: 68900, support: 67200. Distance to resistance: 0 (just broke). Strong long — entry on retest of 68900 as support, SL at 68650, targeting 70000 (next structural level)."


## Verification

To confirm this skill executed correctly:

1. Run `node support-resistance-breaks.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts)
- "Symbol load timeout" → Check symbol exists on TradingView
- No data → Check SESSION/SIGNATURE env vars

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for S/R calculation |
| bars | 500 | Historical bars for pivot and break detection |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node support-resistance-breaks.cjs BTCUSDT --input pivotLookback=CUSTOM_VALUE
```

**Available inputs:** pivotLookback (5), pivotStrength (3), showSupport, showResistance, showBreaks, breakIntensity (2), alertOnBreak, srColor, breakColor, lineWidth (2)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Break intensity calculation (max/avg simultaneous breaks), Confluence cluster detection from break prices, S/R level extraction and deduplication, Price position relative to S/R levels, Support/Resistance broken flag tracking, Break type classification (break1-4)

## Sources

- TradingView indicator: `PUB;NXS6SoOdr880Hrvh9vA36UcAjC14bOkc`
- Direct code-level analysis of break detection and S/R level parsing
