# Generated SKILL.md Template

When the skill generates a new indicator skill, it produces a `SKILL.md` based on
this template. Fields marked `{{...}}` are substituted at generation time.

```yaml
---
name: {{SLUG}}
description: |
  Use the {{SCRIPT_NAME}} TradingView indicator to analyze {{ANALYSIS_TYPE}}.
version: 1.0.0
license: MIT
author: TradingView Pine Skills
compatibility: Node.js 18+ with tv-optimized.cjs, tv.cjs, agent-output.cjs and .env (SESSION, SIGNATURE) at project root
metadata:
  hermes:
    tags: [trading, tradingview, pine-script, {{TAGS}}]
    category: trading
required_environment_variables:
  - name: SESSION
    prompt: TradingView session cookie
    help: Extract from browser DevTools → Application → Cookies → tradingview.com → sessionid
    required_for: full functionality
  - name: SIGNATURE
    prompt: TradingView signature cookie
    help: Extract from browser DevTools → Application → Cookies → tradingview.com → sessionid_sign
    required_for: full functionality
---

# {{SCRIPT_NAME}} — Trading Opportunity Finder

## When to Use

Helps the user run the standalone `{{SLUG}}.cjs` script against any TradingView
symbol and timeframe, then interprets the structured output to surface
high-probability trading setups.

The output includes:
- {{OUTPUT_FEATURES}}

## Dependencies

- `scripts/{{SLUG}}.cjs` in the skill directory
- `node` (v18+)
- TradingView credentials (SESSION + SIGNATURE)

## Quick Start

```bash
# Default run
node scripts/{{SLUG}}.cjs BTCUSDT

# Specific timeframe
node scripts/{{SLUG}}.cjs ETHUSDT --tf 1h --bars 800

# JSON output
node scripts/{{SLUG}}.cjs BTCUSDT --json --out {{SLUG}}.json

# Agent mode
node scripts/{{SLUG}}.cjs BTCUSDT --agent
```

## How the Indicator Works

### Core Architecture

{{CORE_ARCHITECTURE}}

### Signal Detection

{{SIGNAL_DETECTION}}

## JSON Output Schema Reference

The script outputs a single JSON object with these top-level keys:

| Key | Type | Description |
|-----|------|-------------|
{{SCHEMA_TABLE}}

## Interpreting Output

{{INTERPRETATION_GUIDE}}

## Trading Methodology

### Complete Step-by-Step Setup

{{TRADING_STEPS}}

### Stop Loss and Targets

{{SL_TP_GUIDE}}

### When to AVOID Trading

{{AVOID_CONDITIONS}}

## Procedure

### Step 1: Run the Indicator

```bash
node scripts/{{SLUG}}.cjs <SYMBOL> --tf <TF> --bars <N> --json --out result.json
```

### Step 2: Extract Levels

```python
import json
with open("result.json") as f:
    d = json.load(f)
# {{PYTHON_EXTRACTION}}
```

### Step 3: Construct Trade Story

{{TRADE_STORY_EXAMPLE}}

## Pitfalls
- {{PITFALLS}}
- **Missing SESSION/SIGNATURE**: Ensure `.env` contains valid TradingView credentials.
- **"Maximum number of studies"**: Built-in retry (3 attempts); wait 30s if persistent.
- **Symbol not found**: Verify symbol exists (e.g., `BTCUSDT` not `BTC`).

## Verification

1. Run `node scripts/{{SLUG}}.cjs BTCUSDT --agent`
2. Confirm JSON output contains `status: "ok"`
3. Verify indicator-specific data is present

## Sources

- TradingView indicator: `{{PINE_ID}}`
- Generated from YouTube video: {{YOUTUBE_URL}}
```
