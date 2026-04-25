---
name: shemar-smc-confidence
description: |
  Use the SHEMAR HMA ST + SMC Confidence Filter TradingView indicator to analyze HMA, Supertrend, and Kernel convergence for high-confidence filtered trading signals. This skill triggers when the user wants to: analyze HMA supertrend alignment, detect kernel convergence, find SMC confidence signals, filter raw signals for quality, or trade with multi-indicator confirmation. Also triggers when the user runs `shemar-smc-confidence.cjs` or mentions terms like "SHEMAR", "HMA supertrend", "SMC confidence", "kernel convergence", "filtered signals", or "multi-indicator alignment".
version: 1.0.0
compatibility: Requires Node.js 18+, tv.cjs WebSocket client, and TradingView SESSION/SIGNATURE credentials
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, technical-analysis]
    category: trading
---

# SHEMAR HMA ST + SMC Confidence Filter — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `shemar-smc-confidence.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on multi-indicator convergence. The output includes:

- **Alignment State** — FULLY_ALIGNED_BULLISH / FULLY_ALIGNED_BEARISH / MIXED
- **Indicator States** — HMA bullish/bearish, Supertrend bullish/bearish, Kernel position
- **Signal Counts** — raw buy/sell signals vs filtered (high-confidence) signals
- **Close Signals** — exit signal counts

The skill connects raw indicator output to actionable trade logic: entry only on filtered signals (highest confidence), trend alignment as directional filter, and kernel as additional confirmation.

## Dependencies

- `shemar-smc-confidence.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node shemar-smc-confidence.cjs BTCUSDT

# Specific timeframe
node shemar-smc-confidence.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node shemar-smc-confidence.cjs BTCUSDT --json --out smc.json

# Agent mode
node shemar-smc-confidence.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator combines three analysis layers:
- **HMA (Hull Moving Average)** — fast, smooth trend indicator with color state
- **Supertrend** — volatility-based trend following with color state
- **Kernel** — regression-based equilibrium/ML estimate

**Signal Types:**
- `Buy/Sell` — raw signals from individual indicators
- `FilteredBuy/FilteredSell` — high-confidence signals requiring alignment
- `CloseBuy/CloseSell` — exit signals

### Signal Detection

**Alignment Logic:**
- HMA bullish + Supertrend bullish + Kernel above HMA → FULLY_ALIGNED_BULLISH
- HMA bearish + Supertrend bearish + Kernel below HMA → FULLY_ALIGNED_BEARISH
- Any disagreement → MIXED

**Filtered Signals:**
- Only generated when alignment is FULLY_ALIGNED
- These are the highest-probability setups

## Interpreting Output

### Alignment State (Key Signal)

Alignment is the primary quality filter.

**Trading logic:**
- **FULLY_ALIGNED_BULLISH** → long bias, wait for FilteredBuy
- **FULLY_ALIGNED_BEARISH** → short bias, wait for FilteredSell
- **MIXED** → no trade, indicators disagree

### Filtered vs Raw Signals

Raw signals are noisy. Filtered signals are the ones to trade.

**Trading logic:**
- **FilteredBuy** → high-confidence long entry
- **FilteredSell** → high-confidence short entry
- **Raw signal without filter** → low confidence, ignore or reduce size
- **More raw than filtered** → market is choppy, alignment rarely achieved

### HMA + Supertrend + Kernel

Individual components provide context.

**Trading logic:**
- HMA bullish + ST bullish = strong uptrend
- Kernel crossing HMA = potential early trend change
- All three aligned = highest conviction

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Check alignment**
- FULLY_ALIGNED = trade setup possible
- MIXED = no trade

**Step 2: Wait for filtered signal**
- Only trade FilteredBuy/FilteredSell
- Raw signals alone are insufficient

**Step 3: Confirm with kernel**
- Kernel should support the direction
- Kernel divergence = caution

**Step 4: Check recent closes**
- CloseBuy/CloseSell recently active → previous trade failed, reassess

**Step 5: Entry trigger**
- **Long**: FULLY_ALIGNED_BULLISH + FilteredBuy
- **Short**: FULLY_ALIGNED_BEARISH + FilteredSell

### Stop Loss and Targets

- **Stop Loss**: Recent swing or Supertrend level
- **Take Profit 1**: 1:2 risk-to-reward
- **Take Profit 2**: Next structural level
- **Take Profit 3**: When alignment breaks to MIXED

### When to AVOID Trading

- **MIXED alignment** → indicators disagree
- **No filtered signals** → SMC confidence too low
- **Recent close signal** → previous setup failed
- **Raw signal only** → insufficient confirmation

## Workflow

### Step 1: Run the Indicator

```bash
node shemar-smc-confidence.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **SIGNALS** → raw vs filtered counts
2. **ALIGNMENT** → HMA, ST, Kernel states
3. **CURRENT BAR** → active signals

### Step 3: Construct Trade Story

**Example story (bullish):**
> "SHEMAR alignment: FULLY_ALIGNED_BULLISH. HMA=bull, ST=bull, Kernel=67120 > HMA=67050. Raw buy: 12, Filtered buy: 8. Current FilteredBuy active. No recent close signals. High-confidence long — entry on current filtered signal, SL below Supertrend at 66900, targeting 67800."

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts)
- "Symbol load timeout" → Check symbol exists on TradingView
- No data → Check SESSION/SIGNATURE env vars

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for HMA/ST/Kernel calculation |
| bars | 500 | Historical bars for signal history |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node shemar-smc-confidence.cjs BTCUSDT --input hmaLength=CUSTOM_VALUE
```

**Available inputs:** hmaLength (50), atrPeriod (10), factor (3), enableShorts (true), useStopEntry (true), stopEntryOffset (1), htfPeriod (50), sqzLength (20), sqzMult (2), sqzKCLength (20), sqzKCMult (1.5), sqzThreshold (0.8), sqzTF (5), kernelPeriod (30), confidenceThresh (30), showScore (true)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Squeeze momentum detection (SQUEEZE_ON/SQUEEZE_RELEASE/SQUEEZE_OFF), BOS tracking via HMA-Supertrend cross, HTF alignment logic, Confidence score calculation (0-1), Filtered vs raw signal ratio analysis, Kernel regime classification (BULL/BEAR/NEUTRAL), Signal state timeline

## Sources

- TradingView indicator: `PUB;70f6e4e05f9c439c9d1f8fe26019357e`
- Direct code-level analysis of HMA, Supertrend, Kernel alignment logic
