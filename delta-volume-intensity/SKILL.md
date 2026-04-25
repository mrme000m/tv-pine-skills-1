---
name: delta-volume-intensity
description: |
  Use the Delta Volume Intensity TradingView indicator to analyze trend direction, support/resistance levels, and rate-of-change momentum for structural trade setups. This skill triggers when the user wants to: analyze delta volume trends, detect trend changes, find support/resistance levels from volume analysis, identify ROC momentum shifts, or trade trend-alert signals. Also triggers when the user runs `delta-volume-intensity.cjs` or mentions terms like "delta volume", "volume intensity", "trend alert", "volume ROC", "volume momentum", or "delta intensity".
version: 1.0.0
compatibility: Requires Node.js 18+, tv.cjs WebSocket client, and TradingView SESSION/SIGNATURE credentials
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, technical-analysis]
    category: trading
---

# Delta Volume Intensity — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `delta-volume-intensity.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on trend + momentum analysis. The output includes:

- **Trend State** — UPTREND / DOWNTREND / SIDEWAYS classification
- **Support/Resistance Levels** — calculated S/R from volume structure
- **ROC Momentum** — rate-of-change for momentum confirmation
- **ATR** — volatility context for position sizing
- **Alert History** — recent uptrend/downtrend/sideways alert signals

The skill connects raw indicator output to actionable trade logic: entry timing (on trend alerts), directional bias (from trend state), and risk context (from ATR).

## Dependencies

- `delta-volume-intensity.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node delta-volume-intensity.cjs BTCUSDT

# Specific timeframe
node delta-volume-intensity.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node delta-volume-intensity.cjs BTCUSDT --json --out delta.json

# Agent mode
node delta-volume-intensity.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator analyzes volume delta (buy vs sell pressure) to determine:
- **Trend** — 0=NEUTRAL, 1=UPTREND, 2=DOWNTREND, 3=SIDEWAYS
- **BackgroundTrend** — same states for background coloring
- **Support/Resistance** — calculated levels from volume structure
- **ATR** — average true range for volatility context
- **ROC** — rate of change for momentum
- **Alerts** — uptrendAlert, downtrendAlert, sidewaysAlert (binary signals)

### Signal Detection

**Trend Alerts:**
- `uptrendAlert = 1` → new uptrend detected
- `downtrendAlert = 1` → new downtrend detected
- `sidewaysAlert = 1` → ranging market detected

**Trend Alignment:**
- Trend == BackgroundTrend → strong directional confirmation
- Trend != BackgroundTrend → potential transition or weak signal

## Interpreting Output

### Trend State (Key Signal)

The trend state is the primary directional filter.

**Trading logic:**
- **UPTREND** → long bias, buy pullbacks to support
- **DOWNTREND** → short bias, sell bounces to resistance
- **SIDEWAYS** → range trade between support/resistance, or wait for breakout
- **NEUTRAL** → no trade, wait for clarity

### Support/Resistance Levels

Volume-derived S/R levels are often more reliable than price-only levels.

**Trading logic:**
- Price near support + uptrend → long entry zone
- Price near resistance + downtrend → short entry zone
- Price breaks S/R with alert → trend continuation/breakout trade
- S/R levels converging → volatility compression, big move imminent

### ROC Momentum

Rate of change confirms trend strength.

**Trading logic:**
- **Positive ROC + UPTREND** → accelerating momentum, add to longs
- **Negative ROC + DOWNTREND** → accelerating momentum, add to shorts
- **ROC weakening** → trend exhaustion, prepare for reversal
- **High ROC in sideways** → false breakout likely

### ATR Context

ATR helps with stop placement and position sizing.

**Trading logic:**
- **High ATR** → wider stops, smaller position size
- **Low ATR** → tighter stops, potential breakout setup
- **ATR expansion** → volatility increasing, confirm with alerts

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Determine trend state**
- Check current trend and background trend
- Both aligned = strongest signal

**Step 2: Check S/R levels**
- Note current support and resistance prices
- Price position relative to these levels

**Step 3: Confirm with ROC**
- ROC should support the trend direction
- Weakening ROC = caution

**Step 4: Check for alerts**
- Recent alert = potential entry timing
- No recent alert = continuation mode

**Step 5: Entry trigger**
- **Long**: UPTREND + price at/near support + positive ROC + recent uptrend alert
- **Short**: DOWNTREND + price at/near resistance + negative ROC + recent downtrend alert

### Stop Loss and Targets

- **Stop Loss**: Based on ATR (e.g., 1.5× ATR beyond S/R level)
- **Take Profit 1**: Next S/R level in trade direction
- **Take Profit 2**: 2× ATR measured move
- **Take Profit 3**: When trend alert fires in opposite direction

### When to AVOID Trading

- **SIDEWAYS without S/R range** → no defined levels to trade
- **Trend != BackgroundTrend** → conflicting signals
- **ROC near zero** → no momentum
- **Low ATR + no alerts** → dead market

## Workflow

### Step 1: Run the Indicator

```bash
node delta-volume-intensity.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **TREND** → dominant trend, distribution across bars
2. **CURRENT BAR** → S/R levels, trend state, ROC, ATR
3. **ALERTS** → recent alert history

### Step 3: Construct Trade Story

**Example story (bullish):**
> "Delta Volume shows UPTREND dominant (312 of 500 bars). Current trend=UPTREND, background=UPTREND. Support at 67200, resistance at 68900. ROC is +2.4% (positive momentum). Last uptrend alert 5 bars ago. ATR is 145. Long bias — entry on pullback to 67200 support, SL at 66950 (1.7× ATR below), targeting 68900 resistance."

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts)
- "Symbol load timeout" → Check symbol exists on TradingView
- No data → Check SESSION/SIGNATURE env vars

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for trend analysis |
| bars | 500 | Historical bars for trend and S/R calculation |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node delta-volume-intensity.cjs BTCUSDT --input length_volatility=CUSTOM_VALUE
```

**Available inputs:** length_volatility (14), length_momentum (14), lookback_sr (7)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

S/R break detection with price-level tracking, Volatility regime classification (EXPANDING/CONTRACTING/NORMAL), Momentum state classification (STRONG_BULL/BULL/STRONG_BEAR/BEAR/NEUTRAL), Trend consensus from bar distribution, Alert trigger history

## Sources

- TradingView indicator: `PUB;bdd3bc54cf9f4dc6b42e6b2879b4eed2`
- Direct code-level analysis of trend states, S/R fields, and alert detection
