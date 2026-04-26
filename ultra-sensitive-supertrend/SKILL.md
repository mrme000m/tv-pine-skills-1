---
name: ultra-sensitive-supertrend
description: |
  Use the Ultra Sensitive SuperTrend TradingView indicator to analyze dual SuperTrend alignment, detect ultra buy/sell signals, and identify high-confidence trend entries based on double confirmation.
version: 1.0.0
license: MIT
author: TradingView Pine Skills
compatibility: Node.js 18+ with tv-optimized.cjs, tv.cjs, agent-output.cjs and .env (SESSION, SIGNATURE) at project root
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, supertrend, dual]
    category: trading
required_environment_variables:
  - name: SESSION
    prompt: TradingView session cookie
    help: Extract from browser DevTools → Application → Cookies → tradingview.com → sessionid
    required_for: full functionality
  - name: SIGNATURE
    prompt: TradingView signature cookie
    help: Extract from browser DevTools → Application → Cookies → tradingview.com → sessionid_sign
    required_for: full functionality
---

# Ultra Sensitive SuperTrend — Trading Opportunity Finder

## When to Use

Helps the user run the standalone `ultra-sensitive-supertrend.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on dual SuperTrend confirmation. The output includes:

- **Combined Trend** — BULLISH/BEARISH/MIXED from dual ST alignment
- **Alignment Status** — whether ST1 and ST2 agree
- **Signal Counts** — buy, sell, ultraBuy, ultraSell in lookback
- **Signal History** — timestamps of last signals
- **Background Trend** — additional trend filter

The skill connects raw indicator output to actionable trade logic: entry only when both STs align (highest confidence), ultra signals for early reversal detection, and background trend as additional filter.

## Dependencies

- `scripts/ultra-sensitive-supertrend.cjs` in the skill directory (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node scripts/ultra-sensitive-supertrend.cjs BTCUSDT

# Specific timeframe
node scripts/ultra-sensitive-supertrend.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node scripts/ultra-sensitive-supertrend.cjs BTCUSDT --json --out supertrend.json

# Agent mode
node scripts/ultra-sensitive-supertrend.cjs BTCUSDT --agent
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

## Procedure

### Step 1: Run the Indicator

```bash
node scripts/ultra-sensitive-supertrend.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **TREND** → combined, aligned, background
2. **SIGNALS** → buy, sell, ultra counts
3. **CURRENT BAR** → ST1, ST2, active signals

### Step 3: Construct Trade Story

**Example story (bullish):**
> "Ultra Sensitive ST: BULLISH, aligned. ST1=67150 (bull), ST2=67080 (bull), Background=BULLISH. Signals: Buy=8, UltraBuy=3. Current UltraBuy active. Last UltraBuy 2 bars ago. Strong long — entry on current signal, SL below ST2 at 67000, targeting 67800."


## Pitfalls
- MIXED alignment → STs disagree; no trade until both agree
- Ultra signal without alignment → early reversal may fail; wait for dual ST confirmation
- **Missing SESSION/SIGNATURE**: The most common failure. Ensure `.env` contains valid TradingView session credentials.
- **"Maximum number of studies"**: TradingView rate-limits concurrent studies. Built-in retry (3 attempts) handles this; wait 30s if persistent.
- **Symbol not found**: Verify the symbol exists on TradingView (e.g., `BTCUSDT` not `BTC`).
- **Low bar count**: Some indicators need more bars than default (500). Increase with `--bars <N>`.
- **Network timeouts**: Check internet connectivity and TradingView status.

## Verification

To confirm this skill executed correctly:

1. Run `node scripts/ultra-sensitive-supertrend.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data


## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for dual ST calculation |
| bars | 500 | Historical bars for signal history |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node scripts/ultra-sensitive-supertrend.cjs BTCUSDT --input atrPeriod1=CUSTOM_VALUE
```

**Available inputs:** atrPeriod1 (10), multiplier1 (1), atrPeriod2 (5), multiplier2 (0.5), useHeikenAshi (true), showLabels (true), showBG (true)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Heiken-Ashi filter state calculation, Dual ST alignment scoring, Ultra signal divergence detection, Background trend consistency tracking, Signal strength matrix

## Sources

- TradingView indicator: `PUB;fc33f2d98699414a8585923116dbd959`
- Direct code-level analysis of dual ST color states and ultra signal detection
