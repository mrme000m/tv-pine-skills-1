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
