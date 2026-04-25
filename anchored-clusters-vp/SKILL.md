---
name: anchored-clusters-vp
description: |
  Use the Anchored Clusters Volume Profile TradingView indicator to analyze volume distribution, identify Point of Control (POC) levels, and detect cluster extremes for structural trade setups. This skill triggers when the user wants to: analyze volume clusters, find POC levels, identify anchored volume profile zones, detect cluster-based support/resistance, or trade volume profile extremes. Also triggers when the user runs `anchored-clusters-vp.cjs` or mentions terms like "anchored clusters", "volume profile", "POC", "cluster", "volume distribution", or "value area".
version: 1.0.0
compatibility: Requires Node.js 18+, tv.cjs WebSocket client, and TradingView SESSION/SIGNATURE credentials
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, technical-analysis]
    category: trading
---

# Anchored Clusters Volume Profile — Trading Opportunity Finder

## What This Skill Does

Helps the user run the standalone `anchored-clusters-vp.cjs` script against any TradingView symbol and timeframe, then interprets the structured output to surface high-probability trading setups based on volume cluster analysis. The output includes:

- **Cluster Distribution** — price-by-price volume blocks showing where liquidity concentrated
- **POC Levels** — Point of Control prices where the most volume traded
- **Cluster Extremes** — range highs and lows that act as structural boundaries
- **Volume-Weighted POC** — VWAP-style reference for fair value

The skill connects raw indicator output to actionable trade logic: entry zones (at cluster extremes/POC retests), directional bias (from cluster positioning), and structural context (from volume distribution).

## Dependencies

- `anchored-clusters-vp.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)

## Quick Start

```bash
# Default run
node anchored-clusters-vp.cjs BTCUSDT

# Specific timeframe and bars
node anchored-clusters-vp.cjs ETHUSDT --tf 1h --bars 1000

# JSON output for downstream processing
node anchored-clusters-vp.cjs BTCUSDT --json --out clusters.json

# Agent mode (structured JSON for AI consumption)
node anchored-clusters-vp.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

The indicator draws **anchored volume profile clusters** on the chart using graphic objects (boxes, labels, lines). Unlike traditional indicators that return numerical period data, this is a **graphics-only** indicator — all data comes from `study.graphic`:

| Graphic Element | Source | Meaning |
|-----------------|--------|---------|
| `dwgBoxes` | Cluster bars | Volume distribution blocks at price levels |
| `dwgLabels` | POC labels | Text labels showing POC volume values |
| `dwgLines` | POC levels | Horizontal lines marking Point of Control prices |

### Data Extraction

The parser extracts:
- **Clusters**: Box coordinates (top/bottom/left/right) representing volume bars at price levels
- **POC Labels**: Volume text with numeric extraction (supports K/M/B suffixes)
- **POC Levels**: Horizontal line prices acting as key reference levels

## Interpreting Output

### Volume Clusters (Key Signal)

Clusters show where volume concentrated. Dense clusters act as magnets — price tends to revisit these levels.

**Trading logic:**
- **Cluster at range low** → potential long setup (volume support)
- **Cluster at range high** → potential short setup (volume resistance)
- **Narrow cluster range** → consolidation zone, wait for breakout
- **Wide cluster dispersion** → trending market, trade in direction of displacement

### POC Levels

The Point of Control is the price with the highest traded volume — the "fairest" price in the lookback.

**Trading logic:**
- Price **above POC** → bullish context, POC acts as support on retest
- Price **below POC** → bearish context, POC acts as resistance on retest
- **Multiple POCs** stacked → strong confluence zone
- **Volume-Weighted POC** deviating from current POC → shifting market structure

### Cluster Density

High density = strong acceptance level. Low density = rejection/inefficiency.

**Trading logic:**
- High density zone broken → significant structural shift
- Low density between clusters → potential run-away move target

## Trading Methodology

### Complete Step-by-Step Setup

**Step 1: Identify the cluster range**
- Note the highest and lowest cluster prices
- This defines the current acceptance range

**Step 2: Locate the POC**
- Find the volume-weighted POC and latest POC level
- This is your "fair value" reference

**Step 3: Determine price position relative to structure**
- Price near POC → neutral, wait for displacement
- Price at cluster extreme → watch for rejection or breakout

**Step 4: Wait for retest**
- Price retracing to POC from above → potential long
- Price retracing to POC from below → potential short
- Price rejecting at cluster high/low → fade the move

**Step 5: Entry trigger**
- Look for rejection candlestick at cluster boundary or POC
- Volume should confirm (increase on test, decrease on failure)

### Stop Loss and Targets

- **Stop Loss**: Place beyond the cluster extreme or POC level being tested
- **Take Profit 1**: Next significant cluster level in direction of trade
- **Take Profit 2**: Opposite side of the cluster range
- **Take Profit 3**: Measured move from cluster range breakout

### When to AVOID Trading

- **Single cluster** → insufficient volume distribution data
- **Price inside dense cluster** → chop zone, no directional edge
- **No clear POC** → label parsing failed or indicator uses different format
- **Clusters all on one side** → potential trend exhaustion

## Workflow

### Step 1: Run the Indicator

```bash
node anchored-clusters-vp.cjs <SYMBOL> --tf <tf> --bars <bars>
```

### Step 2: Read the Analysis Table

The CLI produces formatted output. Key sections:

1. **PROFILE** → cluster count, range, density
2. **CLUSTERS** → individual cluster price levels
3. **POC LEVELS** → Point of Control prices
4. **LATEST** → most recent cluster and POC

### Step 3: Construct Trade Story

From the output, answer:

1. **Where is volume concentrated?** (cluster locations, POC)
2. **Where is price relative to structure?** (inside range, at extreme, above/below POC)
3. **What are the key levels?** (cluster highs/lows, POC levels)
4. **Where is the nearest actionable zone?** (closest cluster extreme or POC retest)
5. **What's the risk context?** (cluster density, range width)

**Example story (bullish):**
> "Volume profile shows 12 clusters across a 3200 USDT range. VW-POC at 67245. Price is above POC with latest cluster at 67800-68100. The cluster extreme low at 64500 is key support. Long bias on POC retest from above, SL below 64500, targeting 69000 (next cluster high)."

## Error Handling

- "Maximum number of studies" → Built-in retry (3 attempts). Wait 30s if persistent.
- "Symbol load timeout" → Check symbol exists on TradingView
- No clusters detected → Indicator may need more bars or different timeframe
- No POC data → Labels may use non-standard format; check `graphic.dwgLabels` manually

## Settings Reference

| Parameter | Default | Impact |
|-----------|---------|--------|
| timeframe | 15m | Chart timeframe for cluster calculation |
| bars | 500 | Historical bars to anchor clusters on |


## Input Overrides

The script supports overriding Pine script inputs via `--input key=value`:

```bash
# Override specific inputs
node anchored-clusters-vp.cjs BTCUSDT --input startTime=CUSTOM_VALUE
```

**Available inputs:** startTime (timestamp("2024-01-01 00:00")), endTime (timestamp("2025-01-01 00:00")), rangeColor (color.new(#607d8b, 90)), kInput (5), iters (50), rowsInput (20), vpWidth (40), vpOffset (10), showDots (true), dotSizeInput (size.small)

## Enhanced Capabilities

This script includes Pine-derived analytical features beyond raw indicator output:

Graphic box parsing for cluster bins (K-Means volume profile), POC extraction from labels with volume text parsing, Line parsing for cluster levels, Cluster dominance analysis, Gap detection between clusters, Volume-weighted POC calculation, Dot label extraction

## Sources

- TradingView indicator: `PUB;92974e0a3cfb481eaf058cdab9f925a3`
- Direct code-level analysis of `graphic.dwgboxes` / `dwglabels` / `dwglines` output structure
