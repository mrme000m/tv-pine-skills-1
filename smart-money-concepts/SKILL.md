---
name: smart-money-concepts
description: |
  Use the Smart Money Concepts [LuxAlgo] TradingView indicator to analyze market structure breaks (BOS/CHoCH), fair value gaps (FVG), order blocks (OB), and equal highs/lows for institutional-grade trade setups. This skill triggers when the user wants to: analyze smart money concepts, detect BOS/CHoCH, find fair value gaps, identify order block breakouts, analyze swing structure, or trade institutional order flow. Also triggers when the user runs `smart-money-concepts.cjs` or mentions terms like "SMC", "smart money", "BOS", "CHoCH", "FVG", "order block", "market structure", "liquidity", or "institutional".
version: 1.0.0
compatibility: Requires Node.js 18+, tv.cjs WebSocket client, and TradingView SESSION/SIGNATURE credentials
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, technical-analysis]
    category: trading
---

# Smart Money Concepts [LuxAlgo] — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `smart-money-concepts.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on institutional market structure analysis. The output includes:

- **Structure Events** — BOS (Break of Structure), CHoCH (Change of Character), Internal and Swing variants
- **Fair Value Gaps** — Bullish/Bearish FVGs for entry zones
- **Order Block Breakouts** — Internal and Swing OB breakouts
- **Equal Highs/Lows** — liquidity sweep detection
- **Swing Bias** — overall bullish/bearish/neutral bias from signal ratios

The skill connects raw indicator output to actionable trade logic: entry zones (at FVGs/OBs), trend direction (from BOS/CHoCH), and structural invalidation points.

## Dependencies

- `smart-money-concepts.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node smart-money-concepts.cjs BTCUSDT

# Specific timeframe
node smart-money-concepts.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node smart-money-concepts.cjs BTCUSDT --json --out smc.json

# Agent mode
node smart-money-concepts.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator identifies institutional market structure elements:
- **BOS (Break of Structure)** — price breaks beyond previous high/low in trend direction
- **CHoCH (Change of Character)** — price breaks previous high/low against prior trend (reversal)
- **FVG (Fair Value Gap)** — 3-candle imbalance where middle candle doesn't overlap
- **OB (Order Block)** — last opposing candle before a strong move
- **Equal Highs/Lows** — liquidity pools for sweeps

**Types:**
- Internal BOS/CHoCH — within current structure
- Swing BOS/CHoCH — at swing points (higher significance)
- Internal/Swing OB Breakouts — order block breaches

### Signal Detection

**Structure State:**
- Latest BOS/CHoCH event determines current structural bias
- Bullish BOS/CHoCH → bullish structure
- Bearish BOS/CHoCH → bearish structure

**Swing Bias:**
- STRONGLY_BULLISH → overwhelming bullish signals
- STRONGLY_BEARISH → overwhelming bearish signals
- BULLISH/BEARISH → moderate bias
- NEUTRAL → no clear bias

## Interpreting Output

### Structure State (Key Signal)

The latest BOS/CHoCH determines the structural direction.

**Trading logic:**
- **BULLISH_BOS** → continuation long, price breaking higher
- **BULLISH_CHOCH** → reversal long, downtrend broken
- **BEARISH_BOS** → continuation short, price breaking lower
- **BEARISH_CHOCH** → reversal short, uptrend broken

### Fair Value Gaps

FVGs are the primary entry zones in SMC trading.

**Trading logic:**
- **Bullish FVG** → long entry on retest of the gap
- **Bearish FVG** → short entry on retest of the gap
- FVG near current price = highest priority
- FVG in direction of structure = best confluence

### Order Block Breakouts

OB breakouts confirm institutional participation.

**Trading logic:**
- **Bullish OB Breakout** → strong buying, support established
- **Bearish OB Breakout** → strong selling, resistance established
- Swing OB > Internal OB in significance

### Equal Highs/Lows

EQHs/EQLs mark liquidity pools.

**Trading logic:**
- **Equal Highs** → likely liquidity sweep target above (short setup after sweep)
- **Equal Lows** → likely liquidity sweep target below (long setup after sweep)
- Sweep of EQH/EQL + reversal = high-probability setup

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Determine structure**
- Latest BOS/CHoCH = current structural direction
- Swing BOS/CHoCH > Internal in significance

**Step 2: Check swing bias**
- STRONGLY_BULLISH/BEARISH = highest confidence
- NEUTRAL = wait for structure to develop

**Step 3: Locate FVGs**
- Find FVGs in direction of structure
- Nearest FVG = best entry zone

**Step 4: Check OB breakouts**
- OB breakout in your direction = additional confirmation
- OB breakout against you = invalidation warning

**Step 5: Entry trigger**
- **Long**: Bullish CHoCH or BOS + bullish FVG + bullish OB breakout
- **Short**: Bearish CHoCH or BOS + bearish FVG + bearish OB breakout

### Stop Loss and Targets

- **Stop Loss**: Beyond the FVG or structure point that created the setup
- **Take Profit 1**: Next FVG in trade direction
- **Take Profit 2**: Equal high/low liquidity pool
- **Take Profit 3**: Opposite structure break

### When to AVOID Trading

- **NO_STRUCTURE** → no recent BOS/CHoCH, wait for development
- **NEUTRAL swing bias** → no directional edge
- **FVG against structure** → counter-trend, low probability
- **Recent CHoCH against your bias** → structure may be reversing

## Workflow

### Step 1: Run the Indicator

```bash
node smart-money-concepts.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **STRUCTURE** → state, latest event, swing bias
2. **COUNTS** → BOS, CHoCH, OB, FVG totals
3. **CURRENT BAR** → active signals

### Step 3: Construct Trade Story

**Example story (bullish):**
> "SMC structure: BULLISH_CHOCH (reversal). Swing bias: STRONGLY_BULLISH. BOS:8, CHoCH:5, FVG:12, OB:6. Latest bullish CHoCH 2 bars ago. Bullish FVG at 67150-67200. Bullish Swing OB breakout active. Strong long — entry on FVG retest, SL below CHoCH low at 67000, targeting next FVG at 67800."

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts)
- "Symbol load timeout" → Check symbol exists on TradingView
- No data → Check SESSION/SIGNATURE env vars

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for structure analysis |
| bars | 500 | Historical bars for BOS/CHoCH/FVG detection |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node smart-money-concepts.cjs BTCUSDT --input showStructureInput=false
```

**Available inputs:** modeInput (HISTORICAL), styleInput (COLORED), showTrendInput (false), showInternalsInput (true), showInternalBullInput (ALL), internalBullColorInput (GREEN), showInternalBearInput (ALL), internalBearColorInput (RED), internalFilterConfluenceInput (false), internalStructureSize (TINY), showStructureInput (true), showSwingBullInput (ALL), swingBullColorInput (GREEN), showSwingBearInput (ALL), swingBearColorInput (RED), swingStructureSize (SMALL), showSwingsInput (false), swingsLengthInput (50), showHighLowSwingsInput (true), showInternalOrderBlocksInput (true), internalOrderBlocksSizeInput (5), showSwingOrderBlocksInput (false), swingOrderBlocksSizeInput (5), orderBlockFilterInput (Atr), orderBlockMitigationInput (HIGHLOW), internalBullishOrderBlockColor (color.new(#3179f5, 80)), internalBearishOrderBlockColor (color.new(#f77c80, 80)), swingBullishOrderBlockColor (color.new(#1848cc, 80)), swingBearishOrderBlockColor (color.new(#b22833, 80)), showEqualHighsLowsInput (true), equalHighsLowsLengthInput (3), equalHighsLowsThresholdInput (0.1), equalHighsLowsSizeInput (TINY), showFairValueGapsInput (false), fairValueGapsThresholdInput (true), fairValueGapsTimeframeInput (), fairValueGapsBullColorInput (color.new(#00ff68, 70)), fairValueGapsBearColorInput (color.new(#ff0008, 70)), fairValueGapsExtendInput (1), showDailyLevelsInput (false), dailyLevelsStyleInput (SOLID), dailyLevelsColorInput (BLUE), showWeeklyLevelsInput (false), weeklyLevelsStyleInput (SOLID), weeklyLevelsColorInput (BLUE), showMonthlyLevelsInput (false), monthlyLevelsStyleInput (SOLID), monthlyLevelsColorInput (BLUE), showPremiumDiscountZonesInput (false), premiumZoneColorInput (RED), equilibriumZoneColorInput (GRAY), discountZoneColorInput (GREEN)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Graphic box parsing for FVGs and Order Blocks, Label parsing for BOS/CHoCH events, Active vs mitigated structure tracking, Structure hierarchy (swing vs internal), Structure bias scoring, Liquidity level extraction from EQH/EQL lines, Trend line classification

## Sources

- TradingView indicator: `PUB;6daafb2cabe6419d98ae25229d2327f8`
- Direct code-level analysis of LuxAlgo SMC structure parsing
