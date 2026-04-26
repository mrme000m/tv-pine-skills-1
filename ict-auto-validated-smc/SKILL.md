---
name: ict-auto-validated-smc
description: |
  Use the ICT Auto-Validated SMC TradingView indicator to analyze any symbol/timeframe and extract Smart Money Concepts structural trading signals.
version: 1.0.0
license: MIT
author: TradingView Pine Skills
compatibility: Node.js 18+ with tv-optimized.cjs, tv.cjs, agent-output.cjs and .env (SESSION, SIGNATURE) at project root
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, ict, smc, bos-choch]
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

# ICT Auto-Validated SMC — Trading Opportunity Finder

## When to Use

Helps the user run the standalone `ict-auto-validated-smc.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface SMC-based trading setups. The output includes:

- **Structure State** — current directional bias, last break type (BOS/CHoCH), HTF alignment
- **Structural Zones** — Order Blocks, FVGs, Breakers, BPRs, OTE zones with price levels
- **Validation Metrics** — sweep requirement, displacement requirement, HTF check, min score
- **Grade Signals** — Long/Short signals with star ratings
- **Alignment Check** — whether current TF aligns with HTF structure

The skill connects raw SMC output to actionable trade logic: premium/discount entries, OB+FVG confluence, breaker block reversals, and HTF-aligned directional bias.

## Dependencies

- `scripts/ict-auto-validated-smc.cjs` in the skill directory (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default settings (swing length 10, HTF 4H, strict validation)
node scripts/ict-auto-validated-smc.cjs BTCUSDT

# Higher timeframe analysis
node scripts/ict-auto-validated-smc.cjs ETHUSDT --tf 1h --bars 1000 --json

# Agent mode for AI workflows
node scripts/ict-auto-validated-smc.cjs BTCUSDT --agent --json --out btc-smc.json

# Lower timeframe for scalping
node scripts/ict-auto-validated-smc.cjs SOLUSDT --tf 5m --bars 500
```

## How the Indicator Works

### Core Architecture

The indicator implements **ICT Smart Money Concepts** with auto-validation:

1. **Structure Detection** — Swing highs/lows with BOS (Break of Structure) and CHoCH (Change of Character)
2. **Higher Timeframe Check** — Validates setups against HTF structure direction
3. **Order Blocks** — Bullish/Bearish OBs with sweep and displacement validation
4. **Fair Value Gaps** — 3-candle imbalance zones
5. **Breaker Blocks** — Failed OBs that flip direction
6. **BPRs & OTEs** — Buyside/Sellside liquidity and optimal trade entry zones

### Validation Requirements

The indicator applies strict ICT validation by default:

- **Liquidity Sweep** — Price must sweep a level before OB formation
- **Displacement** — Strong move away (FVG) must follow the sweep
- **HTF Check** — Current TF structure must align with HTF bias
- **Min Score** — Setup must meet minimum quality threshold

### Visual Elements

| Element | Meaning |
|---------|---------|
| `Long A+` / `Short B` | Grade signals with quality |
| `BOS ▲` / `BOS ▼` | Break of Structure |
| `CHoCH ▲` / `CHoCH ▼` | Change of Character |
| Boxes (wide) | Order Blocks |
| Boxes (narrow) | Fair Value Gaps |
| Boxes (medium, solid border) | Active Breaker Blocks |
| Dotted lines | SL/TP levels |
| Solid lines | Entry/structure levels |

### Dashboard Fields

| Field | Meaning |
|-------|---------|
| `Structure:` | BULLISH / BEARISH |
| `Last Break:` | BOS ▲ / BOS ▼ / CHoCH ▲ / CHoCH ▼ |
| `HTF (240):` | Higher timeframe structure |
| `HTF Break:` | HTF break type |
| `Alignment:` | ✓ ALIGNED / ✗ COUNTER-TREND |
| `Active OBs:` | Number of active order blocks |
| `Breakers:` | Number of breaker blocks |
| `OTE Zones:` | Number of optimal trade entry zones |
| `Active FVGs:` | Number of active fair value gaps |
| `Zone:` | PREMIUM / DISCOUNT / EQUILIBRIUM |
| `Best OB:` | Star rating of best order block |
| `Signal:` | Current signal with score |
| `Min Score:` | Current/max score requirement |

## Interpreting Output

### Structure Direction

- **Bullish structure** → Look for longs in discount zones
- **Bearish structure** → Look for shorts in premium zones
- **CHoCH** → Potential reversal — highest conviction when HTF confirms

### HTF Alignment

This is the **most important filter**:

- `aligned` → Trade with structure direction
- `counterTrend` → Reduce size by 50% or avoid
- HTF bullish + current TF bullish → Strong long setup
- HTF bearish + current TF bullish → Counter-trend, caution

### Zones

| Zone | Long Bias | Short Bias |
|------|-----------|------------|
| PREMIUM | Avoid / look for shorts | Ideal for shorts |
| DISCOUNT | Ideal for longs | Avoid / look for longs |
| EQUILIBRIUM | Neutral — wait for displacement | Neutral — wait for displacement |

### Order Blocks

Active OBs are the primary entry zones:

- **Bullish OB** in discount zone + aligned HTF → High-confluence long
- **Bearish OB** in premium zone + aligned HTF → High-confluence short
- OBs with ★★★★★ rating → Best quality
- Mitigated OBs (if shown) → Weaker, may act as breaker

### Fair Value Gaps

FVGs act as magnets and confluence:

- Price inside FVG → Look for rejection at FVG edges
- FVG above price in bullish structure → Target/magnet
- FVG below price in bearish structure → Target/magnet

### Breaker Blocks

Failed OBs that flip direction are **one of ICT's strongest levels**:

- Breaker in direction of structure → High conviction
- Breaker + FVG confluence → Exceptional setup

## Trading Methodology

### Step 1: Determine HTF Bias

Always start with HTF structure. The HTF direction is your macro filter.

### Step 2: Identify Current TF Structure

Look for BOS/CHoCH on current TF. CHoCHs are early reversal signals; BOS confirms continuation.

### Step 3: Find Premium/Discount Zones

- **Longs**: Wait for price to enter discount zone
- **Shorts**: Wait for price to enter premium zone

### Step 4: Locate Validated Order Blocks

Best OBs have:
1. Liquidity sweep confirmed
2. Displacement (FVG) after sweep
3. HTF alignment
4. High star rating (★★★★☆ or better)

### Step 5: Confirm with FVG or Breaker

Add confluence by finding:
- FVG inside or near the OB zone
- Breaker block supporting the same direction
- Multiple OBs stacked in direction

### Entry Trigger

- Limit order at OB zone (aggressive)
- Market order on displacement through OB edge (confirmation)
- Stop entry above/below OB for breakout continuation

### Stop Loss Placement

- Below bullish OB low (for longs)
- Above bearish OB high (for shorts)
- Alternative: below/above the sweep low/high

### Take Profit Targets

1. **Nearest opposing zone** (FVG, OB, or liquidity pool)
2. **Next structural level** (previous BOS/CHoCH point)
3. **Measured move** (1:2 to 1:3 risk:reward)

### When to AVOID Trading

- **Counter-trend alignment** — fighting HTF bias
- **No active OBs** — weak structural support
- **Premium zone + bullish structure** — poor location for longs
- **No sweep/displacement** — unvalidated zones
- **Low score** (< min score requirement)

## Procedure

### Step 1: Run the Indicator

```bash
node scripts/ict-auto-validated-smc.cjs <SYMBOL> --tf <tf> --bars <bars>
```

Recommended: 1h for swing, 15m for intraday, 5m for scalping.

### Step 2: Read Structure First

1. **Structure direction** — bullish or bearish
2. **HTF direction** — aligned or counter
3. **Zone** — premium, discount, or equilibrium

### Step 3: Find Zones

1. Count active OBs, FVGs, breakers
2. Identify the best-rated OB
3. Note breaker blocks for reversal potential

### Step 4: Construct Trade Story

From the output, answer:
1. **What's the structure?** (direction, last break)
2. **Is HTF aligned?** (aligned = trade with structure)
3. **Where are the zones?** (OBs, FVGs, breakers)
4. **What's the best OB?** (rating, location, zone)
5. **What's the risk context?** (counter-trend warning, score)

**Example story (bullish):**
> "Structure is BULLISH with last break BOS ▲. HTF (240) is BULLISH — fully aligned. Price is in DISCOUNT zone. Active: 3 OBs, 2 FVGs, 1 breaker. Best OB: ★★★★☆ bullish at 76800-77000 (discount). Signal: Long 4/10 (29 bars ago). SL below OB low at 76750. Target nearest FVG at 77500."


## Pitfalls
- No structure data → Indicator may need more bars or HTF alignment
- Grade signals without validation → strict mode may filter valid setups; relax `--input` if needed
- **Missing SESSION/SIGNATURE**: The most common failure. Ensure `.env` contains valid TradingView session credentials.
- **"Maximum number of studies"**: TradingView rate-limits concurrent studies. Built-in retry (3 attempts) handles this; wait 30s if persistent.
- **Symbol not found**: Verify the symbol exists on TradingView (e.g., `BTCUSDT` not `BTC`).
- **Low bar count**: Some indicators need more bars than default (500). Increase with `--bars <N>`.
- **Network timeouts**: Check internet connectivity and TradingView status.

## Verification

To confirm this skill executed correctly:

1. Run `node scripts/ict-auto-validated-smc.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data


## Settings Reference

| Setting | Default | Impact |
|---------|---------|--------|
| Swing Length | 10 | Bars to confirm swing highs/lows |
| Internal Structure Length | 5 | For internal BOS/CHoCH detection |
| HTF Timeframe | 240 | Higher timeframe for validation (4H) |
| HTF Swing Length | 10 | HTF swing confirmation |
| Max Visible OBs | 5 | Number of OBs drawn |
| Require Sweep | true | Only show OBs with liquidity sweep |
| Require Displacement | true | Only show OBs with FVG displacement |
| Max Visible FVGs | 5 | Number of FVGs drawn |
| Max Visible Breakers | 5 | Number of breaker blocks drawn |

## Sources

- TradingView indicator: ICT Auto-Validated SMC
- Pine ID: `PUB;789a5c79bfe9443585da09e85ece73de`
- Direct code-level analysis of `graphic.dwgboxes`, `dwglabels`, `dwgtables`, `dwglines` output structure
