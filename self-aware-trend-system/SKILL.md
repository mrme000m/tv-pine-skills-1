---
name: self-aware-trend-system
description: |
  Use the Self-Aware Trend System [WillyAlgoTrader] TradingView indicator to analyze any symbol/timeframe and extract adaptive trend-following signals.
version: 1.0.0
license: MIT
author: TradingView Pine Skills
compatibility: Node.js 18+ with tv-optimized.cjs, tv.cjs, agent-output.cjs and .env (SESSION, SIGNATURE) at project root
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, supertrend, tqi, regime]
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

# Self-Aware Trend System [WillyAlgoTrader] — Trading Opportunity Finder

## When to Use

Helps the user run the standalone `self-aware-trend-system.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trend-following setups. The output includes:

- **Trend State** — current direction (bullish/bearish/neutral), TQI quality, regime classification
- **TQI Breakdown** — Efficiency, Volatility, Structure, Momentum Persistence components
- **Trade Signals** — BUY/SELL signals with scores (0-30), tooltip metadata (TQI, ER, RSI, Vol Z)
- **Trade Plan** — ENTRY, SL, TP1-3 with live R-multiples
- **Performance Stats** — Win Rate, Avg R, Drawdown, Streaks, Regime Edge

The skill connects raw indicator output to actionable trade logic: trend-aligned entries (with TQI quality filter), dynamic TP scaling, and regime-aware position sizing.

## Dependencies

- `scripts/self-aware-trend-system.cjs` in the skill directory (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default preset (Default: ATR 13, Base Mult 2.0, TQI enabled)
node scripts/self-aware-trend-system.cjs BTCUSDT

# Scalping preset (tighter bands, higher quality influence)
node scripts/self-aware-trend-system.cjs ETHUSDT --preset scalping --tf 5m --bars 200

# Swing preset (wider bands, longer lookback)
node scripts/self-aware-trend-system.cjs SOLUSDT --preset swing --tf 1h --bars 1000

# Custom + JSON for downstream processing
node scripts/self-aware-trend-system.cjs BTCUSDT --preset crypto --tf 15m --json --out btc.json

# Agent mode (optimized for AI/agent workflows)
node scripts/self-aware-trend-system.cjs BTCUSDT --agent --json
```

## How the Indicator Works

### Core Architecture

The indicator is an **adaptive SuperTrend system** with four key innovations:

1. **Trend Quality Index (TQI)** — composite 0..1 score from Efficiency, Volatility, Structure, and Momentum Persistence
2. **Asymmetric Bands** — active side (in trend direction) tightens, passive side widens
3. **Character-Flip Detection** — allows SuperTrend to flip on quality collapse, not just price break
4. **Efficiency-Weighted ATR** — clean trending volatility counts full; noisy volatility is halved

### Visual Elements

| Element | Meaning |
|---------|---------|
| `▲ BUY 26` / `▼ SELL 24` | Trade signal labels with score (0-30) |
| Solid gray line | Entry price |
| Solid red line | Stop Loss |
| Dashed green lines | TP1, TP2, TP3 |
| Dashboard table | TQI, Regime, Performance, Live R |

### Dashboard Fields

| Field | Meaning |
|-------|---------|
| `Trend` | Bullish ▲ / Bearish ▼ |
| `TQI` | Trend Quality Index (0..1) |
| `Regime` | e.g., "Trending / High Vol", "Choppy / Norm Vol" |
| `ER` | Efficiency Ratio (0..1) |
| `RSI` | RSI value |
| `Vol Z` | Volatility Z-score |
| `Signal` | Current signal (— if none) |
| `Win Rate` | Historical win rate in current regime |
| `Avg R` | Average R-multiple per trade |
| `Live R` | Current trade R-multiples (TP1/TP2/TP3) |

## Interpreting Output

### Trend State (Primary Signal)

The **direction** and **quality** are the most important fields:

- `direction: bullish` + `quality: high` (TQI ≥ 0.6) → Strong long bias
- `direction: bearish` + `quality: high` → Strong short bias
- `quality: low` (TQI < 0.35) → Avoid new positions, expect chop/flip

### TQI Breakdown

Each component is 0..1. The average is the headline TQI:

- **Efficiency** — directional consistency (higher = cleaner trend)
- **Volatility** — relative volatility state
- **Structure** — market structure alignment
- **Momentum Persist** — momentum continuation strength

### Trade Signals

Signals appear as `▲ BUY 26` or `▼ SELL 24`. The score (0-30) is a composite:

- Score ≥ 20 → High-quality signal
- Score 15-19 → Moderate quality
- Score < 15 → Low quality, filter out

Tooltip breakdown: TQI, ER, RSI, Vol Z, TP Mode, R-multiples.

### Trade Plan

If an active trade is present:
- **Entry** — solid gray line / ENTRY label
- **SL** — solid red line / SL label (placed at band edge or structure)
- **TP1-3** — dashed green lines with dynamic or fixed scaling

### Performance Context

- **Win Rate** in current regime → base rate expectation
- **Regime Edge** → expected R in current regime (sample size in parentheses)
- **Streaks** → current win/loss streak vs max streaks

## Trading Methodology

### Step 1: Assess Trend Quality

Only trade when `quality` is "moderate" or "high". Low quality means the market is choppy and the adaptive bands are wide — this is a "stay out" filter.

### Step 2: Trade in Trend Direction

- Bullish trend + BUY signal → Long
- Bearish trend + SELL signal → Short
- Counter-trend signals are lower priority

### Step 3: Confirm with TQI Components

- High **Efficiency** (>0.5) → trend is clean, follow-through likely
- High **Momentum Persist** (>0.5) → momentum is continuing
- Low **Volatility** component → compression, potential expansion

### Step 4: Use Dynamic TP Scaling

The indicator supports Fixed and Dynamic TP modes:
- **Fixed** — predetermined R-multiples (1R, 2R, 3R)
- **Dynamic** — scaled by trend quality (better quality = wider targets)

### Step 5: Manage Risk by Regime

| Regime | Position Size | Stop Width |
|--------|--------------|------------|
| Trending / Low Vol | Full size | Normal |
| Trending / High Vol | Reduced | Wider |
| Choppy / Any Vol | Minimal or flat | — |
| Mixed / Norm Vol | Half size | Normal |

### When to AVOID Trading

- **Low TQI** (< 0.35) — adaptive bands are too wide, whipsaw risk
- **Character flip imminent** — Q.Strength drifting suggests regime change
- **Regime Edge negative** — historical performance poor in current regime
- **Fresh trend** (< 5 bars) — char-flip min age not met

## Procedure

### Step 1: Choose Preset by Horizon

| Trading Style | Preset | ATR | Base Mult | Quality Strength | Typical TF |
|-------------|--------|-----|-----------|------------------|-----------|
| Scalping | `scalping` | 10 | 1.5 | 0.5 | 1m–5m |
| Intraday | `default` | 13 | 2.0 | 0.4 | 5m–15m |
| Swing | `swing` | 21 | 2.5 | 0.3 | 1h–4h |
| Crypto 24/7 | `crypto` | 13 | 2.0 | 0.4 | Any |

### Step 2: Run the Indicator

```bash
node scripts/self-aware-trend-system.cjs <SYMBOL> --preset <preset> --tf <tf> --bars <bars>
```

### Step 3: Read the Analysis

Focus on:
1. **MARKET STATE** → direction, quality, regime
2. **TQI BREAKDOWN** → component strengths
3. **SIGNALS** → latest trade signal score
4. **TRADE PLAN** → entry, SL, TPs
5. **PERFORMANCE** → win rate, regime edge

### Step 4: Construct Trade Story

From the output, answer:
1. **What's the trend?** (direction + quality)
2. **Is the regime favorable?** (win rate, edge)
3. **Where's the confluence?** (TQI components aligned)
4. **What's the nearest actionable zone?** (active trade plan or wait)
5. **What's the risk context?** (drawdown, streaks, volatility)

**Example story (bullish):**
> "Market is BULLISH with HIGH quality (TQI 0.72). Regime: Trending / Norm Vol. TQI components: Efficiency 0.65, Volatility 0.80, Structure 0.70, Mom Persist 0.75. Latest signal: BUY 24/30. Active trade plan at entry 77400 with SL 76800 (1.0R), TP1 78000, TP2 78600. Win rate in this regime: 42%. Regime edge: +0.15R (n=23)."


## Pitfalls
- No signals in lookback → TQI filter may be too strict; check `--input tqiThreshold`
- Regime mismatch → "Choppy / High Vol" regimes produce more false signals; reduce size
- **Missing SESSION/SIGNATURE**: The most common failure. Ensure `.env` contains valid TradingView session credentials.
- **"Maximum number of studies"**: TradingView rate-limits concurrent studies. Built-in retry (3 attempts) handles this; wait 30s if persistent.
- **Symbol not found**: Verify the symbol exists on TradingView (e.g., `BTCUSDT` not `BTC`).
- **Low bar count**: Some indicators need more bars than default (500). Increase with `--bars <N>`.
- **Network timeouts**: Check internet connectivity and TradingView status.

## Verification

To confirm this skill executed correctly:

1. Run `node scripts/self-aware-trend-system.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data


## Settings Reference

| Setting | Default | Impact |
|---------|---------|--------|
| ATR Length | 13 | Period for volatility measurement |
| Base Band Width | 2.0 | Multiplier for ATR bands |
| Quality Strength | 0.4 | How much TQI compresses/expands bands |
| Quality Curve | 1.5 | Non-linearity of TQI → band width |
| Char-Flip Min Age | 5 | Bars before quality collapse can flip trend |
| Char-Flip High TQI | 0.55 | Upper threshold for flip detection |
| Char-Flip Low TQI | 0.25 | Lower threshold for flip detection |

## Sources

- TradingView indicator: Self-Aware Trend System [WillyAlgoTrader]
- Pine ID: `PUB;0f80bcf05d544d4c98fde06faab1c976`
- Direct code-level analysis of `graphic.dwglabels`, `dwgtables`, `dwglines` output structure
