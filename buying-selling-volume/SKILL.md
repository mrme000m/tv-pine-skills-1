---
name: buying-selling-volume
description: |
  Use the Buying Selling Volume TradingView indicator to analyze volume pressure, detect buying vs selling dominance, and identify MA cross signals for directional trade setups. This skill triggers when the user wants to: analyze volume pressure, detect buying vs selling volume, find volume-based trend signals, identify volume MA crosses, or trade volume decomposition patterns. Also triggers when the user runs `buying-selling-volume.cjs` or mentions terms like "buying volume", "selling volume", "volume pressure", "volume MA", or "volume decomposition".
---

# Buying Selling Volume — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `buying-selling-volume.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on volume pressure analysis. The output includes:

- **Buy/Sell Volume** — per-bar volume decomposition into buying and selling pressure
- **MA Cross Detection** — background color transitions signaling trend changes
- **Volume Bias** — dominant pressure over recent bars (bullish/bearish/neutral)
- **Pressure Bars** — recent bar-by-bar pressure analysis

The skill connects raw indicator output to actionable trade logic: entry timing (on MA cross), directional bias (from volume pressure), and trend confirmation (from background color).

## Dependencies

- `buying-selling-volume.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node buying-selling-volume.cjs BTCUSDT

# Specific timeframe
node buying-selling-volume.cjs ETHUSDT --tf 5m --bars 300

# JSON output
node buying-selling-volume.cjs BTCUSDT --json --out volume.json

# Agent mode
node buying-selling-volume.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator decomposes each bar's volume into:
- **Buy Volume** — volume when close > open (bullish candle)
- **Sell Volume** — volume when close <= open (bearish candle)
- **MA Buy/MA Sell** — moving averages of buy/sell volume
- **Bar Color** — state indicator (0=both above MAs, 1=both below, 2=mixed, 3=neutral)
- **Background Color** — trend state (4=bull, 5=bear, 6=mixed, 7=neutral)

### Signal Detection

**Background Color Transitions (MA Crosses):**
- Background changes to 4 (bull) → BULLISH_CROSS signal
- Background changes to 5 (bear) → BEARISH_CROSS signal
- These are the primary trend change alerts

## Interpreting Output

### Volume Pressure (Key Signal)

Buy volume > sell volume = bullish pressure. Sell volume > buy volume = bearish pressure.

**Trading logic:**
- **Buy pressure dominant** + background bull → strong long bias
- **Sell pressure dominant** + background bear → strong short bias
- **Mixed pressure** → indecision, wait for clarity
- **Pressure divergence** → price moving one way, volume the other = potential reversal

### MA Cross Signals

Background color transitions are the highest-confluence signals.

**Trading logic:**
- **BULLISH_CROSS** → consider long entry on pullback
- **BEARISH_CROSS** → consider short entry on bounce
- **No recent cross** → trend continuation mode, trade with trend
- **Multiple crosses in short period** → chop, avoid

### Volume Bias

The bias summarizes recent pressure over 20 bars.

**Trading logic:**
- **STRONGLY_BULLISH** → prioritize longs, tight SL
- **STRONGLY_BEARISH** → prioritize shorts, tight SL
- **NEUTRAL** → range-bound, wait for breakout

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Check volume bias**
- Look at the overall bias (bullish/bearish/neutral)
- This is your directional filter

**Step 2: Identify MA cross status**
- Background color = current trend
- Recent cross = potential entry timing

**Step 3: Confirm with pressure bars**
- Recent bars should show dominant pressure aligned with bias
- Divergence = caution

**Step 4: Entry trigger**
- **Long**: Bullish bias + recent bullish cross + buy pressure bars
- **Short**: Bearish bias + recent bearish cross + sell pressure bars

### Stop Loss and Targets

- **Stop Loss**: Beyond recent swing low/high or at MA level
- **Take Profit 1**: 1:2 risk-to-reward
- **Take Profit 2**: Next significant structural level
- **Take Profit 3**: When pressure shifts (opposite volume dominates)

### When to AVOID Trading

- **Neutral bias** → no directional edge
- **No MA cross in 50+ bars** → stale trend, low momentum
- **Pressure divergence** → price and volume disagree
- **Low absolute volume** → unreliable signals

## Workflow

### Step 1: Run the Indicator

```bash
node buying-selling-volume.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **VOLUME** → bias, avg volumes, max volumes
2. **CURRENT BAR** → buy/sell vol, MA levels, bar/background state
3. **TRANSITIONS** → recent MA crosses

### Step 3: Construct Trade Story

**Example story (bullish):**
> "Volume pressure is STRONGLY_BULLISH. Buy vol avg 2450 vs sell vol avg 1800. Last BULLISH_CROSS 3 bars ago. Current background is bull (4) with bar state BOTH_ABOVE. Buy pressure dominant in 14/20 recent bars. Long bias — entry on pullback to MA level, SL below recent swing."

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts)
- "Symbol load timeout" → Check symbol exists on TradingView
- No data → Check SESSION/SIGNATURE env vars

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for volume analysis |
| bars | 500 | Historical bars for MA and pressure calculation |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node buying-selling-volume.cjs BTCUSDT --input lengthMA1=CUSTOM_VALUE

# Use a preset
node buying-selling-volume.cjs BTCUSDT --preset scalping
```

**Available inputs:** lengthMA1 (10), lengthMA2 (10), maType (SMA)

**Presets:** scalping (9,21), default (20,50), swing (50,200)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Volume dominance ratio per bar, MA cross transition detection (BULLISH_CROSS/BEARISH_CROSS), Background trend consensus, Bar color state resolution (both_above/both_below/mixed/neutral)

## Sources

- TradingView indicator: `PUB;28a4da159ce246dab2cb6524c25f950f`
- Direct code-level analysis of period fields and state mappings
