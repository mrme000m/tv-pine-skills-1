---
name: agent-ready-improvements
description: Recommendations to make the indicator script more useful for agentic flows
type: reference
---

# Agent-Ready Improvements for Volume Gaps Script

## Current State Analysis

### ✅ What Works Well
- JSON output mode (`--json` flag)
- Structured parsing into `{summary, profile, gaps, delta, meta}`
- Error handling with retry logic
- Metadata timestamp tracking

### ⚠️ Gaps for Agent Consumption

1. **No Validation Schema**
   - No JSON Schema to validate output structure
   - No status codes (success/failure) on exit
   - No machine-readable success indicator

2. **Ambiguous Error Messages**
   - Generic "Fatal error" without actionable details
   - No retry guidance in CLI output
   - No severity levels (info/warning/error/critical)

3. **Limited Error Codes**
   - Process exit code always 0 or 1 (binary)
   - No PEP 257-style exception codes
   - No structured error objects in JSON mode

4. **Missing "Agent" Context**
   - No `--agent-mode` flag for simplified output
   - No configuration mode
   - No output targeting (stdout vs file with format)

5. **Testing / Validation Outputs**
   - No dry-run mode
   - No validation after data extraction
   - No conformance checks

---

## Recommended Enhancements

### 1. Exit Code Expansion

Current: `process.exit(0)` or `process.exit(1)`

Proposed exit codes:
```
0 = success (normal run)
1 = critical error (missing credentials, connection failed)
2 = no data (empty profile, no gaps)
3 = user cancelled/timeout
4 = validation error (invalid inputs)
```

### 2. JSON Schema Validation

Add `--validate` flag to output:
```json
{
  "status": "success",
  "validated": true,
  "schema": "agent-ready-v1.schema.json",
  "errors": [],
  "warnings": ["warning1", "warning2"]
}
```

### 3. Status JSON Profile

Unified status object for all outputs:
```json
{
  "status": "ok|error|partial|timeout",
  "exitCode": 0,
  "timestamp": "2026-04-25T10:30:00Z",
  "execution": {
    "durationMs": 2341,
    "attempts": 1,
    "offline": false
  },
  "metadata": { ... },
  "result": { ... }
}
```

### 4. Enhanced Error Output

Add `--verbose` flag for detailed error context:
```
❌ Error: SESSION/SIGNATURE missing
   Usage: Run from volume-gaps-imbalances-zeiierman/ directory with .env configured
   Suggestion: Check /Volumes/ExMac/code/tradingview/js-experiment06/volume-gaps-imbalances-zeiierman/.env
   
   stack trace: ... (the first 5 lines)
```

### 5. Agent Mode Flag (`--agent`)

Simplified CLI output optimized for ingestion:
- No markdown table formatting
- Only critical data (gaps with confidence scores)
- Compact output legible by humans too (but optimized for agents)

```bash
node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --agent
# Output:
# {"symbol":"BTCUSDT","status":"ok","bias":"bullish","gaps":[{"priceBottom":75000,"priceTop":75500,"height":500,"confidence":0.85}],"delta":{"avgDelta":12.5,"dominantFlow":"buy"},...}
```

### 6. Input Validation

Add CLI-level validation with helpful messages:
```
⚠️  Warning: lookback value of 500 exceeds recommended threshold of 200 for key timeframe
   This may impact performance. Continue? [Y/n]
```

### 7. Standardized Metadata

Always include these fields in all outputs (JSON/markdown):
```json
{
  "agentContext": {
    "input": { "symbol": "BTCUSDT", "tf": "15m", "lookback": 200 },
    "workflow": "trend-following-gap-rejection",
    "modelVersion": "v1.2.3"
  }
}
```

### 8. Confidence Scoring

Compute confidence scores for trading signals:
```json
{
  "signals": [
    {
      "type": "long_rejection",
      "entryPrice": 75250,
      "stopLoss": 75000,
      "takeProfit1": 75750,
      "takeProfit2": 76200,
      "confidenceScore": 0.82,
      "confluences": {
        "delta": 0.18,
        "profile": 0.75,
        "gapShape": 0.90
      },
      "recommendation": "HIGH"
    }
  ]
}
```

### 9. Dry Run Mode (`--dry-run`)

Preview what the script will do without full execution:
```
Dry-run mode (--dry-run)
  Symbol: BTCUSDT
  Timeframe: 15m
  Cached preset: default (200 lookback, 50 rows)
  Connecting to TradingView: SESSION required
  Estimated execution time: ~2.4s
  ⏭️  Skipping actual execution
```

### 10. Agent Configuration File

Add `.agentrc.json` for agent-specific tuning:
```json
{
  "defaultOutputFormat": "json",
  "includeConfidenceScores": true,
  "minGapHeightForSignal": 10,
  "deltaDominanceThreshold": 0.10,
  "profileBullBearRatio": 0.15
}
```

---

## Implementation Priority

### High Priority (Critical for Agents)
1. Exit code expansion (encodes success/failure)
2. Status object in JSON (machine-readable status)
3. Error severity/level (acts/feedback)

### Medium Priority (Nice to Have)
4. Agent mode flag (simplified output)
5. Confidence scoring (AI can use these scores)
6. Enhanced metadata

### Low Priority (Polish)
7. Input validation
8. Dry-run mode
9. Agent configuration file

---

## Example Output Comparison

### Current (Friendly)
```
══════════════════════════════════════════════════════════════════════
  VOLUME GAPS & IMBALANCES — ANALYSIS RESULTS
══════════════════════════════════════════════════════════════════════

📊 SUMMARY
   Status:          ok
   Bias:            BEARISH
```

### Agent-Ready
```json
{
  "status": "ok",
  "exitCode": 0,
  "timestamp": "2026-04-25T10:30:15Z",
  "result": {
    "summary": {
      "bias": "bearish",
      "dominantFlow": "neutral",
      "lastPrice": 76450.25
    },
    ...,
    "recommendations": [
      {
        "type": "short_rejection",
        "entry": { "zone": "76771-77058" },
        "stopLoss": "77100",
        "takeProfitNext": "76020",
        "confidence": 0.82,
        "agenticScore": 0.87
      }
    ]
  },
  "audit": {
    "validation.passed": true,
    "resolution.time_warning": false
  }
}
```

---

## Questions for Refinement

1. Should we add LLM-friendly output (like chain-of-thought reasoning)?
2. Should we support streaming output for long-running queries?
3. Should we add webhook hooks for agent orchestration?
4. Should we support GraphQL-style query language for output?
5. Should we add performance/heavyweight query queuing?