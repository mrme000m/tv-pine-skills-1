---
name: precision-sniper
description: |
  Use the Precision Sniper TradingView indicator to analyze any symbol/timeframe and extract grade-based confluence signals. This skill triggers when the user wants to: get high-probability entry signals, analyze EMA confluence, filter trades by grade quality, or use HTF bias alignment for directional confirmation. Also triggers when the user runs `precision-sniper.cjs` or mentions terms like "Precision Sniper", "grade signals", "EMA confluence", "A+ signal", "sniper entries", or "confluence score".
---

# Precision Sniper — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `precision-sniper.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface grade-based trading setups. The output includes:

- **Grade Signals** — Long/Short with A+, A, B, C letter grades
- **Trend State** — EMA fast/slow/trend alignment, HTF bias, ADX
- **Confluence Score** — 0-10 composite score for signal quality
- **Trade Levels** — ENTRY, SL, TP1-3 with trailing stop logic
- **EMA Configuration** — Fast, Slow, and Trend EMA values

The skill connects raw indicator output to actionable trade logic: grade-filtered entries, HTF bias confirmation, and ATR-based risk management.

## Dependencies

- `precision-sniper.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Auto preset (selects best preset for current timeframe)
node precision-sniper.cjs BTCUSDT

# Scalping preset (fast EMAs, tight stops)
node precision-sniper.cjs ETHUSDT --preset scalping --tf 5m --bars 200

# Swing preset (slow EMAs, wide stops)
node precision-sniper.cjs SOLUSDT --preset swing --tf 1h --bars 1000

# Conservative preset (higher min score, wider stops)
node precision-sniper.cjs BTCUSDT --preset conservative --tf 15m --json --out btc.json

# Agent mode (optimized for AI/agent workflows)
node precision-sniper.cjs BTCUSDT --agent --json
```

## How the Indicator Works

### Core Architecture

The indicator is an **EMA confluence system** with three layers:

1. **Fast EMA** (default 9) — short-term trend direction
2. **Slow EMA** (default 21) — medium-term confirmation
3. **Trend EMA** (default 55) — macro filter

Signals are generated when price action aligns with EMA positioning, RSI momentum, and ADX strength. Each signal receives a **confluence score** (0-10) and a **letter grade**.

### Signal Grades

| Grade | Score Range | Meaning |
|-------|-------------|---------|
| A+ | 9-10 | Exceptional confluence — highest confidence |
| A | 8-8.9 | Strong confluence — high confidence |
| B | 6-7.9 | Moderate confluence — acceptable with confirmation |
| C | < 6 | Weak confluence — avoid or use as counter-trend |

### Visual Elements

| Element | Meaning |
|---------|---------|
| `Long A+` / `Short B` | Grade signal labels at bar |
| ENTRY label | Entry price with direction |
| SL label | Stop loss level |
| TP1/TP2/TP3 labels | Take profit levels |
| EMA lines | Fast (solid), Slow (solid), Trend (dashed) |
| Fill color | EMA ribbon fill between fast and slow |

### Dashboard Fields

| Field | Meaning |
|-------|---------|
| `Trend` | Bullish / Bearish |
| `Score` | Current confluence score (0/10) |
| `Status` | No Trade / Entry / etc. |
| `HTF Bias` | Higher timeframe direction |
| `Volatility` | Normal / High / Low |
| `RSI` | RSI value |
| `ADX` | ADX value with checkmark if > 25 |
| `Preset` | Active preset name |
| `Trades` | Total backtest trades |
| `Win Rate` | Historical win rate |

## Interpreting Output

### Trend State

- `direction: bullish` + `htfBias: bullish` → Strong long bias
- `direction: bearish` + `htfBias: bearish` → Strong short bias
- `direction: bullish` + `htfBias: bearish` → Counter-trend caution

### Grade Signals

Only trade grades **A+ and A** for highest confidence. B grades can work with additional confirmation (HTF aligned, ADX > 25).

- **A+** → Immediate consideration, full size if risk allows
- **A** → Strong setup, full or 3/4 size
- **B** → Moderate, 1/2 size or wait for pullback
- **C** → Avoid — low confluence

### Confluence Score

The score is calculated from:
- EMA alignment (fast > slow > trend for bullish)
- RSI momentum (not overbought/oversold)
- ADX strength (> 25 preferred)
- Price structure (swing confirmation)

### ADX Filter

- ADX > 25 → Trending, signals more reliable
- ADX 20-25 → Transition zone
- ADX < 20 → Ranging, reduce size or avoid

## Trading Methodology

### Step 1: Confirm HTF Bias

Only trade in direction of HTF bias when possible. The HTF bias acts as a macro filter — counter-HTF trades have lower probability.

### Step 2: Wait for Grade Signal

Patience for A+ or A grades. The indicator can produce many B/C signals in choppy conditions — filter aggressively.

### Step 3: Confirm with ADX

Require ADX > 25 for full-size entries. In 20-25 ADX, reduce size by 50%.

### Step 4: Entry at Signal Bar

Enter on the close of the signal candle or on a pullback to the fast EMA.

### Step 5: Risk Management

- **SL**: ATR × multiplier (1.5 default, 2.0 conservative, 1.2 aggressive)
- **TP1**: 1R (breakeven move)
- **TP2**: 2R (primary target)
- **TP3**: 3R (extended target)
- **Trailing**: After TP1 hit, trail to breakeven. After TP2, trail to TP1.

### Structure-Based SL

When enabled, SL is placed below/above recent swing low/high instead of pure ATR distance. More realistic but may be wider.

### When to AVOID Trading

- **C grades** — insufficient confluence
- **Low ADX** (< 20) — no trend, whipsaw risk
- **Counter-HTF** — fighting the macro direction
- **Low score** (< 5) — weak setup

## Workflow

### Step 1: Choose Preset by Horizon

| Trading Style | Preset | Fast | Slow | Trend | SL Mult | Min Score |
|-------------|--------|------|------|-------|---------|-----------|
| Scalping | `scalping` | 5 | 13 | 34 | 1.2 | 5 |
| Intraday | `auto` | 9 | 21 | 55 | 1.5 | 5 |
| Swing | `swing` | 21 | 55 | 200 | 2.5 | 5 |
| Conservative | `conservative` | 9 | 21 | 55 | 2.0 | 7 |
| Aggressive | `aggressive` | 9 | 21 | 55 | 1.2 | 3 |

### Step 2: Run the Indicator

```bash
node precision-sniper.cjs <SYMBOL> --preset <preset> --tf <tf> --bars <bars>
```

### Step 3: Read the Analysis

Focus on:
1. **MARKET STATE** → trend direction, HTF bias, ADX
2. **GRADE SIGNALS** → A+/A/B/C distribution
3. **TRADE PLAN** → entry, SL, TPs
4. **CONFLUENCE** → score, EMA alignment

### Step 4: Construct Trade Story

From the output, answer:
1. **What's the grade?** (A+ = strong, C = avoid)
2. **Is HTF aligned?** (aligned = higher probability)
3. **Is ADX confirming?** (>25 = trending)
4. **What's the risk context?** (SL distance, volatility)

**Example story:**
> "Precision Sniper shows BULLISH trend with BULLISH HTF bias — fully aligned. Latest signal: Long A+ at 77420. Confluence score 9/10. ADX 28.2 ✓. Entry 77420, SL 77100 (ATR×1.5), TP1 77740, TP2 78060. EMAs: Fast 77380, Slow 77200, Trend 76800 — strong upward stack."

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts)
- "Symbol load timeout" → Check symbol exists on TradingView
- No grades → Market may be ranging (ADX < 20) or no confluence
- Empty dashboard → Indicator may not have loaded correctly

## Settings Reference

| Setting | Default | Impact |
|---------|---------|--------|
| EMA Fast | 9 | Short-term trend sensitivity |
| EMA Slow | 21 | Medium-term confirmation |
| EMA Trend | 55 | Macro trend filter |
| Min Score | 5 | Minimum confluence to trigger signal |
| ATR Length | 14 | Volatility measurement period |
| SL Mult | 1.5 | ATR multiplier for stop distance |
| TP1/TP2/TP3 | 1.0/2.0/3.0 | Risk:Reward targets |
| Swing Lookback | 10 | Bars for structure-based SL |

## Sources

- TradingView indicator: Precision Sniper
- Pine ID: `PUB;1fc29950178c42a1a88f52a18161dd53`
- Direct code-level analysis of `graphic.dwglabels`, `dwgtables`, `dwglines` output structure
