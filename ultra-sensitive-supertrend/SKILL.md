---
name: ultra-sensitive-supertrend
description: |
  Use the Ultra Sensitive SuperTrend TradingView indicator to analyze dual SuperTrend alignment, detect ultra buy/sell signals, and identify high-confidence trend entries based on double confirmation. This skill triggers when the user wants to: analyze dual supertrend alignment, detect ultra signals, find supertrend confluence, trade double confirmation setups, or identify early trend changes. Also triggers when the user runs `ultra-sensitive-supertrend.cjs` or mentions terms like "ultra supertrend", "dual supertrend", "super trend", "ultra buy", "ultra sell", "ST alignment", or "trend confirmation".
version: 1.0.0
compatibility: Requires Node.js 18+, tv.cjs WebSocket client, and TradingView SESSION/SIGNATURE credentials
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, technical-analysis]
    category: trading
---

# Ultra Sensitive SuperTrend — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `ultra-sensitive-supertrend.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on dual SuperTrend confirmation. The output includes:

- **Combined Trend** — BULLISH/BEARISH/MIXED from dual ST alignment
- **Alignment Status** — whether ST1 and ST2 agree
- **Signal Counts** — buy, sell, ultraBuy, ultraSell in lookback
- **Signal History** — timestamps of last signals
- **Background Trend** — additional trend filter

The skill connects raw indicator output to actionable trade logic: entry only when both STs align (highest confidence), ultra signals for early reversal detection, and background trend as additional filter.

## Dependencies

- `ultra-sensitive-supertrend.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node ultra-sensitive-supertrend.cjs BTCUSDT

# Specific timeframe
node ultra-sensitive-supertrend.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node ultra-sensitive-supertrend.cjs BTCUSDT --json --out supertrend.json

# Agent mode
node ultra-sensitive-supertrend.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator uses **two SuperTrend calculations** for confirmation:
- **ST1** — primary SuperTrend with color state (1=green/bull, 0=red/bear)
- **ST2** — secondary SuperTrend with color state (2=green/bull, 3=red/bear)
- **Background** — overall trend background (4=bull, 5=bear)

**Signal Types:**
- `BuySignal/SellSignal` — standard ST crossover signals
- `UltraBuy/UltraSell` — high-confidence early reversal signals

### Signal Detection

**Alignment Logic:**
- ST1 bullish (1) + ST2 bullish (2) → BULLISH alignment
- ST1 bearish (0) + ST2 bearish (3) → BEARISH alignment
- Any disagreement → MIXED

**Ultra Signals:**
- Generated at potential early reversal points
- Higher confidence than standard signals

## Interpreting Output

### Combined Trend (Key Signal)

Dual alignment is the primary quality filter.

**Trading logic:**
- **BULLISH + aligned** → long bias, highest confidence
- **BEARISH + aligned** → short bias, highest confidence
- **MIXED** → no trade, STs disagree

### Ultra Signals

Ultra signals indicate potential early reversals.

**Trading logic:**
- **UltraBuy** → strongest long signal, potential bottom
- **UltraSell** → strongest short signal, potential top
- Ultra signals in alignment = highest conviction
- Ultra signals against alignment = counter-trend, lower confidence

### Signal Distribution

Signal counts show market character.

**Trading logic:**
- Many signals + low alignment → choppy market
- Few signals + high alignment → strong trend
- Ultra signals > standard signals → volatile, reversals common

### Background Trend

Background provides additional confirmation.

**Trading logic:**
- Background = Combined Trend → triple confirmation
- Background disagrees → potential divergence, caution

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Check alignment**
- Aligned = trade setup possible
- Mixed = no trade

**Step 2: Check for ultra signal**
- Ultra signal in direction of alignment = best entry
- Standard signal = acceptable but lower confidence

**Step 3: Confirm with background**
- Background should support the trend
- Divergence = reduce size or wait

**Step 4: Check signal history**
- Recent signals clustered = potential reversal zone
- No recent signals = continuation mode

**Step 5: Entry trigger**
- **Long**: BULLISH aligned + UltraBuy (or BuySignal) + background bull
- **Short**: BEARISH aligned + UltraSell (or SellSignal) + background bear

### Stop Loss and Targets

- **Stop Loss**: Beyond ST1 or ST2 level (whichever is farther)
- **Take Profit 1**: 1:2 risk-to-reward
- **Take Profit 2**: Next ST flip
- **Take Profit 3**: When alignment breaks

### When to AVOID Trading

- **MIXED alignment** → STs disagree
- **Signal against alignment** → counter-trend
- **No signals in 50+ bars** → low volatility
- **Recent ultra signal followed by opposite standard signal** → whipsaw

## Workflow

### Step 1: Run the Indicator

```bash
node ultra-sensitive-supertrend.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **TREND** → combined, aligned, background
2. **SIGNALS** → buy, sell, ultra counts
3. **CURRENT BAR** → ST1, ST2, active signals

### Step 3: Construct Trade Story

**Example story (bullish):**
> "Ultra Sensitive ST: BULLISH, aligned. ST1=67150 (bull), ST2=67080 (bull), Background=BULLISH. Signals: Buy=8, UltraBuy=3. Current UltraBuy active. Last UltraBuy 2 bars ago. Strong long — entry on current signal, SL below ST2 at 67000, targeting 67800."

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts)
- "Symbol load timeout" → Check symbol exists on TradingView
- No data → Check SESSION/SIGNATURE env vars

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for dual ST calculation |
| bars | 500 | Historical bars for signal history |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node ultra-sensitive-supertrend.cjs BTCUSDT --input atrPeriod1=CUSTOM_VALUE
```

**Available inputs:** atrPeriod1 (10), multiplier1 (1), atrPeriod2 (5), multiplier2 (0.5), useHeikenAshi (true), showLabels (true), showBG (true)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Heiken-Ashi filter state calculation, Dual ST alignment scoring, Ultra signal divergence detection, Background trend consistency tracking, Signal strength matrix

## Sources

- TradingView indicator: `PUB;fc33f2d98699414a8585923116dbd959`
- Direct code-level analysis of dual ST color states and ultra signal detection
