---
name: swingarm-atr-trend-indicator
description: ATR-based trend indicator for TradingView that uses background colors and trailing stop levels to generate buy/sell signals
version: 1.0.0
author: Hermes Agent
compatibility: ["tradingview", "tv-optimized.cjs", "node >= 16"]
---

# SwingArm ATR Trend Indicator Skill

## Overview
The SwingArm ATR Trend Indicator is a TradingView indicator (Pine ID: `PUB;GdkmXaTINI8knwuCrctQD1pB5dFaRnyr`) that uses Average True Range (ATR) to identify trend direction. It visualizes trends via chart background colors and trailing stop levels:
- **GREEN background** + price above green area → BUY signal
- **RED background** + price below red area → SELL signal

This skill provides a standalone runner script to fetch indicator data, parse signals, and output structured results for automated trading systems or manual analysis.

## Indicator Behavior (from Video Tutorial)
- **Core Logic**: Calculates ATR-based trailing stop levels. When price is above the trailing stop, the background turns green (bullish trend). When price is below, background turns red (bearish trend).
- **Key Input**: ATR Period (default 28, video recommends 21 for better responsiveness)
- **Additional Features**: Optional Fibonacci entry levels (LS1-LS3 for buy, SS1-SS3 for sell) and modified/unmodified trailing stop calculation.
- **Signal Confirmation**: Wait for background color to stabilize and price to clearly break above/below the trailing stop area.

## CLI Usage
```bash
node scripts/swingarm-atr-trend-indicator.cjs <SYMBOL> [options]
```

### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--symbol <SYMBOL>` | Trading symbol (e.g., BTCUSDT, ETHUSDT) | BTCUSDT |
| `--tf <TIMEFRAME>` | Chart timeframe (e.g., 15m, 1h, 1D) | 15m |
| `--bars <NUMBER>` | Number of bars to fetch | 500 |
| `--input <key=value>` | Override indicator inputs (e.g., `atrPeriod=21`) | See INPUT_MAP |
| `--json` | Output full JSON results | false |
| `--agent` | Output deterministic agent-mode JSON | false |
| `--out <FILE>` | Write output to file | none |
| `--dry-run` | Simulate execution without API calls | false |
| `--silent` | Suppress non-essential output | false |
| `--verbose`/`-v` | Show detailed error stacks | false |
| `--help`/`-h` | Show usage instructions | false |

### Indicator Inputs (--input flags)
Map to TradingView input IDs via `INPUT_MAP` in the runner script:
- `indicatorTimeframe`: Timeframe override (resolution type, default: "")
- `trailtype`: Trailing stop calculation method (text, options: `modified`/`unmodified`, default: `modified`)
- `atrPeriod`: ATR calculation period (integer, 1-100, default: 28, recommended: 21)
- `atrFactor`: ATR multiplier for trailing stop distance (integer, default: 5)
- `showFibEntries`: Show Fibonacci entry levels (bool, default: true)

### Examples
```bash
# Basic run with default settings
node scripts/swingarm-atr-trend-indicator.cjs BTCUSDT

# Use recommended ATR period, 1-hour timeframe
node scripts/swingarm-atr-trend-indicator.cjs BTCUSDT --tf 1h --input atrPeriod=21

# Output agent-mode JSON for automated systems
node scripts/swingarm-atr-trend-indicator.cjs ETHUSDT --agent --input atrPeriod=21

# Dry run to check configuration
node scripts/swingarm-atr-trend-indicator.cjs BTCUSDT --dry-run --input trailtype=unmodified

# Save output to file
node scripts/swingarm-atr-trend-indicator.cjs BTCUSDT --json --out results.json
```

## Agent-Mode Output
When using `--agent`, the script outputs a deterministic JSON object:
```json
{
  "indicator": "SwingArm ATR Trend Indicator",
  "pineId": "PUB;GdkmXaTINI8knwuCrctQD1pB5dFaRnyr",
  "trend": "BULLISH|BEARISH|NEUTRAL",
  "signal": "BUY|SELL|NONE",
  "confidence": "HIGH|MED|LOW",
  "price": 50000.00,
  "trailingStop": 49500.00,
  "rationale": "GREEN background (bullish trend) + price (50000) above trailing stop (49500)",
  "backgroundActive": true
}
```

## Pitfalls & Tips
1. **ATR Period**: Default is 28, but the tutorial recommends 21 for faster trend detection. Adjust based on your trading timeframe (lower periods = more sensitive).
2. **Trailtype**: `modified` uses a smoothed ATR calculation, `unmodified` uses standard ATR. Test both to see which fits your strategy.
3. **Signal Confirmation**: Don't trade solely on background color change. Wait for price to close above/below the trailing stop area for 1-2 bars.
4. **Fib Entries**: When `showFibEntries=true`, the indicator plots LS (Long Swing) and SS (Short Swing) levels. These are optional entry points, not core signals.
5. **Timeframe Matching**: Ensure the `--tf` matches your trading timeframe. The indicator works best on 15m, 1h, and 4h timeframes per the tutorial.

## Reference
- TradingView Script: https://www.tradingview.com/script/Dxc0Pi3n-SwingArm-ATR-Trend-Indicator/
- Tutorial Video: https://www.youtube.com/watch?v=lMPTI-ndomw
- Indicator Pine ID: `PUB;GdkmXaTINI8knwuCrctQD1pB5dFaRnyr`
