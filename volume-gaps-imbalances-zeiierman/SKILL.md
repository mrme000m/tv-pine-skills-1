---
name: volume-gaps-imbalances-zeiierman
description: |
  Use the Volume Gaps & Imbalances (Zeiierman) TradingView indicator to analyze any symbol/timeframe and extract structural trading signals.
version: 1.0.0
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, volume-gaps, imbalances]
    category: trading
---

# Volume Gaps & Imbalances (Zeiierman) — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `volume-gaps-imbalances-zeiierman.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups. The output includes:

- **Zero-Volume Gaps** — structural voids where no liquidity changed hands (deeper than candle-based FVGs)
- **Bull/Bear Volume Profile** — per-price-row dominance reading
- **Delta Panel** — sector-based buy/sell pressure percentage

The skill connects raw indicator output to actionable trade logic: entry zones (at/near gaps), directional bias (from delta), and structural context (from profile). It also helps tune the indicator's inputs (lookback, rows, summary sections) for different trading horizons.

## Dependencies

- `volume-gaps-imbalances-zeiierman.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)
- Optional: preset configs in `volume-gaps-imbalances-zeiierman/*.json`

## Quick Start

```bash
# Default preset (200 lookback, 50 rows, 20 delta sections)
node volume-gaps-imbalances-zeiierman.cjs BTCUSDT

# Scalping preset (100 lookback, 30 rows, 10 sections)
node volume-gaps-imbalances-zeiierman.cjs ETHUSDT --preset scalping --tf 5m --bars 200

# Swing preset (1000 lookback, 150 rows, 25 sections)
node volume-gaps-imbalances-zeiierman.cjs SOLUSDT --preset swing --tf 1h --bars 1000

# Custom + JSON for downstream processing
node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --lookback 500 --rows 100 --json --out btc.json

# Agent mode (optimized for AI/agent workflows)
node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --agent --json
```

## How the Indicator Works

### Core Architecture

The indicator builds a **price-by-price volume profile** over a `Lookback` window, dividing the high-low range into `Rows` price bins. Each bar's volume is classified:

- **Bullish volume** when `close > open`
- **Bearish volume** when `close <= open`

This produces three values per price level: Bull Volume, Bear Volume, and Total Volume.

### Visual Elements (from `graphic.dwgboxes`)

| Graphic | Detected By | Meaning |
|---------|-------------|---------|
| `bc:7` (border-only, no fill) | Zero-volume gap/vacuum | Price region with ZERO traded volume — deepest structural inefficiency |
| `bc:5` (orange border) | Bear volume | Sellers dominated this price row |
| `bc:6` (green border) | Bull volume | Buyers dominated this price row |
| `bc:14` + `c:1291845649` | Delta panel background | Aggregated pressure container |
| `bc:13` + "Δ -X.X%" | Delta sell section | Negative delta = sell pressure in this price sector |
| `bc:12` + "Δ +X.X%" | Delta buy section | Positive delta = buy pressure in this price sector |

The Delta formula: `Δ = (Bull Volume − Bear Volume) / Total Volume × 100%`

## Interpreting Output

### Zero-Volume Gaps (Key Signal)

Gaps are the highest-value signal. They represent regions where price moved so fast that no trades occurred. These areas tend to attract revisits because liquidity never exchanged hands there.

**Trading logic:**
- Price retracing **into** a gap → potential reversal/resistance
- Price trading **through** a gap cleanly → confirms strong displacement, continuation likely
- **Largest gap** is the most significant — note its `priceTop` and `priceBottom`
- Gaps above current price act as resistance when tested from below
- Gaps below current price act as support when tested from above

### Bull/Bear Profile Rows

The profile rows show where buyer vs seller control exists at each price level.

**Trading logic:**
- Broad **bullish** segments above a support gap → buyer absorption zone (good long entry confluence)
- Broad **bearish** segments below a resistance gap → seller distribution zone (good short entry confluence)
- Compare top vs bottom: if top rows are bearish-heavy, sellers control the high; if bottom rows are bullish-heavy, buyers defend the low

### Delta Panel

The delta panel is the overall direction check. It aggregates buy/sell pressure into vertical sectors.

**Trading logic:**
- `avgDelta > +10%` → bullish flow dominates (prioritize longs)
- `avgDelta < -10%` → bearish flow dominates (prioritize shorts)
- Near zero (±10%) → balanced chop (wait for directional break)
- `strongestBuy` with high delta (+80%+): aggressive institutional buying detected
- `strongestSell` with high delta (-80%-): aggressive institutional selling detected

## Trading Methodology (from Video + Indicator Docs)

### Complete Step-by-Step Setup

**Step 1: Identify the macro trend bias**
- Look at higher timeframe trend direction
- The indicator's bias field (bullish/bearish/neutral) gives the profile direction on the chosen TF
- Only take trades aligned with the dominant trend

**Step 2: Locate structural inefficiency**
- Scan for **zero-volume gaps** (bc:7, purple void) — these are the deepest structural opportunities
- The **largest gap** is the most significant zone
- Gaps are created by impulsive, high-speed moves where no volume was traded

**Step 3: Wait for retracement**
- Price must **retrace back into** the gap zone
- A pullback into a gap below price → potential long setup
- A pullback into a gap above price → potential short setup

**Step 4: Confirm with profile and delta**
- **Long**: Price pulls into a lower gap + **bullish rows wider than bearish** in that zone (bc:6 > bc:5) + **delta turns positive/green** at that price level
- **Short**: Price pulls into an upper gap + **bearish rows wider than bullish** (bc:5 > bc:6) + **delta turns negative/red** at that price level

**Step 5: Entry trigger**
- Look for a **clear rejection candlestick** (engulfing, pin bar) forming within the gap zone
- Delta should **shift color** in your favor during the retracement
- Profile should show **absorption** at the gap level (opposite side's bars widening)

### Stop Loss and Targets

- **Stop Loss**: Place just **below/above the edge of the inefficiency gap**. The gap boundary is your structural invalidation point.
- **Take Profit 1** (Conservative): 1:2 risk-to-reward ratio
- **Take Profit 2** (Structural): Target the **next volume gap** in the direction of the trade — price is mathematically likely to trade into these untraded voids to "rebalance"
- **Take Profit 3** (Extension): Use the largest gap's full height as measured move

### When to AVOID Trading

- **No structure**: No purple gaps detected (market is in consolidation, every price level has traded)
- **Neutral delta**: All delta sectors show near-zero percentages (balanced market, no pressure)
- **Counter-trend**: Taking buys when bias is bearish with overwhelming bearish profile rows
- **Weak gap re-test**: Price slices through the gap without rejection (not support/resistance, just continuation)
- **Low-volatility**: Gaps are very small (under 10 USDT on BTC), suggesting choppy environment

## Workflow

### Step 1: Choose Preset by Horizon

| Trading Style | Preset | Lookback | Rows | Delta Sections | Typical TF | Typical Bars |
|-------------|--------|----------|------|----------------|-----------|-------------|
| Scalping | `scalping` | 100 | 30 | 10 | 1m–5m | 200 |
| Intraday | `default` | 200 | 50 | 20 | 5m–15m | 500 |
| Swing | `swing` | 1000 | 150 | 25 | 1h–4h | 1000 |
| Optimized (video) | `default` | 100 | 20 | 10-15 | 5m–15m | 300-500 |
| Optimized (from video) | **100** | **20** | **10-15** | 5m–15m | 300-500 |

### Step 2: Run the Indicator

```bash
node volume-gaps-imbalances-zeiierman.cjs <SYMBOL> --preset <preset> --tf <tf> --bars <bars>
```

### Step 3: Read the Analysis Table

The CLI produces a formatted output. The sections to focus on:

1. **SUMMARY** → bias and dominant flow
2. **ZERO-VOLUME GAPS** → structural voids (entry/exit targets)
3. **VOLUME PROFILE** → control zones
4. **DELTA PANEL** → directional pressure

### Step 4: Construct Trade Story

From the output, answer:

1. **What structures exist?** (gap count, largest gap location)
2. **What's the bias?** (summary.bias + dominantFlow)
3. **Where are the confluences?** (gap + delta direction + profile alignment)
4. **What's the nearest actionable zone?** (closest gap to current price, or largest gap in direction of bias)
5. **What's the risk context?** (if bias is bearish but delta shows strong buy flow, caution)

**Example story (bearish):**
> "Price is BEARISH with NEUTRAL delta. There are 8 structural gaps, largest 287 USDT near 76771-77058. The profile shows 77 bear rows vs 7 bull rows — sellers dominate overwhelmingly. Delta sections show mixed but with -45% at the top of profile (selling into resistance). The nearest gap above price is a refill target. Short bias with `SL` above the nearest gap, targeting the next lower gap."

**Pro Tip from Video:** The video emphasizes waiting for delta percentages to **shift in your favor before the candle rejection forms**. This "soft confirmation" helps avoid false setups where price briefly enters a gap but doesn't get rejected properly.

## Step-by-Step Trading Methodology (From Video - "Zeiierman" Channel)

### Buy Trade Setup (The "Rejection" Method)

**Step 1: Identify true volume gap below current price**
- Look for purple true volume gaps (border-only, no fill) formed below price
- The gap represents a "true void" where no volume was traded during impulsive moves

**Step 2: Wait for retracement into gap**
- Price must pull back **into** the purple inefficiency zone
- Only trades where price re-enters a previously formed gap are valid

**Step 3: Monitor delta panel for green shift**
- Watch delta percentages **change to green** as price pulls back
- This confirms buyer pressure is building/returning at that level

**Step 4: The trigger (rejection candle)**
- Wait for a **clear rejection from the zone** — specifically a **bullish engulfing candlestick**
- The engulfing pattern confirms the buy attempt is being met with resistance

**Step 5: Final confirmation (profile + delta)**
- Verify volume profile shows **more blue bars (bullish) than orange bars (bearish)** at that level
- Delta should remain green/shifting positive

**Entry:** Enter at the close of the bullish engulfing candle

### Sell Trade Setup (Video's Two Methods)

**Method A: Rejection Setup**
- Wait for price to retrace **upward** into a purple gap
- Observe a **bearish engulfing candle**
- Confirm delta is **red/negative** and profile shows **dominant orange bars**

**Method B: Breakout Setup**
- Instead of waiting for rejection, wait for a strong bearish candle to **break and close below** a purple volume gap zone
- Must be confirmed by **red delta** and seller interest (orange profile bars)

### Risk Management (From Video)

**Stop Loss (SL):** Place at the **edge of or just outside the inefficiency gap** (the purple zone). This is the structural invalidation point.

**Take Profit (TP) - Two Options:**
1. **1:2 Risk-to-Reward Ratio** (conservative approach)
2. **Target next inefficiency gap** (structurally optimal approach) — price is mathematically likely to gravitate toward these untraded voids to "rebalance"

### Step 5: Tune Inputs if Needed

If the output doesn't show clear structure:
- Increase `lookback` for more historical context (larger structural picture)
- Increase `rows` for finer granularity (more price levels)
- Decrease `summarySections` for broader delta sectors (less noise)
- Decrease `rows` for smoother output if too noisy

**Settings for different horizons (from combined sources):**

| Setting | Scalping (1m-5m) | Intraday (5m-15m) | Swing (1h-4h) |
|---------|------------------|-------------------|---------------|
| Lookback | 100 | 200 | 500-1000 |
| Rows | 30 | 50 | 100-150 |
| Summary Sections | 10-15 | 20 | 20-25 |
| Purpose | Recent structure, fast reactivity | Balanced view, clear picture | Macro structure, large zones |

Shorter lookback = more responsive to recent price action, better for scalping. Longer lookback = captures large institutional zones, better for swing.


## Verification

To confirm this skill executed correctly:

1. Run `node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts, 3s/6s/9s delay). If still failing, wait 30s and retry.
- "Symbol load timeout" → Check that symbol exists on TradingView with correct exchange prefix (e.g., `BINANCE:BTCUSDT`)
- No gaps detected → Increase lookback or check that the symbol actually has volume gaps at that TF

## Settings Reference

| Setting | Default | Impact |
|---------|---------|--------|
| Lookback | 200 | Bars scanned for the profile. More = smoother but less responsive. |
| Rows | 50 | Price bins between high-low. More = finer detail but noisier. |
| Source | hlc3 | Price point used to assign volume into rows. |
| Summary Sections | 20 | Number of vertical delta blocks. Fewer = broader directional reads. |
| Summary Width | 40 | Pixel width of delta panel (cosmetic). |
| Show Delta Text | true | Show Δ% labels inside bars. |
| Delta Min Size | 0.2 | Minimum visual size for non-zero delta bars. |

### Optimized Settings (Recommended by Video)

Based on Zeiierman's "How Banks Trade via Volume Gap Strategy" video:

| Setting | Optimized Value | Why |
|---------|-----------------|-----|
| Lookback | **100** | balances recent action with structural context; cleaner picture |
| Rows | **20** | less noise, clearer visual profile representation |
| Profile Placement | **50** | moves volume profile closer to price candles for easier monitoring |
| Delta Min Size | — | already at 0.2 (minimum visual threshold) |

## Sources

This skill is informed by:
- TradingView indicator documentation (scraped from `tradingview.com/script/Q7YQQq7g-Volume-Gaps-Imbalances-Zeiierman/`)
- Zeiierman's oriented description of the indicator
- **Zeiierman's YouTube video** ("How Banks Trade via Volume Gap Strategy" - https://www.youtube.com/watch?v=cmJY6o4ymp4) — recommended optimized settings: `lookback=100, rows=20, profilePlacement=50`
- Direct code-level analysis of `graphic.dwgboxes` output structure

Read `references/indicator-behavior-analysis.md` for the codebase's detailed color-code reference and box type legend.
