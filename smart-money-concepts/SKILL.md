---
name: smart-money-concepts
description: |
  Use the Smart Money Concepts [LuxAlgo] TradingView indicator to analyze market structure breaks (BOS/CHoCH), fair value gaps (FVG), order blocks (OB), and equal highs/lows for institutional-grade trade setups.
version: 1.0.0
license: MIT
author: TradingView Pine Skills
compatibility: Node.js 18+ with tv-optimized.cjs, tv.cjs, agent-output.cjs and .env (SESSION, SIGNATURE) at project root
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, smc, order-blocks, fvg]
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

# Smart Money Concepts [LuxAlgo] — Trading Opportunity Finder

## When to Use

Helps the user run the standalone `smart-money-concepts.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on institutional market structure analysis. The output includes:

- **Structure Events** — BOS (Break of Structure), CHoCH (Change of Character), Internal and Swing variants
- **Fair Value Gaps** — Bullish/Bearish FVGs for entry zones
- **Order Block Breakouts** — Internal and Swing OB breakouts
- **Equal Highs/Lows** — liquidity sweep detection
- **Swing Bias** — overall bullish/bearish/neutral bias from signal ratios

The skill connects raw indicator output to actionable trade logic: entry zones (at FVGs/OBs), trend direction (from BOS/CHoCH), and structural invalidation points.

## Dependencies

- `scripts/smart-money-concepts.cjs` in the skill directory (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node scripts/smart-money-concepts.cjs BTCUSDT

# Specific timeframe
node scripts/smart-money-concepts.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node scripts/smart-money-concepts.cjs BTCUSDT --json --out smc.json

# Agent mode
node scripts/smart-money-concepts.cjs BTCUSDT --agent

# Multi-timeframe scan (recommended)
node scripts/smart-money-concepts.cjs BTCUSDT --tf 1h --bars 800 --json --out smc_1h.json &
node scripts/smart-money-concepts.cjs BTCUSDT --tf 4h --bars 500 --json --out smc_4h.json
```

**Important:** The Pine source default for `showFairValueGapsInput` is `false`, but this runner now applies a safe default override to `true` unless you explicitly pass `--input showFairValueGapsInput=false`.

## How the Indicator Works

### Core Architecture

The indicator identifies institutional market structure elements:
- **BOS (Break of Structure)** — price breaks beyond previous high/low in trend direction
- **CHoCH (Change of Character)** — price breaks previous high/low against prior trend (reversal)
- **FVG (Fair Value Gap)** — 3-candle imbalance where middle candle doesn't overlap
- **OB (Order Block)** — last opposing candle before a strong move
- **Equal Highs/Lows** — liquidity pools for sweeps

**Types:**
- Internal BOS/CHoCH — within current structure
- Swing BOS/CHoCH — at swing points (higher significance)
- Internal/Swing OB Breakouts — order block breaches

### Signal Detection

**Structure State:**
- Latest BOS/CHoCH event determines current structural bias
- Bullish BOS/CHoCH → bullish structure
- Bearish BOS/CHoCH → bearish structure

**Swing Bias:**
- STRONGLY_BULLISH → overwhelming bullish signals
- STRONGLY_BEARISH → overwhelming bearish signals
- BULLISH/BEARISH → moderate bias
- NEUTRAL → no clear bias

## JSON Output Schema Reference

The script outputs a single JSON object with these top-level keys:

| Key | Type | Description |
|-----|------|-------------|
| `summary` | dict | Aggregated counts, bias, and structural metadata |
| `bosLabels` | list | All BOS label events `{text, x, y, isBullish, isBearish}` |
| `chochLabels` | list | All CHoCH label events (same shape) |
| `fvgBoxes` | list | All FVG boxes `{top, bottom, left, right, size, isMitigated}` |
| `obBoxes` | list | All OB boxes `{top, bottom, isBullish, isBearish, direction, isMitigated}` |
| `eqhLines` | list | Equal highs/lows lines `{type, price}` |
| `activeOBs` | list | Currently un-mitigated OBs |
| `activeFVGs` | list | Currently un-mitigated FVGs |
| `signals` | list | Raw extracted signals from the script |
| `enhanced` | dict | Pre-scored trade signals, narrative, and agentic score |
| `narrative` | dict | Auto-generated prose analysis (`marketStructure`, `primaryOpportunity`, `warnings`, `watchlist`) |
| `meta` | dict | Runtime metadata (`timeframe`, `periodCount`, `price`, `integrity`) |

**Key fields within `summary`:**
- `structureBias` — `"BULLISH"`, `"BEARISH"`, or `"NEUTRAL"`
- `biasScore` — float (positive = bullish, negative = bearish)
- `bosCount`, `chochCount`, `fvgCount`, `obCount`, `eqhCount`
- `activeFVGs`, `activeOBs`
- `recentBOS`, `recentCHoCH` — counts in the last N bars
- `mitigatedFVGs`, `mitigatedOBs`

**Key fields within `enhanced`:**
- `signals[]` — pre-scored setups `{rank, setupType, direction, confluenceScore, confidence, rationale}`
- `agenticScore` — 0.0–1.0 reusability score (quick filter)

### Deprecated Schema Mapping

If you previously used an older schema in prompts/parsers, map it like this:

- `structure.state` -> `summary.structureBias` + latest event from `bosLabels` / `chochLabels`
- `latestStructure.type` -> latest label `type` in `bosLabels`/`chochLabels` by max `x`
- `latestStructure.direction` -> latest label `isBullish` / `isBearish`
- `swingBias` -> `summary.structureBias` (plus `summary.biasScore` for strength)
- `fairValueGaps` -> `fvgBoxes` or `activeFVGs`
- `orderBlocks` -> `obBoxes` or `activeOBs`
- `price.close` -> `meta.price.close` (check `meta.integrity.warnings`)

## Interpreting Output

### Structure State (Key Signal)

Read `summary.structureBias` and cross-check against the **latest** entries in `bosLabels` / `chochLabels` (sort by `x` — bar index — the highest is the most recent).

**Trading logic:**
- Latest `bosLabels` entry with `isBullish=true` → **BULLISH BOS** (continuation long)
- Latest `chochLabels` entry with `isBullish=true` → **BULLISH CHoCH** (reversal long)
- Latest `bosLabels` entry with `isBearish=true` → **BEARISH BOS** (continuation short)
- Latest `chochLabels` entry with `isBearish=true` → **BEARISH CHoCH** (reversal short)
- Fresh CHoCH against prevailing bias = possible trend reversal; wait for confirmation.

### Fair Value Gaps

FVGs live in `fvgBoxes` / `activeFVGs`. Each entry has `top` and `bottom` price levels. `isMitigated=true` means price already closed through the gap.

**Trading logic:**
- **Bullish FVG** → long entry on retest of the gap
- **Bearish FVG** → short entry on retest of the gap
- FVG near current price = highest priority
- FVG in direction of `summary.structureBias` = best confluence
- `activeFVGs` (non-mitigated) are the only ones worth trading
- Runner default keeps FVGs enabled; disable only if you intentionally want structure-only analysis.

### Order Blocks

OBs live in `obBoxes` / `activeOBs`. Direction is available as `isBullish`/`isBearish` and `direction`.

**Trading logic:**
- `activeOBs` above price = bearish resistance zones
- `activeOBs` below price = bullish support zones
- Use `direction` to align OBs with `summary.structureBias`.
- Sort OBs by proximity to current price to find the nearest structural boundary

### Equal Highs/Lows

`eqhLines` contains liquidity levels.

**Trading logic:**
- `type="EQH"` → liquidity target above (look for sweep + reversal short)
- `type="EQL"` → liquidity target below (look for sweep + reversal long)

### Pre-Scored Signals (`enhanced.signals`)

The script auto-generates ranked trade signals in `enhanced.signals[]`. Each signal has:
- `direction` — `"long"` or `"short"`
- `confluenceScore` — 0.0–1.0
- `confidence` — `"HIGH"`, `"MEDIUM"`, `"LOW"`
- `rationale` — human-readable explanation

Use these as a quick filter before deeper manual analysis.

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Determine structure**
- Check `summary.structureBias`
- Find latest `bosLabels[-1]` and `chochLabels[-1]` (sort by `x`) to confirm recency and direction

**Step 2: Assess confidence**
- `biasScore >= 1.5` or `< -1.5` = strong directional edge
- `biasScore` near 0 with `NEUTRAL` bias = wait for structure to develop
- `recentBOS` + `recentCHoCH` both elevated = choppy structure, reduce size

**Step 3: Locate FVGs**
- Search `activeFVGs` for entries in direction of `structureBias`
- Nearest unmitigated FVG to current price = best entry zone
- No FVGs = no clean SMC entry; consider waiting or using a lower timeframe

**Step 4: Check OB boundaries**
- `activeOBs` in your direction = confirmation
- `activeOBs` against you = structural invalidation level

**Step 5: Entry trigger**
- **Long**: Bullish CHoCH or BOS + bullish active FVG + biasScore positive
- **Short**: Bearish CHoCH or BOS + bearish active FVG + biasScore negative

### Stop Loss and Targets

- **Stop Loss**: Beyond the nearest OB boundary or the structure point that created the setup
- **Take Profit 1**: Next FVG in trade direction
- **Take Profit 2**: Equal high/low liquidity pool (`eqhLines`)
- **Take Profit 3**: Opposite structure break (next major BOS/CHoCH level)

### When to AVOID Trading

- `NEUTRAL` bias with no active FVGs
- Recent CHoCH against prevailing bias without follow-through BOS
- `fvgCount=0` and no EQH/EQL liquidity — clean entry mechanics are absent
- Large dislocation between price and latest structural event (>5% on crypto) without new structure forming — the indicator may be "stale"

## Procedure

### Step 1: Run Multi-Timeframe

Run on at least two timeframes (lower for entry, higher for direction):

```bash
# Lower timeframe for precise entry zones
node scripts/smart-money-concepts.cjs BTCUSDT --tf 1h --bars 800 --json --out smc_1h.json

# Higher timeframe for structural confluence
node scripts/smart-money-concepts.cjs BTCUSDT --tf 4h --bars 500 --json --out smc_4h.json
```

Compare `summary.structureBias` across both. If they disagree, favor the higher timeframe for bias and use the lower timeframe for entry exactness.

### Step 2: Extract Levels with Python

```python
import json

with open("smc_1h.json") as f:
    d = json.load(f)

# Price level extraction
active_fvgs = [f for f in d["fvgBoxes"] if not f.get("isMitigated")]
active_obs  = d["activeOBs"]
latest_bos  = sorted(d["bosLabels"], key=lambda x: x["x"])[-1]
latest_choch = sorted(d["chochLabels"], key=lambda x: x["x"])[-1]
narrative = d.get("narrative", {})

for ob in active_obs:
    print(f"OB zone: {ob['bottom']:,.2f} - {ob['top']:,.2f}")
for fvg in active_fvgs:
    direction = "BULL" if fvg.get("isBullish") else "BEAR"
    print(f"{direction} FVG: {fvg['bottom']:,.2f} - {fvg['top']:,.2f}")
```

### Step 3: Read Summary & Narrative

1. `summary` → bias score, recent activity counts, active OB/FVG counts
2. `enhanced.signals` → pre-scored trade ideas (quick filter)
3. `narrative` → auto-generated marketStructure + primaryOpportunity prose (use as sanity check)

### Step 4: Construct Trade Story

**Example story (bullish):**
> "1H SMC bias: BULLISH (score: +1.5). Latest BULLISH BOS @ $2,313. Active bullish FVG: $2,050–$2,065. 4H confluence: BULLISH. No bearish CHoCH in last 3 events. Long on FVG retest; SL below $2,040 OB; targeting next FVG at $2,120."

### Step 5: Rank Opportunities (Fleet Scan)

When scanning multiple assets, use this ranking heuristic:
1. **Highest**: Asset with active FVG near price + structural bias aligned + higher-TF confluence
2. **Medium**: Structure aligned but no active FVG (wait for one to form on lower TF)
3. **Lowest / Avoid**: Neutral bias with no FVGs and no EQH/EQL liquidity


## Pitfalls
- No FVG data → `showFairValueGapsInput` may be false; override with `--input showFairValueGapsInput=true`
- Equal highs/lows without sweep → liquidity pool not yet taken; wait for confirmation
- **Missing SESSION/SIGNATURE**: The most common failure. Ensure `.env` contains valid TradingView session credentials.
- **"Maximum number of studies"**: TradingView rate-limits concurrent studies. Built-in retry (3 attempts) handles this; wait 30s if persistent.
- **Symbol not found**: Verify the symbol exists on TradingView (e.g., `BTCUSDT` not `BTC`).
- **Low bar count**: Some indicators need more bars than default (500). Increase with `--bars <N>`.
- **Network timeouts**: Check internet connectivity and TradingView status.

## Verification

To confirm this skill executed correctly:

1. Run `node scripts/smart-money-concepts.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data


## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for structure analysis |
| bars | 500 | Historical bars for BOS/CHoCH/FVG detection |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node scripts/smart-money-concepts.cjs BTCUSDT --input showStructureInput=false
```

**Available inputs:** modeInput (HISTORICAL), styleInput (COLORED), showTrendInput (false), showInternalsInput (true), showInternalBullInput (ALL), internalBullColorInput (GREEN), showInternalBearInput (ALL), internalBearColorInput (RED), internalFilterConfluenceInput (false), internalStructureSize (TINY), showStructureInput (true), showSwingBullInput (ALL), swingBullColorInput (GREEN), showSwingBearInput (ALL), swingBearColorInput (RED), swingStructureSize (SMALL), showSwingsInput (false), swingsLengthInput (50), showHighLowSwingsInput (true), showInternalOrderBlocksInput (true), internalOrderBlocksSizeInput (5), showSwingOrderBlocksInput (false), swingOrderBlocksSizeInput (5), orderBlockFilterInput (Atr), orderBlockMitigationInput (HIGHLOW), internalBullishOrderBlockColor (color.new(#3179f5, 80)), internalBearishOrderBlockColor (color.new(#f77c80, 80)), swingBullishOrderBlockColor (color.new(#1848cc, 80)), swingBearishOrderBlockColor (color.new(#b22833, 80)), showEqualHighsLowsInput (true), equalHighsLowsLengthInput (3), equalHighsLowsThresholdInput (0.1), equalHighsLowsSizeInput (TINY), showFairValueGapsInput (true via runner default override), fairValueGapsThresholdInput (true), fairValueGapsTimeframeInput (), fairValueGapsBullColorInput (color.new(#00ff68, 70)), fairValueGapsBearColorInput (color.new(#ff0008, 70)), fairValueGapsExtendInput (1), showDailyLevelsInput (false), dailyLevelsStyleInput (SOLID), dailyLevelsColorInput (BLUE), showWeeklyLevelsInput (false), weeklyLevelsStyleInput (SOLID), weeklyLevelsColorInput (BLUE), showMonthlyLevelsInput (false), monthlyLevelsStyleInput (SOLID), monthlyLevelsColorInput (BLUE), showPremiumDiscountZonesInput (false), premiumZoneColorInput (RED), equilibriumZoneColorInput (GRAY), discountZoneColorInput (GREEN)

Input name note: use `fairValueGapsThresholdInput` (correct). `showFairValueGapsThresholdInput` is invalid.

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output, exposed through the `enhanced` and `narrative` objects:

### `enhanced.signals` — Pre-Scored Trade Setups

Each entry in `enhanced.signals[]` is a ranked setup:

```json
{
  "rank": 1,
  "setupType": "smart_money_concepts",
  "direction": "short",
  "confluenceScore": 0.6,
  "confidence": "HIGH",
  "rationale": "SHORT bias with active bear OB at 73724.31-74360.43. Recent BOS/CHoCH: 5/5."
}
```

**Usage:** Verify the `confidence` and `confluenceScore`, then cross-reference against `activeFVGs` and `activeOBs` for exact entry/invalidation levels.

### `enhanced.narrative` — Auto-Generated Prose

```json
{
  "marketStructure": "SMC Structure: 192 BOS, 220 CHoCH, ... Bias: BEARISH. Price: 68551.02.",
  "primaryOpportunity": "SHORT bias with active bear OB at ...",
  "warnings": [],
  "watchlist": ["Monitor OB mitigation as price sweeps liquidity..."]
}
```

**Usage:** Treat as a first-draft summary — useful for sanity-checking your own read, but always verify the raw `bosLabels`/`chochLabels` and price levels.

### `enhanced.agenticScore`

A 0.0–1.0 score representing how "usable" the setup is for automated decision-making. Higher = more confluence and cleaner structure. Use it to rank a fleet of scanned assets.

### Raw Structure Parsing

- Graphic box parsing for FVGs (`fvgBoxes`) and Order Blocks (`obBoxes`)
- Label parsing for BOS/CHoCH events (`bosLabels`, `chochLabels`)
- Active vs mitigated structure tracking (`activeOBs`, `activeFVGs`, `mitigated` flag)
- OB direction and status (`isBullish`/`isBearish`/`direction`, `isMitigated`)
- Liquidity level extraction from EQH/EQL lines (`eqhLines`)
- Trend line classification (`trendLines`)

## Sources

- TradingView indicator: `PUB;6daafb2cabe6419d98ae25229d2327f8`
- Direct code-level analysis of LuxAlgo SMC structure parsing
