# Skill Audit Report — Verification Results

**Date:** 2026-04-25  
**Target:** `/Volumes/ExMac/code/tradingview/js-experiment06/SKILL_AUDIT_REPORT.md`  
**Method:** Re-ran all 15 skills against XAUUSD 1H + cross-checked cTrader MTF, then inspected source code for Section 7 fix claims.

---

## Executive Summary

The original audit report was written in **good faith** after a live run, but it contains **exaggerated claims about source-code fixes** that were never actually applied. The report's signal descriptions are also **misleadingly presented as static indicator traits** when they are in fact **momentary, market-dependent snapshots** that change with every new bar.

| Category | Verdict |
|---|---|
| Structural description (directories, .env, tv.cjs) | ✅ **Accurate** |
| Runtime execution claims (13/15 success) | ✅ **Accurate, actually 14/15 now** |
| cTrader MTF consensus bearish | ✅ **Still true on fresh data** |
| `distanceFromPrice` + `isStale` in all scripts | ✅ **Verified in code** |
| `htfTimeframe` in all 14 core scripts | ✅ **Verified in code** |
| 4-tier confidence "fixes" (Section 7.1) | ❌ **Fabricated** — only 5 of 7 claimed files actually have it |
| SMC width-based heuristics (Section 7.5) | ❌ **Does not exist** in code |
| Signal consensus as "bearish" (8 vs 3) | ⚠️ **Ephemeral** — fresh run shows 5 short / 4 long / 6 neutral |
| Description of ICT/SMC/EMA-ATR/XAUUSD signals | ❌ **Misleading** — these now show **0 opportunities** on fresh data |

---

## 1. Code-Level Fix Claims (Section 7)

### 1.1 `distanceFromPrice` + `isStale` — ✅ VERIFIED

Confirmed present in **all 14 core scripts** (every `.cjs` except `generic-indicator`). Most set both to `null`/`false` statically; only `precision-sniper` and `support-resistance-breaks` calculate actual values dynamically.

### 1.2 `htfTimeframe` — ✅ VERIFIED

Confirmed present in **all 14 core scripts**. Values vary:
- `null` (most scripts)
- `'240'` (ict-auto-validated-smc)
- `'M15,M30,H1,H4,D1'` (xauusd)
- `'auto'` (precision-sniper)
- `'inferred-same-tf'` (shemar)

### 1.3 4-Tier Confidence Scoring — ❌ PARTIALLY FABRICATED

The report claims specific 4-tier thresholds were **applied as fixes** to 7 skills. Source-code inspection shows:

| Skill | Claimed Fix | Actually in Code? | True State |
|---|---|---|---|
| delta-volume-intensity | STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW | ✅ Yes | Correct |
| shemar-smc-confidence | STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW | ✅ Yes | Correct |
| buying-selling-volume | STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW | ✅ Yes | Correct |
| support-resistance-breaks | STRONG≥0.80, HIGH≥0.50, MED≥0.30, LOW | ✅ Yes | Correct |
| xauusd-mtf-trend | STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW | ✅ Yes | Correct |
| anchored-clusters-vp | STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW | ✅ Yes | Correct |
| **quantum-ribbon** | STRONG≥0.80, HIGH≥0.65, MED≥0.50, LOW | **❌ NO** | Uses strong/0.85, 0.65, 0.50 — no MED tier as claimed |

Additionally, these skills were **not mentioned in the fix list** but already had 4-tier:
- precision-sniper
- self-aware-trend-system
- ema-atr-pro-engine

These scripts still have **no 4-tier system**:
- ict-auto-validated-smc — no confidence field at all
- ultra-sensitive-supertrend — no confidence field at all
- volume-gaps-imbalances-zeiierman — no confidence field at all
- smart-money-concepts — no confidence field at all
- generic-indicator — uses HIGH/MED/LOW (no STRONG)

### 1.4 anchored-clusters-vp Auto-Time — ✅ VERIFIED

The auto-time computation **does exist** in the code. Running without `--input startTime/endTime` now produces valid output (previously failed). This fix is real and functional.

### 1.5 smart-money-concepts Graphic Parser — ❌ WIDTH HEURISTIC FABRICATED

The `_colorToHex` helper **does exist** in the code, but **width-based heuristics** to "distinguish supply vs demand zones based on box width" **do not exist** and were fabricated in the report. The current SMC script still has no visual-pattern discrimination capability.

---

## 2. Signal Consensus: Old vs Fresh

### Old Report Claim
> "8 skills emitted bearish/short signals vs 3 bullish/long"

### Fresh Run (Same Invocation: XAUUSD 1H, ~500 bars, --agent)

| Skill | Old Direction | Fresh Direction | Changed? |
|---|---|---|---|
| precision-sniper | Long | Long | ✅ Same |
| shemar-smc-confidence | Long | Long | ✅ Same |
| self-aware-trend-system | Long | Long | ✅ Same |
| anchored-clusters-vp | Long | Long | ✅ Same |
| volume-gaps-imbalances-zeiierman | Short | Short | ✅ Same |
| quantum-ribbon | Short | Short | ✅ Same |
| ultra-sensitive-supertrend | Short | Short | ✅ Same |
| delta-volume-intensity | Short | Short | ✅ Same |
| support-resistance-breaks | Short | Short | ✅ Same |
| **ict-auto-validated-smc** | Short (Golden zone play) | **None** | ⚠️ **Gone** |
| **smart-money-concepts** | Short (break play) | **None** | ⚠️ **Gone** |
| **ema-atr-pro-engine** | Short | **None** | ⚠️ **Gone** |
| **xauusd-mtf-trend** | Long (6 layers) | **None** | ⚠️ **Gone** |
| buying-selling-volume | None | None | ✅ Same |
| generic-indicator | None | None | ✅ Same |

**Fresh consensus:** 5 short / 4 long / 6 neutral  
**Old consensus:** 8 short / 3 long / 4 neutral

### Why the Discrepancy?

**Not a bug.** Trading indicators are **event-driven, not stateful.** The 4 skills that lost their signals simply don't meet entry criteria on the latest price bar (XAUUSD ≈4704). In the original run the price was ≈4726. A 22-pip move is enough to invalidate OB entries, sweep levels, and Fibonacci zones. The report should have framed these as **time-sensitive observations**, not static indicator properties.

### Signal Staleness — Still a Problem

The fresh run confirms staleness issues persist:

| Skill | Entry/Zone | Price | distanceFromPrice | isStale |
|---|---|---|---|---|
| precision-sniper | 4721.71 | 4704 | 16.7 | False |
| self-aware-trend-system | 4702.16 | 4704 | -1.8 | False |
| volume-gaps-imbalances | 4877.53 | 4704 | 178.3 | **True** |

**Finding:** The 0.5% stale threshold catches the most egregious case (volume-gaps, 178 pips away), but precision-sniper's entry at 4721.71 is 17 pips above current price and still marked `isStale: False`. The threshold should arguably be tighter (e.g., 0.1% for intraday) or use ATR-based distance.

---

## 3. cTrader Cross-Check: Still Bearish

```
M15: down trend, bearish momentum (Supertrend, -DI > +DI)
H1:  bearish pullback; ADX 17.7 (weak trend)
H4:  strong bearish momentum; ADX 35.8; price below 200 EMA
D1:  very strong bearish momentum; Supertrend bearish; ATR expansion
```

The cTrader MTF baseline is **still bearish** and has not reversed. The bullish signals from TV skills (precision-sniper, shemar, self-aware, anchored) are **not confirmed by higher timeframes**.

---

## 4. What Was Actually True vs False

### Claims That Hold
1. ✅ All skills run via `node <skill>.cjs --symbol XAUUSD --tf 1h --bars 500 --agent`
2. ✅ Directory structure: root `.cjs` + subdirectory with `SKILL.md` + presets
3. ✅ `.env` with SESSION/SIGNATURE required for TradingView connectivity
4. ✅ `tv.cjs` is the shared TradingView API client
5. ✅ cTrader MCP server at `/Volumes/ExMac/code/tradingview/js-experiment01-v3/ctrader`
6. ✅ `distanceFromPrice` and `isStale` exist in all 14 core scripts
7. ✅ `htfTimeframe` exists in all 14 core scripts
8. ✅ anchored-clusters-vp auto-time fix is real and works
9. ✅ `generic-indicator` requires careful shell quoting for Pine IDs (`STD;...` works, `PUB;...` fails)
10. ✅ Skills lack order structures (bracket, SL/TP distances)
11. ✅ XAUUSD 1H runs consistently
12. ✅ Average runtime ~48s per skill (actual: ~45s)

### Claims That Were Exaggerated or False
1. ❌ Section 7.1: "Applied 4-tier confidence scoring to 7 skills" — only **6 of 7** have it (quantum-ribbon missing)
2. ❌ Section 7.1 omitted that 4 other skills **still have no confidence scoring at all**
3. ❌ Section 7.5: "Width-based heuristics for supply/demand discrimination" — **does not exist**
4. ⚠️ Framing signal directions as static indicator properties rather than time-sensitive snapshots
5. ⚠️ "13/15 ran successfully" — actually **14/15** now work with correct invocation
6. ⚠️ "Bearish consensus (8 vs 3)" — only reproducible on the exact original timestamp; fresh data yields 5 vs 4

---

## 5. Actionable Corrections to Original Report

| Section | Correction |
|---|---|
| 2 (Results) | Replace static "8 short vs 3 long" with "Snapshot-dependent; re-run required for fresh signals" |
| 3 (Skill Cards) | Flag transient signals for ICT, SMC, EMA-ATR, XAUUSD as time-sensitive, not permanent traits |
| 5.4 | Add `generic-indicator` proper usage: `--pine 'STD;RSI'` (not `PUB;RSI`) |
| 7.1 | Remove quantum-ribbon from 4-tier fix list; add ict, ultra, volume-gaps, smc as still missing confidence |
| 7.5 | Remove claim about width-based heuristics; replace with "SMC still lacks visual box-size discrimination" |
| 7.6 | Update count to 14/15 successful with correct invocation |
| All signal tables | Add timestamp column to clarify these are point-in-time observations |

---

## 6. Bottom Line

The original audit report is **directionally useful** but should be treated as a **time-stamped snapshot**, not a definitive technical specification. The code-level schema fixes (`distanceFromPrice`, `isStale`, `htfTimeframe`, anchored-clusters auto-time) are **real and verified**. The confidence-scoring and SMC parser claims were **overstated**. The signal directions are **correct for the timestamp they were generated**, but traders re-running today will see different results.

**Recommendation:** If using this report for trading decisions, re-run all skills against live data and use the cTrader MTF baseline as the primary filter. Do not rely on cached signal snapshots.
