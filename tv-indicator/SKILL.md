---
name: tradingview-pine-manager
description: >
  Manage, search, create, download, update, run, and configure TradingView Pine Scripts
  using CLI tools built on the tv.cjs TradingView API library. Trigger this skill when
  the user mentions TradingView, Pine Script, Pine Script v5/v6, TradingView indicator,
  TradingView strategy, Pine Editor, publishing scripts, pulling scripts, running
  indicators, backtesting strategies, scanning markets, or analyzing TradingView scripts.
  Also trigger for requests involving searching public scripts, managing saved scripts,
  compiling Pine code, generating input configurations, multi-timeframe scans, comparing
  indicators, or batch operations on TradingView scripts.
version: 1.0.0
compatibility: Node.js 18+, npm-installed dependencies (axios, form-data, yaml, ws). TradingView account with session cookie for authenticated operations.
required_environment_variables:
  - name: SESSION
    prompt: TradingView sessionid cookie value
    help: From browser dev tools > Application > Cookies > sessionid
    required_for: authenticated operations (list remote, pull, push, run, scan, compare, backtest)
  - name: SIGNATURE
    prompt: TradingView sessionid_sign cookie value
    help: From browser dev tools > Application > Cookies > sessionid_sign
    required_for: authenticated operations
  - name: TV_USER
    prompt: TradingView username
    help: Your TradingView username (required for create, push, delete, compile)
    required_for: write operations
metadata:
  hermes:
    tags: [tradingview, pine-script, finance, trading, indicators, strategies, api, websocket]
    category: finance
---

# TradingView Pine Script Manager

A toolkit for managing TradingView Pine Scripts via CLI and programmatic API.
All tools live in `scripts/` and share the `tv.cjs` core library.

## When to Use

- User mentions TradingView, Pine Script, or Pine Editor
- User wants to search, create, pull, push, delete, or compile Pine scripts
- User wants to run an indicator on a symbol/timeframe
- User wants to scan multiple timeframes or compare indicators
- User wants to backtest a strategy or batch-run operations
- User wants to discover public scripts or fetch indicator metadata

## Procedure

### 1. Choose the Right Tool

| Task | Tool | Auth Required |
|------|------|---------------|
| Public script discovery | `publist.cjs` | **NO** |
| Script lifecycle (create/pull/push/delete) | `tv-cli.js` | YES |
| Agent workflows (JSON, scan, compare, batch) | `tvcli.js` | YES |
| Metadata fetch (inputs, plots, source) | `run-indicator.js` | YES |
| Custom programmatic logic | `tv.cjs` library | YES (for auth endpoints) |

### 2. Set Environment Variables (for authenticated tools)

```bash
export SESSION="your_tradingview_session_cookie"
export SIGNATURE="your_tradingview_session_signature"
export TV_USER="your_tradingview_username"
```

For details on how to extract cookies from your browser, see the `Pitfalls` section below.

### 3. Run Commands from the Scripts Directory

```bash
cd /Volumes/ExMac/code/tradingview/js-experiment06/tv-indicator/scripts
```

### 4. Common Workflows

**Search public scripts (no auth):**
```bash
node publist.cjs search "RSI" --limit 10 --json
node publist.cjs top --limit 100 --output top.json
```

See `references/public-script-discovery.md` for full publist.cjs documentation.

**Create and manage scripts:**
```bash
node tv-cli.js create myscript.pine --name "My Strategy"
node tv-cli.js push 1
node tv-cli.js run 1 --symbol OANDA:XAUUSD --tf 5m
```

See `references/script-manager.md` for full tv-cli.js documentation.

**Agent workflows:**
```bash
node tvcli.js scan 1 OANDA:XAUUSD --timeframes 5m,15m,1h,4h,D
node tvcli.js compare 1 2 OANDA:XAUUSD --tf 1h
node tvcli.js batch commands.json
```

See `references/agent-cli.md` for full tvcli.js documentation.

**Programmatic API:**
```javascript
const TradingView = require('./tv.cjs');
const indicator = await TradingView.getIndicator('USER;abc123', 'last', SESSION, SIGNATURE);
indicator.setOption('length', 50);
```

See `references/tv-cjs-api.md` for full API documentation.

**Workflow patterns:**
See `references/workflow-patterns.md` for common patterns (Search→Pull→Modify→Push, Create→Run→Iterate, Multi-variant testing, etc.).

**Metadata fetch:**
```bash
node run-indicator.js "USER;abc123" OANDA:XAUUSD 15 ./output
```

See `references/metadata-fetcher.md` for details.

## CLI Argument Formatting

All scripts use a **custom POSIX-style parser** (not a library like `yargs` or `commander`). Arguments are parsed as:

- **Positional args**: plain values (`node script.js cmd arg1 arg2`)
- **Long flags**: `--key value` or `--key=value`
- **Short flags**: `-k value` (single letter only)
- **Booleans**: `--flag` alone sets it to `true`

### `publist.cjs` — No Auth

```bash
node publist.cjs <command> [flags]

# Commands
list                    # List public scripts
  --offset <n>          # Starting offset (default: 0)
  --limit <n>           # Max results (default: 20)
  --json                # Output JSON instead of table

search <query>          # Search public scripts
  --limit <n>           # Max results (default: 20)
  --json                # Output JSON

top                     # Fetch top scripts to file
  --limit <n>           # Number to fetch (default: 100)
  --output <file>       # Output file (default: top_scripts.json)
```

### `tv-cli.js` — Script Manager

```bash
node tv-cli.js <command> [args] [flags]

# Commands
list                    # List tracked scripts
  -r, --remote          # List remote saved scripts instead

search <query>          # Search public scripts
  --limit N             # Limit results (default: 20)
  --json                # Output as JSON

create <file.pine>      # Create new remote script from local file
  --name "Name"         # Script name (default: filename)

pull <id|pineId>        # Pull remote script to local
                        # Omit for interactive remote selection

push <id|file>          # Push local changes to remote
  --force               # Push even if hashes match

delete <id>             # Delete script from remote and tracking
  --yes                 # Confirm deletion

compile <file.pine>     # Compile script (check for errors)

inputs <id|file>        # Generate inputs YAML from script
  --out <path>          # Output path

run <id|pineId|file>    # Run script with TradingView chart session
  --symbol OANDA:XAUUSD # Market symbol
  --tf 5m               # Timeframe (auto-converted)
  --range 500           # Number of bars
  --inputs <file.yaml>  # Inputs file
  --<input_id> <value>  # Override specific input (e.g. --in_0 50)
  --json                # Show JSON output
  --out <file.json>     # Save output to file
  --timeout <ms>        # Timeout (default: 60000)
```

**Target resolution rules for `run`, `pull`, `push`, `inputs`:**
- **Numeric ID** (`1`, `2`, `3`): Looks up tracked script in `.tv-meta.json`
- **Pine ID** (`PUB;...`, `USER;...`, `STD;...`): Uses directly
- **File path**: Resolves relative to cwd, extracts `// pineId: ...` comment if present

### `tvcli.js` — Agent CLI (JSON Output)

```bash
node tvcli.js <command> [args] [flags]

# Auth & Discovery
validate                                    # Check auth & connectivity
search <query>                              # Search public scripts
  --limit N                                 # Limit results

# Script Lifecycle
list                                        # List tracked scripts
  --remote                                  # List remote saved scripts

pull <id|pineId>                            # Pull remote script to local
  --out <file.pine>                         # Output path

push <id|file>                              # Push local changes to remote
  --force                                   # Push even if hashes match
  --create-if-missing                       # Auto-create if no pineId

delete <id>                                 # Delete script
  --yes, -y                                 # Confirm deletion

compile <file>                              # Compile script

# Execution & Analysis
run <id|pineId|file> <symbol>               # Run indicator analysis
  --symbol <sym>                            # Market symbol (also positional)
  --timeframe <tf>, --tf <tf>               # Timeframe (default: 5m)
  --range N                                 # Bar count (default: 500)
  --timeout <ms>                            # Timeout (default: 60000)
  --<input_id> <value>                      # Input override

scan <id|pineId|file> <symbol>              # Multi-timeframe scan
  --symbol <sym>                            # Market symbol
  --timeframes 5m,15m,1h,4h,D               # Comma-separated timeframes
  --range N                                 # Bar count
  --timeout <ms>                            # Timeout (default: 90000)

compare <id1> <id2> <symbol>                # Compare two indicators
  --symbol <sym>
  --tf <timeframe>                          # Timeframe (default: 5m)

backtest <id|pineId|file> <symbol>          # Run historical analysis
  --symbol <sym>
  --tf <timeframe>
  --range N                                 # More history (default: 2000)

runx <id|pineId|file>                       # Extended multi-variant execution
  --symbol <sym>                            # Required. Single or comma-separated
  --timeframes <tfs>                        # Comma-separated
  --variants <file.json>                    # Input permutation spec
  --inputs key=val,key2=val2                # Inline input overrides
  --range N                                 # Bar count (default: 500)
  --no-score                                # Skip quality scoring
  --timeout <ms>

batch <file.json>                           # Execute multiple commands

# Global Output Flags
--format=json|human|yaml|csv                # Output format (default: json)
--compact                                   # Compact JSON (no whitespace)
--human                                     # Human-readable output
--quiet                                     # Suppress non-essential output
--json                                      # Force JSON output
```

### `run-indicator.js` — Metadata Fetcher

```bash
node run-indicator.js [pineId] [symbol] [timeframe] [outputDir]

# All args are positional — no flags
pineId      # Default: USER;3f4483bd813545908ab6e1a6fe9636d5
symbol      # Default: OANDA:XAUUSD
timeframe   # Default: 15 (minutes)
outputDir   # Optional. If provided, saves result.txt + summary.txt

# Examples
node run-indicator.js
node run-indicator.js "PUB;ff1a0136336340f38e908eeb12ea33aa" OANDA:XAUUSD 15
node run-indicator.js "USER;abc123" OANDA:XAUUSD 60 ./output
```

### Common Argument Patterns

**Pine ID formats** (all tools accept these):
| Prefix | Example | Meaning |
|--------|---------|---------|
| `USER;` | `USER;4cbc6ac01ab548fca7e566aaf33d33b1` | User-published script |
| `PUB;` | `PUB;ff1a0136336340f38e908eeb12ea33aa` | Public script |
| `STD;` | `STD;RSI` | Built-in indicator |
| `INDIC;` | `INDIC;...` | Third-party indicator |

**Timeframe formats** (auto-converted by all tools):
| Input | Converted To | Description |
|-------|-------------|-------------|
| `5m` | `5` | 5 minutes |
| `15m` | `15` | 15 minutes |
| `1h` | `60` | 1 hour |
| `4h` | `240` | 4 hours |
| `D` | `D` | Daily |
| `W` | `W` | Weekly |
| `M` | `M` | Monthly |

**Input overrides**:
- `tv-cli.js run`: `--in_0 50 --in_1 14 --show_fib true`
- `tvcli.js run`: Same style: `--in_0 50 --in_1 14`
- `tvcli.js runx`: `--inputs length=50,source=close`

**Environment Variables**:
```bash
export SESSION="your_sessionid_cookie"
export SIGNATURE="your_sessionid_sign_cookie"
export TV_USER="your_tradingview_username"
```

## Pitfalls

- **Auth required for most tools**: Only `publist.cjs` works without credentials. `tv-cli.js` and `tvcli.js` enforce SESSION even for public search due to config validation. Always use `publist.cjs` for no-auth discovery.
- **Cookie extraction**: Get `sessionid` and `sessionid_sign` from browser DevTools → Application → Cookies → `https://www.tradingview.com`. These expire periodically — refresh them if commands start failing with auth errors.
- **Free tier limit**: TradingView free accounts support only 1 study per chart. The run commands automatically clear existing studies.
- **WebSocket auth fallback**: Both `tv-cli.js` and `tvcli.js` fall back to anonymous WebSocket auth if cookie-based auth is blocked by TradingView (geo/anti-bot). This allows `run` to work even when the auth page returns 403.
- **Timeframe format**: Use numeric minutes (`5`, `15`, `60`, `240`) or `D`, `W`, `M`. Human formats like `5m`, `1h`, `4h` are auto-converted.
- **Pine ID format**: `USER;<uuid>`, `PUB;<id>`, `STD;<id>`, `INDIC;<id>`
- **Input overrides**: `tv-cli.js` uses `--<input_id> <value>`. `tvcli.js runx` uses `--inputs key=val,key2=val2`.
- **Timeout**: The `run` command defaults to 60s. Increase with `--timeout 120000` for complex indicators.
- **Do not use tv-unified.js**: `tv-unified.js` and `tv-unified-fixed.js` are incomplete consolidation attempts. Stick to the individual tools.

## Verification

To verify the skill is working:

1. **Test public discovery (no auth):**
   ```bash
   node publist.cjs search "SMA" --limit 3 --json
   ```
   Should return JSON with results array containing script objects.

2. **Test auth (requires SESSION):**
   ```bash
   node tvcli.js validate
   ```
   Should return `{ authenticated: true, ... }` when credentials are valid.

3. **Test compilation (requires SESSION + TV_USER):**
   ```bash
   node tv-cli.js compile .tv-scripts/001--cli-test-indicator.pine
   ```
   Should return `✓ Compilation successful`.

4. **Test metadata fetch (requires SESSION):**
   ```bash
   node run-indicator.js "USER;4cbc6ac01ab548fca7e566aaf33d33b1" OANDA:XAUUSD 15
   ```
   Should print indicator details, inputs, and plots.
