---
name: generic-indicator
description: |
  Use the Generic Pine Script Indicator runner to analyze ANY TradingView indicator on any symbol/timeframe. This skill triggers when the user wants to: run an arbitrary Pine script, extract data from a custom indicator, analyze numerical plots and graphics from any public or private indicator, or get structured output from indicators not covered by specific skills. Also triggers when the user runs `generic-indicator.cjs` or mentions terms like "generic indicator", "custom pine script", "run any indicator", "extract indicator data", or provides a specific Pine ID like "PUB;..." or "USER;..." without a dedicated skill.
---

# Generic Pine Script Indicator — Universal Runner

## What This Skill Does

Provides a universal interface to run **any** TradingView Pine Script indicator and extract structured data from it. Unlike dedicated skills for specific indicators, this runner works with any public (`PUB;...`) or private (`USER;...`) Pine script that outputs:

- **Numerical plots** — any `plot()` output (lines, histograms, oscillators, signals)
- **Graphics** — labels, lines, boxes, tables, shapes
- **Strategy reports** — backtest metrics, trades, performance

The runner automatically:
- Discovers indicator metadata (name, inputs, plot styles)
- Categorizes numerical fields (price, oscillator, signal, colorer, etc.)
- Detects signal events (zero-crossings, discrete triggers)
- Identifies crossovers between numerical series
- Extracts meaningful graphics (text labels, price levels, table data)
- Generates a recommendation based on signal confluence

## Dependencies

- `generic-indicator.cjs` in the project root (depends on `tv.cjs` + `.env` with SESSION/SIGNATURE)
- `node` (v18+)
- The Pine ID of the indicator you want to run

## Quick Start

```bash
# Run any public indicator by Pine ID
node generic-indicator.cjs --pine PUB;ff1a0136336340f38e908eeb12ea33aa --symbol BTCUSDT

# Run with custom inputs
node generic-indicator.cjs --pine PUB;xxxx --symbol ETHUSDT --input lookback=200 --input rows=50

# Full JSON output to file
node generic-indicator.cjs --pine USER;abc123 --symbol SOLUSDT --tf 1h --bars 1000 --json --out result.json

# Agent mode
node generic-indicator.cjs --pine PUB;xxxx --symbol BTCUSDT --agent --json
```

## How to Find a Pine ID

### Public Indicators

1. Open the indicator page on TradingView (e.g., `tradingview.com/script/XXXX-Indicator-Name/`)
2. The Pine ID is in the URL or in the "Make It Mine" / source code
3. Format: `PUB;xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Private Indicators

1. Open Pine Editor in TradingView
2. The script ID is shown in the editor or in the indicator's "More" menu
3. Format: `USER;xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### From TradingView Chart

1. Add the indicator to a chart
2. Open browser DevTools → Network tab
3. Look for WebSocket messages containing `create_study`
4. The Pine ID is in the `scriptId` field

## How the Runner Works

### Auto-Discovery

The runner loads the indicator metadata from TradingView's API, which includes:
- Script name and description
- Input parameters (with names, types, defaults, ranges)
- Plot definitions (styles, titles, colors)

### Field Categorization

Numerical fields are automatically classified:

| Category | Detection Criteria | Examples |
|----------|-------------------|----------|
| `price` | Large values, name contains "price/close/open/high/low" | SMA, EMA, VWAP |
| `oscillator` | Range -100 to +100 or 0 to 100 | RSI, Stoch, CCI |
| `signal` | Binary/discrete values (-1, 0, 1) or names containing "signal/buy/sell" | Long/Short triggers |
| `colorer` | Name contains "color/colour" or ends with `_colorer` | Plot colorers |
| `volume` | Name contains "volume/vol" | Volume, OBV |
| `continuous` | Everything else | MACD, ATR, Bollinger Bands |

### Signal Detection

For fields categorized as `signal`, the runner detects:
- **Fresh signals** — value transitions from 0 to non-zero
- **Fired signals** — consecutive non-zero values
- Reports bar index and timestamp for each event

### Crossover Detection

For all numeric field pairs, the runner scans the last 20 bars for:
- **Bullish crossover** — field A crosses above field B
- **Bearish crossover** — field A crosses below field B

### Graphic Extraction

All graphics are parsed and filtered for meaningful data:
- **Labels** with text (signal names, prices, grades)
- **Boxes** with price coordinates (zones, OBs, FVGs)
- **Lines** with price levels (SL, TP, support/resistance)
- **Tables** with cell data (dashboards, statistics)

## Interpreting Output

### Intelligence Summary

A natural-language summary of what the script produced:
- Number of numerical fields and graphics
- Field categories detected
- Strategy backtest metrics (if available)

### Current State

- **Latest bar** — OHLCV from the most recent candle
- **Active signals** — signals firing on the current bar (barsAgo = 0)
- **Recent signals** — signals in the last 5 bars
- **Trend summary** — direction and momentum for key fields

### Recommendation

A simple heuristic recommendation based on signal confluence:
- `bullish` — more bullish signals than bearish in last 3 bars
- `bearish` — more bearish signals than bullish in last 3 bars
- `mixed` — conflicting signals
- `neutral` — no significant signals

### Strategy Metrics

If the indicator includes strategy backtest data:
- Net profit, profit factor, win rate
- Drawdown, Sharpe ratio, Sortino ratio
- Trade counts, average trade

## Trading Methodology

Since this is a generic runner, the trading methodology depends entirely on the specific indicator being run. However, general principles apply:

### Step 1: Understand the Indicator

Before trading, know what the indicator measures:
- Is it a trend-following system? (look for direction + quality)
- Is it a mean-reversion tool? (look for extreme oscillator values)
- Is it a signal generator? (look for discrete triggers)

### Step 2: Read the Categorized Fields

Check the `fieldCategories` in the output:
- `signal` fields → direct trade triggers
- `oscillator` fields → overbought/oversold readings
- `price` fields → levels for support/resistance
- `continuous` fields → trend strength, volatility

### Step 3: Check Signal Events

Look at `signals.active` and `signals.recent`:
- Multiple signals firing simultaneously → higher conviction
- Conflicting signals → caution or wait

### Step 4: Look for Crossovers

Crossovers between key fields often indicate momentum shifts:
- Fast MA crossing above slow MA → bullish
- Oscillator crossing above threshold → bullish

### Step 5: Extract Graphics

If the indicator draws graphics, inspect them:
- Labels with prices → entry/SL/TP levels
- Boxes → zones of interest (support/resistance, OBs, FVGs)
- Lines → structural levels
- Tables → dashboard statistics

## Workflow

### Step 1: Get the Pine ID

Find the indicator's Pine ID from TradingView.

### Step 2: Run the Indicator

```bash
node generic-indicator.cjs --pine <PINE_ID> --symbol <SYMBOL> --tf <TF> --bars <BARS>
```

### Step 3: Inspect the Output

1. Read the **summary** for an overview
2. Check **field categories** to understand what the indicator outputs
3. Look at **active signals** for immediate triggers
4. Review **crossovers** for momentum shifts
5. Inspect **graphics** for visual levels and zones
6. Check **strategy metrics** if backtest data is available

### Step 4: Construct Trade Story

From the output, answer:
1. **What does the indicator measure?** (categories)
2. **What's it saying now?** (active signals, latest values)
3. **Is there momentum?** (crossovers, trend direction)
4. **Are there price levels?** (graphics, numerical values)
5. **What's the historical performance?** (strategy metrics)

## Custom Inputs

Override indicator inputs using `--input key=value`:

```bash
node generic-indicator.cjs --pine PUB;xxxx --symbol BTCUSDT \
  --input length=20 \
  --input source=close \
  --input showSignals=true
```

The runner attempts to match inputs by:
1. TV input ID (e.g., `in_0`, `in_1`)
2. Input name (case-insensitive)

Types are auto-detected from the indicator's metadata.

## Error Handling

- "Unknown pine ID" → Check the ID is correct and publicly accessible
- "Private script access denied" → Private scripts require your auth session to have access
- "Maximum number of studies" → Built-in retry (3 attempts)
- "No data returned" → Indicator may be graphics-only; check `graphicData.summary`
- "Symbol load timeout" → Check symbol exists on TradingView

## Advanced Usage

### Batch Analysis

Run the same indicator across multiple symbols:

```bash
for sym in BTCUSDT ETHUSDT SOLUSDT; do
  node generic-indicator.cjs --pine PUB;xxxx --symbol $sym --json --out ${sym}.json
done
```

### Multi-Timeframe

Run the same indicator on multiple timeframes for confluence:

```bash
for tf in 15m 1h 4h; do
  node generic-indicator.cjs --pine PUB;xxxx --symbol BTCUSDT --tf $tf --json --out btc-${tf}.json
done
```

### Programmatic API

```js
const { execSync } = require('child_process');

function runIndicator(pineId, symbol, tf = '15m', bars = 500) {
  const result = execSync(
    `node generic-indicator.cjs --pine ${pineId} --symbol ${symbol} --tf ${tf} --bars ${bars} --json`,
    { encoding: 'utf8', cwd: '/path/to/project' }
  );
  return JSON.parse(result);
}

const data = runIndicator('PUB;xxxx', 'BTCUSDT');
console.log(data.intelligence.recommendation);
```

## Sources

- TradingView Pine Script documentation
- `tv.cjs` WebSocket API implementation
- Direct analysis of TradingView `graphic` output format (dwglabels, dwglines, dwgboxes, dwgtables, dwgshapes)
