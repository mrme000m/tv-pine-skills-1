# Deterministic JSON Parsing for TradingView Skill Runners

> **Version:** 1.0.0  
> **Scope:** `self-aware-trend-system`, `smart-money-concepts`, `precision-sniper`, `ema-atr-pro-engine`  
> **Date:** 2026-04-26

---

## 1. Problem Statement

When the skill runners are invoked programmatically (e.g. from an orchestrator, MCP server, or CI pipeline) the **stdout stream is not machine-readable** because it mixes three categories of output with no deterministic framing:

| Category | Examples | Channel |
|----------|----------|---------|
| Progress / emoji logs | `📊 Running: PUB;… \| BTCUSDT \| 15m` | stdout |
| Human tables / banners | `═══════════════════════`, `📈 CURRENT BAR` | stdout |
| Final payload | `JSON.stringify(obj, null, 2)` | stdout |

Additionally:

- Pretty-printed JSON (`null, 2`) spans dozens of lines, so a naive `"{"` … `"}"` regex is unreliable.
- **Only `precision-sniper.cjs`** has a `STRICT_JSON_STDOUT` flag; the other three scripts unconditionally emit decorative logs even when `--json` or `--agent` is passed.
- Error messages are sent to **stderr** but the failure exit code is the only unambiguous signal; the orchestrator still has to drain both streams.
- There is **no schema discriminator** inside the JSON payload, so the consumer cannot validate *which* skill produced the blob without out-of-band metadata.

The result is that downstream parsers must resort to **heuristic bracket counting** or line-by-line `JSON.parse()` try/catch loops, which break whenever:

- a log line happens to contain `{` or `}` (e.g. `✅ {"key":"val"}`),
- the script throws an inline error that prints an object literal,
- the `--out` file path contains curly braces.

---

## 2. Desired Properties

| # | Property | How it is achieved |
|---|----------|--------------------|
| 1 | **Unambiguous framing** | Delimiters `<<<AGENT_JSON_START>>>` … `<<<AGENT_JSON_END>>>` |
| 2 | **Single-line payload on stdout** | `JSON.stringify(obj)` (compact) inside the delimiters |
| 3 | **Human-readable on disk** | Pretty-printed JSON written only when `--out <path>` is supplied |
| 4 | **Silent mode** | `--silent` suppresses *all* progress logs so stdout == payload |
| 5 | **Schema self-description** | `_parserMeta.schemaVersion` and `agentContext.workflow` fields |
| 6 | **Backward compatibility** | `extractPayload()` recovers JSON from old mixed output via 3 strategies |

---

## 3. Shared Module: `agent-output.cjs`

A single shared helper has been added to the project root:

```text
/Volumes/ExMac/code/tradingview/js-experiment06/agent-output.cjs
```

Full source is in the file itself. The public API surface is:

```js
const {
  AgentOutput,          // { info, warn, error, emit }
  enableSilentMode,     // (boolean) -> void
  isSilent,             // () -> boolean
  extractPayload,       // (string) -> object|null
  DELIMITER_START,      // '<<<AGENT_JSON_START>>>'
  DELIMITER_END,        // '<<<AGENT_JSON_END>>>'
  SCHEMA_VERSION,       // 'agent-ready-v2.1.0'
} = require('./agent-output.cjs');
```

### 3.1 Migration cheat-sheet for any skill runner

1. **Import** the module at the top.
2. **After `parseArgs()`** call `if (args.silent || args.agent) enableSilentMode(true);`
3. **Replace** every `console.log` / `console.warn` that is *not* the final payload with `AgentOutput.info()` / `AgentOutput.warn()`.
4. **Replace** the final `console.log(JSON.stringify(…))` block with `AgentOutput.emit(payload, { outPath: args.out })`.
5. **Add** `--silent` to the CLI parser and the `printUsage()` text.

---

## 4. Per-Skill Patches

The following sections show the **exact diffs** required for each of the four skill runners. All patches assume the `agent-output.cjs` module is present in the same directory.

---

### 4.1 `self-aware-trend-system.cjs`

#### a. Add import

Insert directly below the existing `require('./tv-optimized.cjs')` line:

```js
const { AgentOutput, enableSilentMode, isSilent } = require('./agent-output.cjs');
```

#### b. Update `parseArgs()` — add `silent` flag

Inside the `args` object literal (around line 62) add:

```js
    silent: false,
```

Inside the `for` loop (around line 80) add:

```js
    else if (a === '--silent') { args.silent = true; }
```

#### c. Update `printUsage()` — document `--silent`

Add to the Options block (around line 117):

```
  --silent                  Suppress all non-JSON stdout (use with --json or --agent)
```

#### d. Replace decorative logs with `AgentOutput`

**Before:**
```js
function exitWithError(code, message) {
  console.error(`\n❌ Error ${code}: ${message}`);
  process.exit(code);
}
```
**After:**
```js
function exitWithError(code, message) {
  AgentOutput.error(`\n❌ Error ${code}: ${message}`);
  process.exit(code);
}
```

**Before:**
```js
function exitWithStatus(status, message) {
  if (message) console.error(`\n${message}`);
  process.exit(status);
}
```
**After:**
```js
function exitWithStatus(status, message) {
  if (message) AgentOutput.error(`\n${message}`);
  process.exit(status);
}
```

**In `printResults()`** (around line 775) replace every `console.log(` with `AgentOutput.info(`.  
This is the main table-formatting routine that prints to stdout; wrapping it ensures it is suppressed when `--silent` is active.

#### e. Replace final JSON emission

**Before** (around line 993–1001):
```js
    if (args.json) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      const json = JSON.stringify(output, null, 2);
      if (args.out) {
        fs.writeFileSync(args.out, json);
        console.log(`✅ Saved ${args.agent ? 'agent-ready' : 'raw'} JSON to ${args.out}`);
      } else {
        console.log(json);
      }
    }
```

**After:**
```js
    if (args.json || args.agent) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      AgentOutput.emit(output, { outPath: args.out, pretty: !isSilent() });
    }
```

#### f. Inject `_parserMeta` into the agent payload

Inside `transformForAgentMode()` add the `_parserMeta` block as a top-level sibling to `schemaVersion`.  
**Before:**
```js
    schemaVersion: 'agent-ready-v2.0.0',
  };
}
```
**After:**
```js
    schemaVersion: 'agent-ready-v2.0.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'adaptive-supertrend-quality',
    },
  };
}
```

#### g. Enable silent mode early in `main()`

Inside `main()` after `parseArgs()` (around line 969):

```js
  if (args.silent || args.agent) enableSilentMode(true);
```

---

### 4.2 `smart-money-concepts.cjs`

#### a. Add import

```js
const { AgentOutput, enableSilentMode, isSilent } = require('./agent-output.cjs');
```

#### b. Update `parseArgs()`

Add to the `args` object:
```js
    silent: false,
```

Add to the `for` loop:
```js
    else if (a === '--silent') args.silent = true;
```

#### c. Update `printUsage()`

Append to the usage string:
```
Options: --silent (suppress non-JSON stdout)
```

#### d. Replace logs

`smart-money-concepts.cjs` currently uses raw `console.log` / `console.warn` throughout.  
The easiest mechanical refactor is to replace the global helpers at the top of the file (just below the INPUT_MAP):

**Add after all `require` statements:**
```js
function log(...a) { AgentOutput.info(...a); }
function warnLocal(...a) { AgentOutput.warn(...a); }
```

Then in every `parseGraphicOutput` helper and every `console.log(` / `console.warn(` that is *not* error-level, replace with `log(` / `warnLocal(`.  
The `console.error` calls for actual failures should be left alone (they go to stderr).

#### e. Replace final JSON emission

**Before:**
```js
    if (args.json) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      const json = JSON.stringify(output, null, 2);
      if (args.out) { fs.writeFileSync(args.out, json); console.log(`✅ Saved to ${args.out}`); }
      else console.log(json);
    }
```

**After:**
```js
    if (args.json || args.agent) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      AgentOutput.emit(output, { outPath: args.out, pretty: !isSilent() });
    }
```

#### f. Inject `_parserMeta` into agent payload

Inside `transformForAgentMode()` (around line 500):

```js
    schemaVersion: 'agent-ready-v2.0.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'smart-money-concepts',
    },
  };
}
```

#### g. Enable silent mode in `main()`

```js
  if (args.silent || args.agent) enableSilentMode(true);
```

---

### 4.3 `precision-sniper.cjs`

This script already has a `STRICT_JSON_STDOUT` guard (`info()` / `warn()` wrappers).  
We upgrade it to use the shared module so all skills speak the same protocol.

#### a. Add import

```js
const { AgentOutput, enableSilentMode, isSilent } = require('./agent-output.cjs');
```

#### b. Replace legacy strict-log helpers

**Before:**
```js
let STRICT_JSON_STDOUT = false;
function info(...args) { if (!STRICT_JSON_STDOUT) console.log(...args); }
function warn(...args) { if (!STRICT_JSON_STDOUT) console.warn(...args); }
```

**After:**
```js
// Replaced by agent-output.cjs
```

Then globally replace `info(` → `AgentOutput.info(` and `warn(` → `AgentOutput.warn(`.

#### c. Add `silent` to CLI parser

Already partially covered by `--agent`, but add explicit `--silent`:

In `parseArgs()` defaults add:
```js
    silent: false,
```

In the loop add:
```js
    else if (a === '--silent') { args.silent = true; }
```

#### d. Replace final JSON emission

**Before** (around line 756–762):
```js
      const json = JSON.stringify(output, null, 2);
      if (args.out) { fs.writeFileSync(args.out, json); info(`✅ Saved ${args.agent ? 'agent-ready' : 'raw'} JSON to ${args.out}`); }
      else if (STRICT_JSON_STDOUT || args.agent) console.log(json);
      else console.log(json);
```

**After:**
```js
      AgentOutput.emit(output, { outPath: args.out, pretty: !isSilent() });
```

#### e. Inject `_parserMeta` into agent payload

Inside `transformForAgentMode()` (around line 576):

```js
    schemaVersion: 'agent-ready-v2.0.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'ema-confluence-sniper',
    },
  };
}
```

#### f. Enable silent mode in `main()`

```js
  if (args.silent || args.agent) enableSilentMode(true);
```

---

### 4.4 `ema-atr-pro-engine.cjs`

#### a. Add import

```js
const { AgentOutput, enableSilentMode, isSilent } = require('./agent-output.cjs');
```

#### b. Add `silent` to CLI parser

In defaults:
```js
    silent: false,
```

In loop:
```js
    else if (a === '--silent') args.silent = true;
```

#### c. Update `printUsage()`

Add `--silent` description.

#### d. Replace logs

`ema-atr-pro-engine.cjs` is the smallest script; it has only a handful of `console.log` calls.  
Wrap the decorative ones with `AgentOutput.info(...)`.

#### e. Replace final JSON emission

**Before:**
```js
    if (args.json) { const output = args.agent ? transformForAgentMode(result, args) : result; const json = JSON.stringify(output, null, 2); if (args.out) { fs.writeFileSync(args.out, json); console.log(`✅ Saved to ${args.out}`); } else console.log(json); }
```

**After:**
```js
    if (args.json || args.agent) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      AgentOutput.emit(output, { outPath: args.out, pretty: !isSilent() });
    }
```

#### f. Inject `_parserMeta` into agent payload

Inside `transformForAgentMode()` (around line 203):

```js
    schemaVersion: 'agent-ready-v2.0.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'ema-atr-structure',
    },
  };
}
```

#### g. Enable silent mode in `main()`

```js
  if (args.silent || args.agent) enableSilentMode(true);
```

---

## 5. Deterministic Consumer Parser (Python)

When consuming these scripts from Python (e.g. inside the `trading-intelligence` MCP server), the ideal flow is:

1. Spawn the process with `subprocess.run(..., capture_output=True)`.
2. Pass `--silent --agent`.
3. Scan `stdout` for the delimiters.
4. If delimiters are absent, fall back to `extractPayload()` logic.

### 5.1 Python implementation

```python
"""
tv_skill_parser.py — Deterministic parser for TradingView skill-runner stdout.
"""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

START_DELIM = "<<<AGENT_JSON_START>>>"
END_DELIM   = "<<<AGENT_JSON_END>>>"


@dataclass(frozen=True)
class SkillResult:
    raw_stdout: str
    raw_stderr: str
    payload: dict[str, Any] | None
    schema_hint: str | None        # e.g. "adaptive-supertrend-quality"
    exit_code: int
    parsed_via: str                # "delimiter" | "line" | "bracket" | "none"


def _extract_delimited(text: str) -> dict | None:
    start = text.find(START_DELIM)
    end   = text.find(END_DELIM)
    if start == -1 or end == -1 or end <= start:
        return None
    json_text = text[start + len(START_DELIM) : end].strip()
    try:
        return json.loads(json_text)
    except json.JSONDecodeError:
        return None


def _extract_by_line(text: str) -> dict | None:
    for line in text.splitlines():
        line = line.strip()
        if not line or line[0] not in "{[":
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return None


def _extract_by_brackets(text: str) -> dict | None:
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                candidate = text[start : i + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict) and len(parsed) > 2:
                        return parsed
                except json.JSONDecodeError:
                    pass
                start = -1
    return None


def extract_payload(text: str) -> tuple[dict | None, str]:
    """Return (payload, method_used)."""
    for method_name, extractor in [
        ("delimiter", _extract_delimited),
        ("line", _extract_by_line),
        ("bracket", _extract_by_brackets),
    ]:
        result = extractor(text)
        if result is not None:
            return result, method_name
    return None, "none"


def parse_meta_from_payload(payload: dict | None) -> str | None:
    """Infer which skill produced this payload."""
    if payload is None:
        return None
    # Prefer the new deterministic field
    if "_parserMeta" in payload:
        return payload["_parserMeta"].get("workflow")
    # Fallback to legacy agentContext
    if "agentContext" in payload:
        return payload["agentContext"].get("workflow")
    # Heuristic: inspect top-level keys
    keys = set(payload.keys())
    if "tqiBreakdown" in keys or "tradePlan" in keys and "regime" in keys:
        return "adaptive-supertrend-quality"
    if "bosCount" in keys or "active" in keys and "fvgCount" in keys:
        return "smart-money-concepts"
    if "grades" in keys or "emaFast" in keys:
        return "ema-confluence-sniper"
    if "trailTrend" in keys or "combinedTrend" in keys:
        return "ema-atr-structure"
    return None


def run_skill(
    script_path: Path,
    symbol: str,
    timeframe: str = "15m",
    bars: int = 500,
    extra_args: list[str] | None = None,
    timeout: int = 60,
) -> SkillResult:
    """
    Execute a skill runner deterministically.
    Always passes --silent --agent --json to guarantee clean stdout.
    """
    cmd = [
        "node",
        str(script_path),
        symbol,
        "--tf", timeframe,
        "--bars", str(bars),
        "--silent",
        "--agent",
        "--json",
    ]
    if extra_args:
        cmd.extend(extra_args)

    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    payload, parsed_via = extract_payload(proc.stdout)
    schema_hint = parse_meta_from_payload(payload)

    return SkillResult(
        raw_stdout=proc.stdout,
        raw_stderr=proc.stderr,
        payload=payload,
        schema_hint=schema_hint,
        exit_code=proc.returncode,
        parsed_via=parsed_via,
    )
```

### 5.2 Example usage

```python
from pathlib import Path
from tv_skill_parser import run_skill

scripts = Path("/Volumes/ExMac/code/tradingview/js-experiment06")

res = run_skill(
    script_path=scripts / "precision-sniper.cjs",
    symbol="BTCUSDT",
    timeframe="1h",
    bars=500,
)

print(f"Parsed via: {res.parsed_via}")
print(f"Schema hint: {res.schema_hint}")
print(f"Payload keys: {list(res.payload.keys()) if res.payload else 'None'}")

# Access domain-specific data safely
if res.schema_hint == "ema-confluence-sniper" and res.payload:
    opportunities = res.payload.get("opportunities", [])
    for opp in opportunities:
        print(f"  {opp['direction'].upper()} confidence={opp['confidence']} RR={opp['riskReward']}")
```

---

## 6. JSON Schema Quick Reference

The following table maps each skill to its **`agentContext.workflow`** value and the *distinctive* payload keys you can use for fast routing when `_parserMeta` is absent.

| Skill Script | Workflow ID | Key Diagnostic Fields |
|--------------|-------------|-----------------------|
| `self-aware-trend-system.cjs` | `adaptive-supertrend-quality` | `market.bias`, `structure.tqiBreakdown`, `tradePlan`, `opportunities[].distanceFromPrice` |
| `smart-money-concepts.cjs` | `smart-money-concepts` | `structure.bosCount`, `structure.fvgCount`, `active.obCount`, `recent.bos` |
| `precision-sniper.cjs` | `ema-confluence-sniper` | `market.htfBias`, `structure.emaFast`, `signals.grades`, `opportunities[].grade` |
| `ema-atr-pro-engine.cjs` | `ema-atr-structure` | `market.trailTrend`, `market.combinedTrend`, `signals.buy`, `signals.sellReentry` |

All four payloads share the following **mandatory** envelope keys after migration:

```ts
interface AgentPayload {
  status: "ok" | "error";
  exitCode: number;
  timestamp: string;               // ISO-8601
  execution: { durationMs: number; attempts: number };
  agentContext: {
    workflow: string;
    modelVersion: string;
    symbol: string;
    timeframe: string;
    htfTimeframe: string | null;
  };
  schemaVersion: string;           // legacy, e.g. "agent-ready-v2.0.0"
  _parserMeta: {                   // NEW in v2.1.0
    schemaVersion: "agent-ready-v2.1.0";
    emittedAt: string;
    deterministic: true;
    workflow: string;
  };
}
```

---

## 7. Rollout Checklist

- [ ] Copy `agent-output.cjs` into `/Volumes/ExMac/code/tradingview/js-experiment06/`.
- [ ] Apply the patches in §4.1 to `self-aware-trend-system.cjs`.
- [ ] Apply the patches in §4.2 to `smart-money-concepts.cjs`.
- [ ] Apply the patches in §4.3 to `precision-sniper.cjs`.
- [ ] Apply the patches in §4.4 to `ema-atr-pro-engine.cjs`.
- [ ] Add `--silent --agent --json` to every orchestrator invocation.
- [ ] Verify each script still works in human mode (no flags → table output).
- [ ] Verify `--json --silent` emits **only** the three delimited lines to stdout.
- [ ] Verify `--out /tmp/x.json --silent` writes pretty JSON to disk and emits delimited compact JSON to stdout.
- [ ] Install `tv_skill_parser.py` in the MCP server / orchestrator repo.
- [ ] Update skill documentation (SKILL.md files) to mention `--silent`.

---

## 8. Backward Compatibility Note

If an old runner (without these patches) is invoked, `tv_skill_parser.py` gracefully degrades:

1. Delimiters are absent → tries line parsing.
2. Pretty-printed multi-line JSON → falls back to bracket-depth recovery.
3. The `schema_hint` is derived from legacy `agentContext.workflow` or key heuristics.

Therefore the Python parser is **safe to deploy before all skills are patched**.

---

*End of document.*
