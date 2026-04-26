---
name: golden-rule-strategy
description: |
  Execute the Golden Rule Strategy — a multi-timeframe high-probability trading system.
version: 1.0.0
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, technical-analysis, multi-timeframe, golden-rule]
    category: trading
---

# Golden Rule Strategy — Multi-Timeframe High-Probability Trading

## What This Skill Does

Automates the **Golden Rule Strategy**: a disciplined, probability-based trading framework that requires **three timeframes to align** and **four technical signals to confirm** before capital is put at risk. The strategy is designed for serious investors seeking consistent portfolio growth by trading *with* the primary market tide, not against it.

**The Golden Rule:** *Never trade against the weekly momentum.*

This skill:
1. Runs **Smart Money Concepts (LuxAlgo)** on Weekly, Daily, and 4-Hour timeframes
2. Computes **RSI(14)**, **Stochastic(21,5,5)**, and **MACD** from 4H price data locally
3. Applies the **3-Step Filter** to verify timeframe alignment
4. Checks the **4-Signal Checklist** for bullish/bearish confirmation
5. Outputs a **PASS/FAIL verdict** with suggested **Stop Loss** and **Take Profit** levels derived from SMC Order Blocks and Fair Value Gaps

## Dependencies

- `golden-rule-strategy.cjs` in the project root (depends on `tv-optimized.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)
- TradingView WebSocket credentials (`SESSION` and `SIGNATURE` env vars)

## Quick Start

```bash
# Default run (BTCUSDT)
node golden-rule-strategy.cjs BTCUSDT

# Specific symbol
node golden-rule-strategy.cjs ETHUSDT

# JSON output for automation
node golden-rule-strategy.cjs SOLUSDT --json --out golden-rule.json

# Agent mode (deterministic delimited JSON)
node golden-rule-strategy.cjs BTCUSDT --agent

# Silent mode (JSON only, no logs)
node golden-rule-strategy.cjs BTCUSDT --silent --json
```

## The Strategy Framework

### Philosophy of Momentum

Success in trading is determined by the **consistency of a disciplined system**, not the magnitude of a single win. This framework yields a 90–95% probability of consistent profits by only taking trades where "the stars align."

**Core Principles:**
- **Probability Mindset:** Only trade when all conditions align
- **Momentum Mastery:** Follow established trends, don't predict reversals
- **Risk Discipline:** Identify Danger Zones and use structured exits
- **Patience Premium:** High-probability returns require holding positions for weeks or months

### The 3-Step Filter (Timeframe Hierarchy)

The "Alignment of Stars" requires three distinct timeframes to agree before capital is at risk.

| Step | Timeframe | Purpose | Rule |
|------|-----------|---------|------|
| 1 | **Weekly Anchor** | Primary trend identification | If weekly is bearish, **no long trades permitted** |
| 2 | **Daily Filter** | Swing window detection | Must align with weekly bias |
| 3 | **4-Hour Trigger** | Execution lens | Only pull trigger when 4H realigns with Daily + Weekly |

> **Why this matters:** Traders who ignore the Weekly Anchor often find themselves "buying the dip" on a 4-hour chart, only to realize they are buying a small bounce in a massive weekly downtrend.

### The 4-Signal Checklist (4-Hour Only)

A "High-Probability Buy" requires four specific conditions to be met **simultaneously** on the 4-hour chart:

| # | Signal | Indicator | Condition | Purpose |
|---|--------|-----------|-----------|---------|
| 1 | **SMC Green** | SMC Color Candles / CHoCH | Latest CHoCH is bullish OR structure bias is BULLISH | Market structure shift confirmation |
| 2 | **RSI Crossover** | RSI(14) vs Signal SMA(9) | RSI value > Signal line (Purple above Yellow) | Strength confirmation |
| 3 | **Stochastic Crossover** | Stochastic(21,5,5) | K line > D line (Blue above Orange) | Early momentum shift |
| 4 | **MACD Histogram** | MACD(12,26,9) | Histogram > 0 (Green) | Trend confirmation |

**All four must be true for a PASS verdict.**

## JSON Output Schema Reference

### Top-Level Structure

| Key | Type | Description |
|-----|------|-------------|
| `status` | string | `"ok"` or `"no_trade"` |
| `goldenRule` | dict | The core verdict and checklist |
| `timeframes` | dict | Weekly / Daily / 4H SMC data |
| `indicators` | dict | Computed RSI, Stochastic, MACD values |
| `execution` | dict | Runtime metadata |

### `goldenRule` Object

| Key | Type | Description |
|-----|------|-------------|
| `verdict` | string | `"PASS"` or `"FAIL"` |
| `direction` | string | `"long"`, `"short"`, or `null` |
| `score` | int | 0–100 alignment score |
| `checklist` | dict | Boolean results for each of the 6 checks |
| `sltp` | dict | Suggested entry, stop loss, and take profit levels |
| `rationale` | list | Human-readable reasoning |
| `warnings` | list | Danger zone alerts |

### `goldenRule.checklist`

```json
{
  "weeklyMomentum": true,
  "dailyAlignment": true,
  "smcGreen": true,
  "rsiCrossover": true,
  "stochasticCrossover": true,
  "macdHistogram": true
}
```

### `goldenRule.sltp` Object (when verdict is PASS)

```json
{
  "entry": 68500.00,
  "stopLoss": 67200.00,
  "stopLossSource": "bullish OB @ 67500-67200",
  "takeProfits": [
    { "label": "TP1 (FVG)", "price": 71200.00, "source": "FVG 69800-71200" },
    { "label": "TP2 (OB)", "price": 73500.00, "source": "OB 72000-73500" },
    { "label": "TP3 (2R)", "price": 71100.00, "source": "2:1 risk/reward" }
  ],
  "riskReward": 2.0
}
```

## Timeframe Data Reference

Each timeframe object contains SMC structure data:

| Key | Type | Description |
|-----|------|-------------|
| `bias` | string | `"BULLISH"`, `"BEARISH"`, or `"NEUTRAL"` |
| `bosCount` | int | Number of Break of Structure events |
| `chochCount` | int | Number of Change of Character events |
| `activeOBs` | int | Count of unmitigated Order Blocks |
| `activeFVGs` | int | Count of unmitigated Fair Value Gaps |

The 4H timeframe additionally includes:
- `recentBOS` — last 3 BOS labels
- `recentCHoCH` — last 3 CHoCH labels
- `activeOBsDetail` — last 3 active OBs with price levels
- `activeFVGsDetail` — last 3 active FVGs with price levels
- `currentPrice` — latest close price

## Indicator Computation Details

The script computes oscillators **locally from OHLCV data** (no additional Pine studies required):

### RSI(14) with Signal Line
- RSI period: 14
- Signal line: 9-period SMA of RSI
- **Bullish:** RSI > Signal

### Stochastic(21, 5, 5)
- %K length: 21
- %K smoothing: 5
- %D smoothing: 5
- **Bullish:** K > D

### MACD(12, 26, 9)
- Fast EMA: 12
- Slow EMA: 26
- Signal: 9
- **Bullish:** Histogram > 0

## Trading Methodology

### Step 1: Verify Weekly Anchor
- Open the `weekly` object
- `bias` must be `"BULLISH"` for long consideration
- **If bearish:** No trade. The Golden Rule is absolute.

### Step 2: Verify Daily Filter
- Open the `daily` object
- `bias` must also be `"BULLISH"`
- **If neutral/bearish:** Wait for daily to align with weekly

### Step 3: Verify 4-Hour Trigger
- Open the `h4` object
- Check `goldenRule.checklist` — all 6 items should be `true`
- If 4H is bullish but oscillators haven't crossed yet: **Wait.** Do not chase.

### Step 4: Read SL/TP Levels
When `verdict === "PASS"`:
- **Entry:** Current market price (or limit at nearest FVG retest)
- **Stop Loss:** Below nearest bullish OB or FVG bottom
- **TP1:** Next FVG above price
- **TP2:** Next OB above price
- **TP3:** 2:1 risk/reward projection

> **Stop Loss Rule:** "Always place your stop loss at the level of support prior to your entry. It is better to set a deeper stop loss than a shorter one; a tight stop loss in a volatile market will only cause you to be 'shaken out'."

### The Danger Zones (When to NOT Trade)

Even when a trade looks perfect, be aware of these traps:

1. **Weekly Trend is Bearish** — Never violate the Golden Rule
2. **Indicator Divergence** — Price breaking out but oscillators not following
3. **No Break of Structure** — Price hitting resistance without clean candle breakout
4. **Economic Events** — Avoid entry during CPI data releases or FOMC meetings

## Interpreting the Score

| Score | Meaning | Action |
|-------|---------|--------|
| 90–100 | All 6 checks pass | **PASS** — High-probability setup |
| 60–89 | Timeframes aligned, some signals pending | **PENDING** — Wait for full alignment |
| 30–59 | Partial alignment | **NO TRADE** — Conditions incomplete |
| 0–29 | Major misalignment | **NO TRADE** — Stand aside |

## Workflow

### Single Asset Analysis

```bash
node golden-rule-strategy.cjs BTCUSDT --json --out btc_golden.json
```

Parse the JSON:
```python
import json

with open("btc_golden.json") as f:
    data = json.load(f)

verdict = data["goldenRule"]["verdict"]
checklist = data["goldenRule"]["checklist"]
sltp = data["goldenRule"].get("sltp")

if verdict == "PASS":
    print(f"✅ PASS | Entry: {sltp['entry']} | SL: {sltp['stopLoss']}")
    for tp in sltp['takeProfits']:
        print(f"   {tp['label']}: {tp['price']}")
else:
    print(f"❌ FAIL — reasons:")
    for reason in data["goldenRule"]["rationale"]:
        print(f"   {reason}")
```

### Fleet Scan (Multiple Assets)

```bash
for sym in BTCUSDT ETHUSDT SOLUSDT; do
  node golden-rule-strategy.cjs $sym --silent --json --out "grs_${sym}.json" &
done
wait
```

Rank by `goldenRule.score` — highest score gets priority.


## Verification

To confirm this skill executed correctly:

1. Run `node golden-rule-strategy.cjs BTCUSDT --agent`
2. Confirm the JSON output contains a `status: "ok"` field
3. Verify the output includes indicator-specific data (see schema sections above)
4. For multi-timeframe skills, confirm all requested timeframes returned data

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `SESSION and SIGNATURE env vars required` | Missing credentials | Set `.env` with SESSION and SIGNATURE |
| `Connection timeout` | Network or auth issue | Check credentials, retry |
| `Symbol load timeout` | Invalid symbol | Verify symbol exists on TradingView |
| `Insufficient data for indicator computation` | Not enough bars | Increase `--bars` or check symbol liquidity |
| `Maximum number of studies` | Study limit hit | Built-in retry (3 attempts) |

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| `symbol` | `BTCUSDT` | Trading pair to analyze |
| `bars` | `500` | Historical bars for SMC detection and indicator warmup |

## SMC Input Overrides

You can override SMC indicator inputs via `--input key=value`:

```bash
node golden-rule-strategy.cjs BTCUSDT --input showInternalOrderBlocksInput=false --input showFairValueGapsInput=true
```

See `smart-money-concepts/SKILL.md` for the full input reference.

## Enhanced Capabilities

### `goldenRule.sltp` — Auto-Computed Risk Levels

Stop loss and take profits are automatically derived from:
- **SL:** Nearest unmitigated bullish Order Block bottom (or FVG bottom if no OB)
- **TP1:** Nearest unmitigated FVG above current price
- **TP2:** Nearest bullish OB above current price
- **TP3:** 2:1 risk/reward projection from entry

### `goldenRule.rationale` — Human-Readable Reasoning

A list of pass/fail reasons for each check, enabling quick diagnostic understanding of why a setup passed or failed.

### `goldenRule.warnings` — Danger Zone Alerts

Proactive alerts for conditions like:
- Weekly trend bearish
- Indicator divergence detected
- No active OBs/FVGs for clean entry mechanics

## Sources

- TradingView SMC indicator: `PUB;6daafb2cabe6419d98ae25229d2327f8` (LuxAlgo)
- Golden Rule Strategy methodology: Multi-timeframe momentum alignment with institutional order-flow confirmation
