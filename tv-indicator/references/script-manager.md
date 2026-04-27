# Script Manager (tv-cli.js)

Human-friendly CLI for day-to-day Pine Script management.
Uses `.tv-meta.json` for local numeric ID tracking.

**Requires**: `SESSION` for all commands. `TV_USER` additionally for write ops (create, push, delete).

## Commands

```bash
# List tracked scripts (local)
node tv-cli.js list
node tv-cli.js ls

# List remote saved scripts
node tv-cli.js list --remote
node tv-cli.js list -r

# Search public scripts
node tv-cli.js search "RSI strategy"
node tv-cli.js search "moving average" --limit 10 --json

# Create new remote script from local file
node tv-cli.js create myscript.pine --name "My Strategy"
node tv-cli.js new myscript.pine --name "My Strategy"

# Pull remote script to local (interactive if no target)
node tv-cli.js pull USER;abc123
node tv-cli.js pull                    # interactive selection

# Push local changes to remote
node tv-cli.js push 1
node tv-cli.js push myscript.pine --force

# Delete script from remote and tracking
node tv-cli.js delete 1 --yes
node tv-cli.js rm 1 --yes

# Compile script (check for errors)
node tv-cli.js compile myscript.pine
node tv-cli.js check myscript.pine

# Generate inputs YAML from script
node tv-cli.js inputs 1
node tv-cli.js inputs myscript.pine --out inputs.yaml

# Run script with TradingView chart session
node tv-cli.js run 1 --symbol OANDA:XAUUSD --tf 5m --range 500
node tv-cli.js run USER;abc123 --symbol BINANCE:BTCUSDT --tf 15m --json
node tv-cli.js run 1 --symbol OANDA:XAUUSD --in_0 50 --in_1 14
node tv-cli.js run 1 --inputs my_inputs.yaml --out results.json
```

## Run Command Inputs

The `run` command supports overriding any input parameter via `--<input_id> <value>` flags.
Use `inputs` command to discover available input IDs first.

## Key Outputs

- `list` — shows sync status (`✓` = synced, `!` = local/remote differ)
- `run` — displays trend analysis, signals, active positions, strategy report
- `search` — table output with script IDs, authors, types

## Local Tracking

`tv-cli.js` maintains `.tv-meta.json` in the working directory:

```json
{
  "version": 1,
  "scripts": {
    "1": {
      "name": "My Strategy",
      "pineId": "USER;abc123...",
      "localPath": ".tv-scripts/001--my-strategy.pine",
      "localHash": "sha256...",
      "remoteHash": "sha256...",
      "remoteVersion": "1.0",
      "updatedAt": "2024-..."
    }
  }
}
```
