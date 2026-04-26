---
name: quantum-ribbon
description: |
  Use the Quantum Ribbon Lite TradingView indicator to analyze multi-layer EMA alignment, detect ribbon crossovers, and identify trend strength through 5-layer ribbon momentum analysis.
version: 1.0.0
license: MIT
author: TradingView Pine Skills
compatibility: Node.js 18+ with tv-optimized.cjs, tv.cjs, agent-output.cjs and .env (SESSION, SIGNATURE) at project root
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, ema-ribbon, trend-strength]
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

# Quantum Ribbon Lite — Trading Opportunity Finder

## When to Use

Helps the user run the standalone `quantum-ribbon.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on multi-layer EMA ribbon analysis. The output includes:

- **Ribbon State** — strong_bull / strong_bear / bull / bear / neutral classification
- **Layer Analysis** — per-layer fast vs slow EMA comparison (5 layers)
- **Crossover Detection** — layer 5 (slowest) cross signals
- **Momentum Slopes** — fast and slow EMA momentum rates
- **Buy/Sell/Stop/Target Signals** — indicator-generated signals

The skill connects raw indicator output to actionable trade logic: entry timing (on crossovers), trend strength (from layer alignment), and risk management (from stop/target signals).

## Dependencies

- `scripts/quantum-ribbon.cjs` in the skill directory (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node scripts/quantum-ribbon.cjs BTCUSDT

# Specific timeframe
node scripts/quantum-ribbon.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node scripts/quantum-ribbon.cjs BTCUSDT --json --out ribbon.json

# Agent mode
node scripts/quantum-ribbon.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator uses **5 layers of EMA pairs** (fast vs slow):
- **Plot/Plot_2** → Layer 1 (fastest)
- **Plot_3/Plot_4** → Layer 2
- **Plot_5/Plot_6** → Layer 3
- **Plot_7/Plot_8** → Layer 4
- **Plot_9/Plot_10** → Layer 5 (slowest, most significant)

Each layer has a fill colorer indicating direction:
- Fast > Slow → bullish layer
- Fast < Slow → bearish layer

### Signal Detection

**Ribbon State:**
- All 5 layers bullish → `strong_bull`
- All 5 layers bearish → `strong_bear`
- More bullish than bearish → `bull`
- More bearish than bullish → `bear`
- Equal → `neutral`

**Crossover Signals:**
- Layer 5 (Plot_9 vs Plot_10) cross → primary trend change signal
- BuySignal/SellSignal → indicator-generated entry signals
- StopHit/TargetHit → risk management signals

## Interpreting Output

### Ribbon State (Key Signal)

The ribbon state is the primary directional and strength indicator.

**Trading logic:**
- **strong_bull** → strongest long bias, all EMAs aligned up
- **strong_bear** → strongest short bias, all EMAs aligned down
- **bull** → moderate long bias, most EMAs up
- **bear** → moderate short bias, most EMAs down
- **neutral** → no clear bias, avoid or range trade

### Layer 5 Crossover

The slowest layer crossover is the highest-confluence signal.

**Trading logic:**
- **Bullish cross (Plot_9 crosses above Plot_10)** → major trend shift to bullish
- **Bearish cross (Plot_9 crosses below Plot_10)** → major trend shift to bearish
- **Cross within last 3 bars** → early entry opportunity
- **No recent cross** → trend continuation mode

### Momentum Slopes

EMA slopes show acceleration/deceleration.

**Trading logic:**
- **Fast slope rising** → accelerating momentum
- **Fast slope falling** → decelerating momentum
- **Fast slope > slow slope** → momentum increasing
- **Both slopes negative in bull state** → potential reversal warning

### Spread Analysis

The distance between Plot_9 and Plot_10 shows trend strength.

**Trading logic:**
- **Widening spread** → strengthening trend
- **Narrowing spread** → weakening trend, potential reversal
- **Very narrow spread + neutral state** → compression, big move coming

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Check ribbon state**
- strong_bull/strong_bear = highest confidence
- bull/bear = moderate confidence
- neutral = no trade

**Step 2: Check for Layer 5 cross**
- Recent cross = potential entry timing
- No cross = continuation mode

**Step 3: Confirm with momentum**
- Slopes should support the ribbon state
- Divergence = caution

**Step 4: Check signals**
- BuySignal/SellSignal = additional confirmation
- StopHit = avoid, recent stop triggered

**Step 5: Entry trigger**
- **Long**: strong_bull or bull + recent bullish cross + rising fast slope + BuySignal
- **Short**: strong_bear or bear + recent bearish cross + falling fast slope + SellSignal

### Stop Loss and Targets

- **Stop Loss**: Beyond Layer 5 EMA or at recent swing
- **Take Profit 1**: Next resistance/support level
- **Take Profit 2**: When ribbon state weakens (loses layers)
- **Take Profit 3**: Opposite crossover

### When to AVOID Trading

- **neutral state** → no directional edge
- **StopHit recently** → indicator stopped out, reassess
- **Mixed layers with no cross** → indecision
- **Narrowing spread** → trend weakening

## Procedure

### Step 1: Run the Indicator

```bash
node scripts/quantum-ribbon.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

1. **RIBBON** → state, bullish/bearish layer counts
2. **CURRENT** → spread, signals, momentum
3. **CROSSOVERS** → recent Layer 5 crosses

### Step 3: Construct Trade Story

**Example story (bullish):**
> "Quantum Ribbon: strong_bull (5/5 layers bullish). Spread: 145 USDT (0.21%). Fast slope rising (+0.004). Last bullish cross 2 bars ago. BuySignal active. No StopHit. Strong long bias — entry on pullback to EMA cluster, SL below Plot_10, targeting next resistance."


## Pitfalls
- Neutral ribbon state → no directional edge, wait for layer alignment
- Layer 5 whipsaw → slowest layer crossover can be late; confirm with faster layers
- **Missing SESSION/SIGNATURE**: The most common failure. Ensure `.env` contains valid TradingView session credentials.
- **"Maximum number of studies"**: TradingView rate-limits concurrent studies. Built-in retry (3 attempts) handles this; wait 30s if persistent.
- **Symbol not found**: Verify the symbol exists on TradingView (e.g., `BTCUSDT` not `BTC`).
- **Low bar count**: Some indicators need more bars than default (500). Increase with `--bars <N>`.
- **Network timeouts**: Check internet connectivity and TradingView status.

## Verification

To confirm this skill executed correctly:

1. Run `node scripts/quantum-ribbon.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data


## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for EMA calculation |
| bars | 500 | Historical bars for ribbon and crossover analysis |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node scripts/quantum-ribbon.cjs BTCUSDT --input i_sensitivity=CUSTOM_VALUE
```

**Available inputs:** i_sensitivity (5), i_stop_distance (Normal), i_target_rr (2R), i_show_table (true), i_table_size (Small), i_show_ribbon_state (true), i_show_lines (true), i_entry_line_color (color.white), i_entry_line_opacity (100), i_entry_line_width (2), i_stop_line_color (color.red), i_stop_line_opacity (100), i_stop_line_width (2), i_tp_line_color (color.green), i_tp_line_opacity (100), i_tp_line_width (2), i_table_bg_color (color.white), i_table_bg_opacity (100), i_table_text_color (color.black), i_table_border_color (color.gray), i_table_border_width (1)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Graphic table parsing for stats table (entry/stop/target/P&L/win rate), Regime detection (trending/ranging), Market health score (0-100), Signal confidence scoring, Risk management with ATR-based stop/target, Trade tracking with P&L, Ribbon state classification (strong_bull/strong_bear/bull/bear/neutral)

## Sources

- TradingView indicator: `PUB;91e003af510345f299e5846773538206`
- Direct code-level analysis of 5-layer ribbon, fill colorers, and crossover detection
