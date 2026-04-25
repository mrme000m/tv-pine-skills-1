# TradingView Skills Audit Report — XAUUSD Market Analysis

**Date:** 2026-04-25  
**Symbol Tested:** XAUUSD (Gold)  
**Timeframe:** 1H  
**Baseline:** cTrader MTF Analysis (M15 / H1 / H4 / D1)

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Skills Evaluated | 15 |
| Successful Runs | 13 / 15 |
| Failed Runs | 2 / 15 (anchored-clusters-vp required manual inputs; generic-indicator had auth/quoting bugs) |
| Avg Execution Time | ~48 seconds |
| Signals Generated | 10 opportunities across skills |
| Bias Consensus | **Bearish** (8 bearish / short signals vs 3 bullish / long) |
| cTrader MTF Bias | Bearish on all timeframes |

**Key Finding:** The skills generally converge with the external cTrader MTF baseline (bearish), but signal quality, granularity, and UX vary dramatically. Some skills are production-ready; others require workarounds or produce misleading confidence scores.

---

## 2. Cross-Skill Signal Matrix

| Skill | Direction | Confidence | Confluence Score | Key Entry Zone | Notes |
|---|---|---|---|---|---|
| **anchored-clusters-vp** | Long | HIGH | 0.75 | Cluster low ~4355 | Needs explicit `startTime`/`endTime` inputs |
| **buying-selling-volume** | Neutral | — | 0.4 | — | No clear signal; 16 neutral bars |
| **delta-volume-intensity** | Short | HIGH | 0.55 | Trend-following | DOWNTREND confirmed, momentum neutral |
| **ema-atr-pro-engine** | Mixed | — | 0.6 | — | 13 buy / 12 sell signals; no clear bias |
| **ict-auto-validated-smc** | Neutral | — | 0.65 | — | Bearish current TF vs Bullish HTF conflict |
| **precision-sniper** | Long | LOW | 0.5 | 4726.44 | Grade A+ but `htfAligned: false`, market neutral |
| **quantum-ribbon** | Short | STRONG | 0.85 | Ribbon cross 80 bars ago | 5/5 layers bearish |
| **self-aware-trend-system** | Long | LOW | 0.34 | 4706.87 | BUY 27/30 but TQI = 0.15 (low quality) |
| **shemar-smc-confidence** | Long | STRONG | 0.85 | — | BULL kernel + squeeze release; HTF NOT aligned |
| **smart-money-concepts** | Neutral | — | 0.65 | — | 198 BOS / 202 CHoCH; no FVGs detected |
| **support-resistance-breaks** | Short | HIGH | 0.0 | — | Break detected but `confluenceScore: 0` |
| **ultra-sensitive-supertrend** | Short | HIGH | 0.7 | — | Both STs bearish |
| **volume-gaps-imbalances-zeiierman** | Short | STRONG | 0.99 | 4888.04 (gap reject) | 6 opportunities, highest score in suite |
| **xauusd-mtf-trend** | Neutral | — | 0.6 | — | STRONGLY_BEARISH but says "wait for alignment" |
| **generic-indicator** | N/A | N/A | N/A | — | Failed: `study_not_auth` + quoting bug |

---

## 3. Per-Skill Deep Dive

### 3.1 anchored-clusters-vp ⭐⭐⭐⭐
**Usefulness:** Very high for structural volume analysis. VW-POC at 4682.82, cluster extremes at 4355.63 provide clear S/R references.  
**UX Issue:** ❌ **Critical** — fails on default run with timeout error. Requires manual `--input startTime=... --input endTime=...` which is not discoverable from `--help`.  
**Bug:** The default `startTime`/`endTime` in the Pine script do not overlap with current chart data, causing a silent timeout.  
**Improvement:**
- Auto-calculate `startTime`/`endTime` from `--bars` and current time if not provided.
- Fall back to chart default range rather than hardcoded Pine defaults.
- Add clearer error message: "Indicator requires explicit time range. Use --input startTime=..."

---

### 3.2 buying-selling-volume ⭐⭐
**Usefulness:** Low signal density. Output shows 4 buy bars, 0 sell bars, 16 neutral bars — market indecision. No actionable opportunities generated.  
**UX Issue:** Background color transitions (the main signal mechanism) are lost in text output. The "MA cross detection" described in SKILL.md is not surfaced in agent output.  
**Bug:** `confluenceScore: 0.4` with `agenticScore: 0.4` — correctly flags low quality, but the narrative says "Wait for dominant volume pressure" which is too vague.  
**Improvement:**
- Expose the MA cross history in the JSON output.
- Add a "dominance threshold" config so users can tune when neutral bars are filtered.
- Surface background-color state per bar.

---

### 3.3 delta-volume-intensity ⭐⭐⭐⭐
**Usefulness:** High. Correctly identifies DOWNTREND (13 down vs 0 up bars). Provides S/R levels and ATR context.  
**UX:** Good. Clear trend classification, warnings are contextual ("Momentum neutral despite trend bias").  
**Bug:** The `entryZone` is missing from the opportunity despite a HIGH-confidence SHORT signal. `confluenceScore: 0.55` feels slightly low for a 13-bar downtrend.  
**Improvement:**
- Include explicit entry/stop/target prices.
- Normalize confluence scoring across skills (0.55 here vs 0.85 for quantum-ribbon with less dramatic evidence).

---

### 3.4 ema-atr-pro-engine ⭐⭐⭐
**Usefulness:** Moderate. Shows 13 buy / 12 sell signals and 185 buy / 184 sell labels over 600 bars — essentially market noise.  
**UX Issue:** Narrative says "No active signal" but does not explain *why* the trail trend is UNKNOWN. The user has to infer EMA filter disagreement.  
**Bug:** `UNKNOWN` trail trend is unhelpful. The skill should at least report the dominant side when signals are nearly equal.  
**Improvement:**
- Add a `netBias` field: `+1 buy` or `neutral-with-bullish-skew`.
- Report current EMA levels for manual reference.
- Add `lastSignal` field (timestamp + direction) so it's clear what to wait for.

---

### 3.5 ict-auto-validated-smc ⭐⭐⭐⭐
**Usefulness:** High for SMC traders. Detects bearish BOS with bullish HTF misalignment. 1 OB, 1 breaker, 2 FVGs detected.  
**UX:** Good structural context. Warning "Counter-trend alignment — reduce size or avoid" is excellent risk guidance.  
**Bug:** No `opportunities` generated despite structural zones. The skill states "Look for OB + FVG confluence" but doesn't tell the user *which* OB and *which* FVG to watch.  
**Improvement:**
- Auto-generate confluence opportunities when OB and FVG overlap.
- Include price levels for each zone in the `opportunities` array.
- Add a `nearestZone` field with distance to current price.

---

### 3.6 precision-sniper ⭐⭐⭐
**Usefulness:** Moderate. Detected 288 grades (A+, A, B, C) but only returned top 5. The active long at 4726.44 has `htfAligned: false` and market is neutral — lower reliability.  
**UX Issue:** Entry zone min/max are provided, but the current price (4709.75) is *below* the entry zone. The signal is stale unless price re-enters. This is not flagged.  
**Bug:** `agenticScore: 0.5` despite an A+ grade feels inconsistent. The scoring should weight `htfAligned` more heavily (it drops to 0.1 when false).  
**Improvement:**
- Flag stale signals: "Price has moved away from entry zone by X pips."
- Weight HTF alignment into grade display (e.g., "A+ (unconfirmed by HTF)").
- Add `signalAgeBars` to show recency.

---

### 3.7 quantum-ribbon ⭐⭐⭐⭐
**Usefulness:** High for trend-following. 5/5 layers bearish with a strong confluence score (0.85).  
**UX:** Clean and decisive. "Status: WAITING" tells the user not to enter immediately.  
**Bug:** No entry/stop/target prices. The opportunity says "short" but doesn't say *where* or at what price.  
**Improvement:**
- Derive entry from the nearest EMA layer or last crossover price.
- Add `layers` summary in opportunity: which layer is closest to price (acting as dynamic S/R).

---

### 3.8 self-aware-trend-system ⭐⭐⭐⭐
**Usefulness:** Very high data richness. Provides TQI breakdown, regime classification, performance stats, and a full trade plan.  
**UX Issue:** BUY 27/30 score with LOW confidence (0.34) is confusing. The signal score contradicts the confidence.  
**Bug:** TQI = 0.15 (low) correctly triggers warnings, but `agenticScore: 0.75` is too high for a low-quality trend.  
**Improvement:**
- Add a `signalQuality` field that composites TQI + regime + score so users get one clear metric.
- Ensure `agenticScore` and confidence are algorithmically coupled (e.g., TQI < 0.3 should cap agenticScore at 0.5).

---

### 3.9 shemar-smc-confidence ⭐⭐⭐⭐⭐
**Usefulness:** Excellent. 6 raw buys, 10 raw sells, 6/10 filtered signals. Kernel BULL + squeeze release is a strong setup.  
**UX:** Best-in-class confidence transparency: "Confidence: 0.8" and explicit `squeeze` state.  
**Bug:** `htfAligned: false` with a STRONG confidence signal. This is a *feature* (the confidence is based on kernel/squeeze) but could be dangerous if users ignore HTF.  
**Improvement:**
- Add a `riskLabel` field: e.g., "High-probability counter-trend".
- Track squeeze duration (how many bars in squeeze) to grade release strength.

---

### 3.10 smart-money-concepts ⭐⭐⭐
**Usefulness:** Moderate. 198 BOS / 202 CHoCH events suggest a choppy, ranging market. 0 FVGs and 0 EQH/EQL means fewer actionable zones.  
**UX Issue:** 4 active OBs are listed but no price levels are exported in the agent output. "Wait for clear structure bias" is vague.  
**Bug:** `agenticScore: 0.65` seems high given zero FVGs and neutral bias.  
**Improvement:**
- Export OB price levels in the agent JSON.
- Add a `choppinessScore` derived from BOS/CHoCH ratio near 1:1.
- Remove zero-count categories from output (e.g., hide FVG section if count=0).

---

### 3.11 support-resistance-breaks ⭐⭐⭐
**Usefulness:** Low in this test. Only 1 break event with `confluenceScore: 0` in the opportunity.  
**UX Issue:** The opportunity reports "HIGH" confidence but `confluenceScore: 0`. These contradict.  
**Bug:** `max=1, avg=1` for break intensity on 500 bars means virtually no breaks. Either the pivot length is too long or the market is too quiet for this indicator on XAUUSD 1H.  
**Improvement:**
- Add a `breakQuality` filter: suppress opportunities if confluenceScore < 0.3.
- Expose the detected S/R levels so users can see *what* broke.
- Recommend a tighter pivot lookback for faster markets.

---

### 3.12 ultra-sensitive-supertrend ⭐⭐⭐⭐
**Usefulness:** Good for trend confirmation. Both STs aligned bearish.  
**UX:** Clean, minimal output. Good for quick checks.  
**Bug:** No entry zone. The narrative says "Bearish dual ST alignment" but doesn't say where to short or where the stop is.  
**Improvement:**
- Export ST1 and ST2 line values in the output (they are the natural stop-loss levels).
- Add `distanceToFlip` showing how far price must move to turn bullish.

---

### 3.13 volume-gaps-imbalances-zeiierman ⭐⭐⭐⭐⭐
**Usefulness:** Best in class. 6 detailed opportunities, gap measurements, profile bias (34 bear rows vs 10 bull), and structural void sizes.  
**UX:** Excellent. Clear entry zones, optimal entries, stop losses, take profits, and gap-based rationale.  
**Bug:** The top gap recommendation is at 4888.04 (SHORT rejection), but price is at 4709.75 — ~178 pips away. The skill does not warn that this is a *limit* setup, not a market order.  
**Improvement:**
- Add `distanceFromPrice` and `setupType` (market / limit / stop) to every opportunity.
- Rank opportunities by proximity to current price, not just gap size.
- Include a "price is already inside gap" flag for immediate-action setups.

---

### 3.14 xauusd-mtf-trend ⭐⭐⭐
**Usefulness:** Specific to XAUUSD (per skill name) but works on any symbol. Shows STRONGLY_BEARISH bias.  
**UX Issue:** Only 2 MTF entries found on 1000 bars. The dashboard has limited graphics extraction.  
**Bug:** Says "STRONGLY_BEARISH" but recommendation is "Wait for MTF alignment" — which itself is contradictory. If it's strongly bearish, why wait?  
**Improvement:**
- Increase bar count default for MTF indicators (1000 may only cover ~40 days on 1H).
- Add a `tradeable` boolean: true if lower TFs agree with higher TFs.
- Rename skill or generalize (it already works on any symbol).

---

### 3.15 generic-indicator ⭐⭐
**Usefulness:** Potentially the most powerful skill (universal runner), but currently broken for most users.  
**UX Issues:**
- Shell quoting bug: `PUB;...` with semicolons breaks in bash unless quoted.
- `--symbol` and `--tf` are silently overridden when using certain Pine IDs.
- Error `study_not_auth` is cryptic; users can't tell if the Pine ID is wrong, private, or auth expired.
**Bug:**
- Script ignores CLI params when parsing fails, falling back to BTCUSDT/15m defaults.
- No validation of Pine ID format before sending to TradingView.
**Improvement:**
- Enforce shell-safe usage examples: `--pine 'PUB;...'` with quotes.
- Validate Pine ID format regex: `^(PUB|USER);[a-f0-9]{32}$`.
- Surface a curated list of "known working public Pine IDs" in the SKILL.md.
- Retry with `version=last` fallback if `study_not_auth` occurs.

---

## 4. Architecture & Common Issues

### 4.1 Execution Speed
- **Average:** ~48s per skill (15 skills ≈ 12 min sequential, 4 min parallel)
- **Bottleneck:** TradingView indicator execution via `tv.cjs` is inherently slow.
- **Recommendation:** Do not run all skills in one shell command unless parallel. Consider implementing a `--batch` flag or a meta-runner script.

### 4.2 JSON Output Quality
- ✅ **Good:** Most skills output valid `agent-ready-v2` schema.
- ✅ **Good:** `narrative` + `opportunities` + `conformance` triad is consistent.
- ⚠️ **Inconsistent:** `confluenceScore` ranges and meanings vary between skills (0.0–0.99, sometimes normalized, sometimes raw).
- ❌ **Missing:** No common `signalAge`, `distanceFromPrice`, `setupType` fields.

### 4.3 Signal Staleness
- Several skills (precision-sniper, volume-gaps-imbalances) generate signals at prices far from current market.
- **Risk:** A user could blindly enter a "LONG A+" signal at 4726 when price is 4709 without realizing it's stale.
- **Fix:** Every skill should compute `|signalPrice - currentPrice|` and warn if > ATR × 0.5.

### 4.4 HTF Alignment Halos
- Many skills check HTF alignment (precision-sniper, ict-auto-validated-smc, shemar-smc-confidence) but the HTF result is often contradictory or `false`.
- **Problem:** cTrader MTF shows *all* timeframes bearish, yet several TV skills report Bullish HTF bias. This suggests the HTF parameter inside the TV indicator may not match cTrader's (e.g., 4H vs daily).
- **Fix:** Document which HTF each skill uses. Allow `--htf` override.

### 4.5 cTrader vs TradingView Divergence
| Source | H1 Bias | H4 Bias | D1 Bias |
|---|---|---|---|
| cTrader | Bearish | Bearish | Bearish |
| delta-volume-intensity | Short | — | — |
| quantum-ribbon | Short | — | — |
| volume-gaps | Short | — | — |
| ultra-supertrend | Short | — | — |
| precision-sniper | Long (A+) | Bullish HTF | — |
| self-aware-trend | Long (BUY) | — | — |
| shemar-smc | Long | — | — |

**Observation:** 50/50 split between bearish momentum/trend-following indicators and bullish mean-reversion/confluence indicators. This is normal (different indicator logic), but users need a **meta-confluence** score across skills.

---

## 5. Recommendations (Priority Order)

### 🔴 Critical (Fix Immediately)
1. **anchored-clusters-vp:** Auto-compute `startTime`/`endTime`. Currently unusable without reading error logs.
2. **generic-indicator:** Fix shell-quoting documentation and Pine ID validation. Add `Pine ID looks invalid` pre-check.
3. **Signal Staleness Guard:** Add `distanceFromPrice` + `isStale` flag to ALL opportunity objects.
4. **HTF Alignment Transparency:** Always document which HTF was queried and expose it in the JSON.

### 🟡 High (Improves UX Significantly)
5. **precision-sniper / shemar / self-aware:** Cap confidence when HTF is misaligned or signal is stale.
6. **volume-gaps-imbalances:** Rank by proximity, not gap size alone.
7. **smart-money-concepts:** Export OB price levels in agent output.
8. **quantum-ribbon / ultra-supertrend:** Export indicator line values (they are natural stops).
9. **support-resistance-breaks:** Suppress low-confluence breaks or flag them clearly.
10. **buying-selling-volume:** Expose MA cross state; currently invisible in JSON.

### 🟢 Medium (Nice-to-Have)
11. **Meta-Skill:** Create a `tradingview-confluence.cjs` that runs all skills and produces a composite score (like cTrader's `confluence` field).
12. **Async Batch Runner:** A single command like `node run-all-skills.cjs XAUUSD --parallel` that aggregates all 15 outputs into one JSON.
13. **Config Preset Documentation:** Add `README.md` in each skill dir explaining when to use `scalping.json` vs `swing.json`.
14. **Emoji Banner Toggle:** Add `--quiet` flag to suppress 📊 banners; important for piping / automation.

---

## 6. TL;DR for Trading

**Current XAUUSD 1H Consensus (from this test):**
- **Direction:** Bearish on trend/momentum indicators (quantum ribbon, delta volume, ultra ST, volume gaps).
- **Caution:** Counter-trend long signals exist (shemar, precision-sniper, self-aware) but are unconfirmed by HTF and often stale.
- **Highest Confidence Setup:** SHORT rejection at gap 4877–4891 (volume-gaps skill) with dual-supertrend bearish confirmation.
- **Risk:** Multiple bullish signals are below current price and lack HTF alignment — likely noise in a downtrend.
- **cTrader Validation:** Fully bearish across M15/H1/H4/D1 — the bearish TV signals are more aligned with market reality right now.

**Recommendation:** Wait for price to approach 4877–4891 gap zone for a short entry, or look for a break below 4664 (cTrader support) with volume confirmation.


---

## 7. Fixes Applied (Post-Audit)

### 7.1 Confidence Scoring Fixes
Fixed binary/confidence-scale bugs in 6 scripts where `confluenceScore` could be low but confidence was still reported as `HIGH` or `STRONG`:

| Script | Before | After |
|--------|--------|-------|
| **delta-volume-intensity** | `STRONG`/`HIGH` only | 4-tier: STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW |
| **quantum-ribbon** | `STRONG`/`HIGH` only | 4-tier: STRONG≥0.80, HIGH≥0.65, MED≥0.50, LOW |
| **shemar-smc-confidence** | `STRONG`/`HIGH` only | 4-tier: STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW |
| **buying-selling-volume** | `STRONG`/`HIGH` only | 4-tier: STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW |
| **support-resistance-breaks** | `STRONG`/`HIGH` only (even at 0.0!) | 4-tier: STRONG≥0.80, HIGH≥0.50, MED≥0.30, LOW |
| **xauusd-mtf-trend** | `STRONG`/`HIGH` only | 4-tier: STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW |
| **anchored-clusters-vp** | `HIGH`/`MED` only | 4-tier: STRONG≥0.80, HIGH≥0.60, MED≥0.40, LOW |

Scripts already with correct 4-tier scoring: **self-aware-trend-system**, **ema-atr-pro-engine**, **precision-sniper**, **ict-auto-validated-smc**.

### 7.2 Signal Staleness Guard (`distanceFromPrice` + `isStale`)
Added to **all 14 core scripts**. Every `opportunities[]` object now includes:

```json
{
  "distanceFromPrice": 12.34,
  "isStale": false
}
```

- **Entry-based signals** (precision-sniper, self-aware-trend-system, ict-auto-validated-smc, volume-gaps-imbalances-zeiierman): `distanceFromPrice` = absolute distance from `optimalEntry` to current price. `isStale` = true if distance > 0.5% of current price.
- **Break-based signals** (support-resistance-breaks): `distanceFromPrice` = distance from break price to current price. Same 0.5% stale threshold.
- **Directional/trend signals** (all others): `distanceFromPrice: null`, `isStale: false` — these are real-time bias indicators, not specific entry orders.

### 7.3 HTF Alignment Transparency
Added `htfTimeframe` field to `agentContext` in **all 14 scripts**:

| Script | `htfTimeframe` Value | Meaning |
|--------|----------------------|---------|
| **xauusd-mtf-trend** | `M15,M30,H1,H4,D1` | Explicitly queries 5 timeframes |
| **precision-sniper** | `auto` or user input | Configurable via `htfInput` |
| **ict-auto-validated-smc** | `240` | Fixed 4H HTF |
| **shemar-smc-confidence** | `inferred-same-tf` | HTF inferred from kernel+BOS on same TF |
| **smart-money-concepts** | `null` or FVG-specific | Only FVGs can use separate TF |
| **All others** | `null` | Single timeframe only |

This directly addresses the audit finding that cTrader MTF showed all bearish while some TV skills reported bullish HTF — the discrepancy is now explicitly documented in every JSON output.

### 7.4 anchored-clusters-vp Auto-Time
- Auto-computes `startTime`/`endTime` from `--bars` when not provided via `--input`
- Timeout error now includes actionable suggestion: `"Try: --input startTime=... --input endTime=..."`
- Uses `Object.values()` for graphic accessors (objects keyed by ID, not arrays)

### 7.5 smart-money-concepts Graphic Parser Fix
- Replaced hardcoded color string filters with `_colorToHex()` helper
- Uses width-based heuristics + text fallback for FVG/OB detection
- Fixed field name mismatches (`l.text`→`l.t`, `l.color`→`l.ci`, `b.color`→`b.c`)

### 7.6 Remaining Open Items
| # | Issue | Status |
|---|-------|--------|
| 1 | Meta-confluence runner (`tradingview-confluence.cjs`) | Not started |
| 2 | Async batch runner (`run-all-skills.cjs`) | Not started |
| 3 | generic-indicator shell quoting + auth | Lower priority |
| 4 | Confluence score normalization (0.0–0.99 rubric varies) | Partial — confidence tiers now consistent |
| 5 | quantum-ribbon / ultra-supertrend: export line values as stops | Not started |
| 6 | buying-selling-volume: expose MA cross state in JSON | Not started |

