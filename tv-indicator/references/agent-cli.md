# AI Agent CLI (tvcli.js)

Structured JSON-by-default CLI designed for automation and agent workflows.
Supports multiple output formats: `--format=json|human|yaml|csv`.

**Requires**: `SESSION` for all commands. `TV_USER` additionally for write ops.

## Commands

```bash
# Validate auth and connectivity
node tvcli.js validate

# List scripts (local or remote)
node tvcli.js list
node tvcli.js list --remote
node tvcli.js ls --remote --format human

# Search public scripts
node tvcli.js search "RSI"
node tvcli.js find "moving average" --limit 20

# Create new script on remote
node tvcli.js create myscript.pine --name "My Strategy"
node tvcli.js new myscript.pine --name "My Strategy"

# Pull script from remote
node tvcli.js pull USER;abc123 --out myscript.pine
node tvcli.js pull 1

# Push local changes
node tvcli.js push 1
node tvcli.js push myscript.pine --create-if-missing --force

# Delete script
node tvcli.js delete 1 --yes
node tvcli.js rm 1 --yes

# Compile script
node tvcli.js compile myscript.pine
node tvcli.js check myscript.pine

# Run indicator analysis on a symbol
node tvcli.js run 1 OANDA:XAUUSD --tf 5m --range 500 --json
node tvcli.js run USER;abc123 BINANCE:BTCUSDT --timeframe 15m

# Multi-timeframe scan
node tvcli.js scan 1 OANDA:XAUUSD --timeframes 5m,15m,1h,4h,D

# Compare two indicators
node tvcli.js compare 1 2 OANDA:XAUUSD --tf 1h

# Backtest strategy
node tvcli.js backtest 1 OANDA:XAUUSD --tf 5m --range 2000

# Extended multi-variant execution
node tvcli.js runx USER;abc123 --symbol OANDA:XAUUSD --timeframes 5m,15m
node tvcli.js runx 1 --symbol OANDA:XAUUSD --variants variants.json
node tvcli.js runx 1 --symbol OANDA:XAUUSD --inputs length=50,source=close

# Batch execute multiple operations
node tvcli.js batch commands.json
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Authentication error |
| 3 | Validation error |
| 4 | Network error |
| 5 | Not found |
| 6 | Conflict/state error |

## Global Flags

```bash
--format=json|human|yaml|csv   Output format (default: json)
--compact                      Compact JSON output
--quiet                        Suppress non-essential output
--version                      Show version
--help                         Show help
```

## Batch File Format

```json
[
  { "command": "validate", "args": [], "stopOnError": true },
  { "command": "run", "args": ["1", "OANDA:XAUUSD", "--tf", "5m"] },
  { "command": "run", "args": ["1", "BINANCE:BTCUSDT", "--tf", "15m"] }
]
```
