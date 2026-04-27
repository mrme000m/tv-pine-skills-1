# Metadata Fetcher (run-indicator.js)

Fetches indicator metadata (inputs, plots, source code) via TradingView's REST API.
Does **NOT** execute the indicator on live data — use `tv-cli.js run` or `tvcli.js run` for that.

**Requires**: `SESSION`

## Usage

```bash
# Basic usage
node run-indicator.js "USER;abc123" OANDA:XAUUSD 15

# With output directory
node run-indicator.js "USER;abc123" OANDA:XAUUSD 15 ./output
```

## What It Outputs

1. **Indicator Details**: name, version, type, description
2. **Inputs**: all input parameters with defaults, min/max, options
3. **Plots**: all output plots with IDs and types
4. **Public Info**: title, author, access, agrees, version, URL
5. **Files saved** (if output dir provided):
   - `result.txt` — full JSON metadata
   - `summary.txt` — human-readable summary
