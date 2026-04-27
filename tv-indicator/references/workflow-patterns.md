# Workflow Patterns

## Pattern 1: Search → Pull → Modify → Push

```bash
# 1. Search for a public indicator (no auth)
node publist.cjs search "RSI divergence"

# 2. Pull it locally (requires auth)
node tv-cli.js pull PUB;Q55lng135i6ifu3s8GxaqloGDawEiTep

# 3. Edit the .pine file
# ... edit .tv-scripts/001--rsi-divergence.pine ...

# 4. Push changes (requires auth + TV_USER)
node tv-cli.js push 1
```

## Pattern 2: Create → Run → Iterate

```bash
# 1. Create from local file
node tv-cli.js create my_strategy.pine --name "Golden Cross Strategy"

# 2. Generate inputs config
node tv-cli.js inputs 1

# 3. Run with custom inputs
node tv-cli.js run 1 --symbol OANDA:XAUUSD --tf 1h --fastLength 50 --slowLength 200

# 4. Push updates after editing
node tv-cli.js push 1
```

## Pattern 3: Multi-Timeframe Scan

```bash
node tvcli.js scan 1 OANDA:XAUUSD --timeframes 5m,15m,1h,4h,D --format human
```

## Pattern 4: Batch Operations

```json
// commands.json
[
  { "command": "validate", "args": [], "stopOnError": true },
  { "command": "run", "args": ["1", "OANDA:XAUUSD", "--tf", "5m"] },
  { "command": "run", "args": ["1", "BINANCE:BTCUSDT", "--tf", "15m"] }
]
```

```bash
node tvcli.js batch commands.json
```

## Pattern 5: Extended Multi-Variant Testing

```bash
# Test indicator across symbols and timeframes
node tvcli.js runx USER;abc123 --symbol OANDA:XAUUSD,BINANCE:BTCUSDT --timeframes 5m,15m,1h

# Test with input permutations from file
node tvcli.js runx 1 --symbol OANDA:XAUUSD --variants permutations.json --out results.json

# Inline input overrides
node tvcli.js runx 1 --symbol OANDA:XAUUSD --inputs length=50,multiplier=2.0
```

## Pattern 6: Metadata Fetch (No WebSocket)

```bash
# Fetch indicator inputs, plots, and source without running live
node run-indicator.js "USER;abc123" OANDA:XAUUSD 15 ./output
```

This saves:
- `result.txt` — full JSON metadata
- `summary.txt` — human-readable summary
