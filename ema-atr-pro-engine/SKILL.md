---
name: ema-atr-pro-engine
description: |
  Use the EMA + ATR PRO Ultimate Engine TradingView indicator to track signal activation history, analyze EMA trail trends, and identify high-probability entry/exit setups based on ATR-based trailing stops and EMA crossovers.
version: 1.0.0
license: MIT
author: TradingView Pine Skills
compatibility: Node.js 18+ with tv-optimized.cjs, tv.cjs, agent-output.cjs and .env (SESSION, SIGNATURE) at project root
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, ema, atr-trail]
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

# EMA + ATR PRO Ultimate Engine — Trading Opportunity Finder

## When to Use

Helps the user run the standalone `ema-atr-pro-engine.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on EMA trail and ATR signal analysis. The output includes:

- **Trail Trend** — ATR-based trail direction (BULLISH/BEARISH)
- **Signal Counts** — total buy/sell signals and reentries in lookback
- **EMA Levels** — EMA2 and EMA3 values for trend context
- **Signal History** — bar-by-bar tracking of active signals, SL levels, trade durations

The skill connects raw indicator output to actionable trade logic: entry zones (at signal activation), exit timing (on trail flip), and trend context (from EMA alignment).

## Dependencies

- `scripts/ema-atr-pro-engine.cjs` in the skill directory (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node scripts/ema-atr-pro-engine.cjs BTCUSDT

# Specific timeframe
node scripts/ema-atr-pro-engine.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node scripts/ema-atr-pro-engine.cjs BTCUSDT --json --out engine.json

# Agent mode
node scripts/ema-atr-pro-engine.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator combines EMA crossovers with ATR-based trailing stops:
- **Trail** — ATR-based trailing stop level
- **EMA2/EMA3** — fast and slow exponential moving averages
- **BuySignal/SellSignal** — signal activation flags
- **BuyReentry/SellReentry** — re-entry mode flags
- **TrailColor** — visual indicator of trail state

### Signal Detection

**Primary Signals:**
- `BuySignal = 1` → new long signal activated
- `SellSignal = 1` → new short signal activated

**Re-entry Signals:**
- `BuyReentry = 1` → re-enter long after stop-out
- `SellReentry = 1` → re-enter short after stop-out

**Trail Trend:**
- Close > Trail → BULLISH trail context
- Close < Trail → BEARISH trail context

## Interpreting Output

### Trail Trend (Key Signal)

The ATR trail acts as dynamic support/resistance.

**Trading logic:**
- **Price above trail** → bullish context, trail acts as support
- **Price below trail** → bearish context, trail acts as resistance
- **Trail flip** → potential trend change, highest-confluence signal

### Signal Activation

Buy/Sell signals mark potential entry points.

**Trading logic:**
- **Buy signal + bullish trail** → high-confluence long entry
- **Sell signal + bearish trail** → high-confluence short entry
- **Signal against trail** → counter-trend, lower confidence
- **No signals in lookback** → ranging/choppy market

### Re-entry Mode

Reentry flags indicate the indicator is trying to re-establish a position after being stopped out.

**Trading logic:**
- **Reentry active** → manage risk carefully, previous trade failed
- **Multiple reentries** → whipsaw environment, reduce size or avoid

### EMA Context

EMA2 vs EMA3 provides additional trend confirmation.

**Trading logic:**
- EMA2 > EMA3 + buy signal → strong bullish alignment
- EMA2 < EMA3 + sell signal → strong bearish alignment
- EMA2 near EMA3 → consolidation, wait for separation

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Check trail trend**
- Bullish or bearish trail context
- This is your primary directional filter

**Step 2: Look for signal alignment**
- Buy signal in bullish trail = long
- Sell signal in bearish trail = short

**Step 3: Confirm with EMAs**
- EMA2 should align with signal direction
- EMA2 crossing EMA3 = additional confirmation

**Step 4: Check for reentry**
- Reentry mode = previous signal failed, reduce confidence

**Step 5: Entry trigger**
- **Long**: Bullish trail + buy signal + EMA2 > EMA3
- **Short**: Bearish trail + sell signal + EMA2 < EMA3

### Stop Loss and Targets

- **Stop Loss**: Trail level (this is the indicator's built-in stop)
- **Take Profit 1**: 1:2 risk-to-reward from trail
- **Take Profit 2**: Next EMA resistance/support
- **Take Profit 3**: Opposite signal activation

### When to AVOID Trading

- **No signals in 100+ bars** → low volatility or ranging
- **Reentry mode** → previous signal failed, market choppy
- **Signal against trail trend** → counter-trend, low probability
- **EMA2 near EMA3** → no trend, wait for separation

## Procedure

### Step 1: Run the Indicator

```bash
node scripts/ema-atr-pro-engine.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **SUMMARY** → trail trend, signal counts, reentries
2. **CURRENT BAR** → trail, EMA2, EMA3, active signals
3. **LAST 10 BARS** → recent trail and signal history

### Step 3: Construct Trade Story

**Example story (bullish):**
> "EMA+ATR Engine shows BULLISH trail trend. Buy signals: 8, Sell signals: 3. Current trail at 67120, EMA2 at 67250, EMA3 at 67080. Active buy signal with no reentry. Price above trail and EMA2 > EMA3. Long bias — entry on current signal, SL at trail (67120), targeting 67800."


## Pitfalls
- No signals in 100+ bars → low volatility or ranging market
- Reentry mode → previous signal failed, reduce position size or avoid
- **Missing SESSION/SIGNATURE**: The most common failure. Ensure `.env` contains valid TradingView session credentials.
- **"Maximum number of studies"**: TradingView rate-limits concurrent studies. Built-in retry (3 attempts) handles this; wait 30s if persistent.
- **Symbol not found**: Verify the symbol exists on TradingView (e.g., `BTCUSDT` not `BTC`).
- **Low bar count**: Some indicators need more bars than default (500). Increase with `--bars <N>`.
- **Network timeouts**: Check internet connectivity and TradingView status.

## Verification

To confirm this skill executed correctly:

1. Run `node scripts/ema-atr-pro-engine.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data


## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for EMA/ATR calculation |
| bars | 500 | Historical bars for signal history |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node scripts/ema-atr-pro-engine.cjs BTCUSDT --input ema2Len=CUSTOM_VALUE
```

**Available inputs:** ema2Len (20), ema3Len (50), useEMA2 (true), useEMA3 (false), pivotLen (1), atrLen (7), atrMult (1.4), confirmClose (true), fastMode (false), enableReentry (false), buyColor (color.rgb(5, 7, 12)), sellColor (color.gray), textColor (color.white), bullTrailColor (color.rgb(94, 255, 0)), bearTrailColor (color.red)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Graphic label parsing for BUY/SELL/BUY+/SELL+ labels, Trail state timeline tracking, Re-entry signal tracking with duration, EMA trend filter logic, Win/loss statistics, Signal open/close bar-by-bar tracking

## Sources

- TradingView indicator: `PUB;7d5f8755ab67400899ef73a9898471e4`
- Direct code-level analysis of signal fields, trail logic, and EMA context
