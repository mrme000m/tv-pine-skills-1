can # TradingView Indicator Skills — Complete Index

**Generated:** 2026-04-26  
**Total Skills:** 16  
**Verification Status:** ✅ All scripts executable and responsive

---

## Quick Reference Table

| # | Skill Name | Primary Focus | Signal Type | Presets |
|---|------------|---------------|------------|---------|
| 1 | [anchored-clusters-vp](#1-anchored-clusters-vp) | Volume Profile / POC | Cluster extremes, POC levels | ❌ |
| 2 | [buying-selling-volume](#2-buying-selling-volume) | Volume Pressure | MA crosses, Buy/Sell dominance | ✅ scalping/default/swing |
| 3 | [delta-volume-intensity](#3-delta-volume-intensity) | Trend + Momentum | Trend alerts, S/R levels | ❌ |
| 4 | [ema-atr-pro-engine](#4-ema-atr-pro-engine) | EMA + ATR Trailing | Signal activation, Trail flips | ❌ |
| 5 | [generic-indicator](#5-generic-indicator) | Universal Pine Script Runner | Any indicator output | ❌ (Pine ID required) |
| 6 | [ict-auto-validated-smc](#6-ict-auto-validated-smc) | ICT Smart Money Concepts | BOS/CHoCH, OBs, FVGs | ❌ |
| 7 | [precision-sniper](#7-precision-sniper) | EMA Confluence + Grading | A+/A/B/C grade signals | ✅ auto/scalping/swing/conservative/aggressive |
| 8 | [quantum-ribbon](#8-quantum-ribbon) | Multi-Layer EMA Ribbon | Layer crossovers, Ribbon state | ❌ |
| 9 | [self-aware-trend-system](#9-self-aware-trend-system) | Adaptive SuperTrend + TQI | BUY/SELL with TQI score | ✅ scalping/default/swing/crypto |
| 10 | [shemar-smc-confidence](#10-shemar-smc-confidence) | HMA + Supertrend + Kernel | Filtered high-confidence signals | ❌ |
| 11 | [smart-money-concepts](#11-smart-money-concepts) | LuxAlgo SMC | BOS/CHoCH, FVGs, OBs | ❌ |
| 12 | [support-resistance-breaks](#12-support-resistance-breaks) | Pivot S/R Breaks | Break intensity, S/R levels | ❌ |
| 13 | [ultra-sensitive-supertrend](#13-ultra-sensitive-supertrend) | Dual SuperTrend | Ultra Buy/Sell, ST alignment | ❌ |
| 14 | [volume-gaps-imbalances-zeiierman](#14-volume-gaps-imbalances-zeiierman) | Volume Gaps + Delta Panel | Zero-volume gaps, Delta % | ✅ scalping/default/swing |
| 15 | [xauusd-mtf-trend](#15-xauusd-mtf-trend) | Multi-Timeframe Dashboard | MTF alignment, Bias | ❌ |
| 16 | [golden-rule-strategy](#16-golden-rule-strategy) | Multi-Timeframe Momentum | 3-step filter + 4-signal checklist | ❌ |

---

## Detailed Skill Breakdown

---

### 1. Anchored Clusters Volume Profile

**Script:** `anchored-clusters-vp.cjs`  
**Pine ID:** `PUB;92974e0a3cfb481eaf058cdab9f925a3`  
**Verification:** ✅ Executable

**What It Does:**
Analyzes volume distribution using anchored volume profile clusters. Identifies Point of Control (POC) levels, cluster extremes, and volume-weighted fair value.

**Key Outputs:**
- Cluster distribution (price-by-price volume blocks)
- POC levels (Point of Control prices)
- Cluster extremes (structural boundaries)
- Volume-weighted POC (fair value reference)

**Trading Logic:**
- Clusters act as magnets — price revisits these levels
- POC = "fairest" price; retests are entry zones
- Cluster extremes = support/resistance
- Wide dispersion = trending; narrow = consolidation

**CLI Usage:**
```bash
node anchored-clusters-vp.cjs BTCUSDT --tf 15m --bars 500
node anchored-clusters-vp.cjs BTCUSDT --agent --json --out clusters.json
```

**Inputs:** `startTime`, `endTime`, `rangeColor`, `kInput`, `iters`, `rowsInput`, `vpWidth`, `vpOffset`, `showDots`, `dotSizeInput`

---

### 2. Buying Selling Volume

**Script:** `buying-selling-volume.cjs`  
**Pine ID:** `PUB;28a4da159ce246dab2cb6524c25f950f`  
**Verification:** ✅ Executable

**What It Does:**
Decomposes each bar's volume into buying vs selling pressure. Detects MA crossovers and background color transitions for trend signals.

**Key Outputs:**
- Buy/Sell volume per bar
- MA Cross signals (BULLISH_CROSS / BEARISH_CROSS)
- Volume bias (STRONGLY_BULLISH to STRONGLY_BEARISH)
- Pressure bars (recent bar-by-bar analysis)

**Trading Logic:**
- Buy > Sell volume = bullish pressure
- Background color transitions = primary trend change alerts
- Bias summarizes 20-bar directional pressure
- Divergence (price vs volume) = potential reversal

**CLI Usage:**
```bash
node buying-selling-volume.cjs BTCUSDT --preset default
node buying-selling-volume.cjs ETHUSDT --preset scalping --tf 5m
```

**Presets:** `scalping` (9,21), `default` (20,50), `swing` (50,200)  
**Inputs:** `lengthMA1`, `lengthMA2`, `maType`

---

### 3. Delta Volume Intensity

**Script:** `delta-volume-intensity.cjs`  
**Pine ID:** `PUB;bdd3bc54cf9f4dc6b42e6b2879b4eed2`  
**Verification:** ✅ Executable

**What It Does:**
Analyzes delta volume (buy vs sell pressure) to determine trend state, support/resistance levels, and ROC momentum.

**Key Outputs:**
- Trend State (UPTREND / DOWNTREND / SIDEWAYS)
- Support/Resistance levels (volume-derived)
- ROC (Rate of Change) momentum
- ATR (volatility context)
- Alert history (uptrend/downtrend/sideways alerts)

**Trading Logic:**
- UPTREND + price at support + positive ROC = long
- DOWNTREND + price at resistance + negative ROC = short
- SIDEWAYS = range trade or wait for breakout
- ATR determines stop distance and position size

**CLI Usage:**
```bash
node delta-volume-intensity.cjs BTCUSDT --tf 1h --bars 800
node delta-volume-intensity.cjs BTCUSDT --agent --json
```

**Inputs:** `length_volatility`, `length_momentum`, `lookback_sr`

---

### 4. EMA + ATR PRO Ultimate Engine

**Script:** `ema-atr-pro-engine.cjs`  
**Pine ID:** `PUB;7d5f8755ab67400899ef73a9898471e4`  
**Verification:** ✅ Executable

**What It Does:**
Combines EMA crossovers with ATR-based trailing stops. Tracks signal activation history with re-entry logic.

**Key Outputs:**
- Trail Trend (BULLISH/BEARISH based on ATR trail)
- Signal counts (buy/sell signals and reentries)
- EMA2 and EMA3 values
- Signal history with SL levels and trade durations

**Trading Logic:**
- Price above trail = bullish context
- Buy signal + bullish trail = high-confluence long
- Trail flip = potential trend change (highest conviction)
- Reentry mode = previous signal failed, reduce confidence

**CLI Usage:**
```bash
node ema-atr-pro-engine.cjs BTCUSDT --tf 15m --bars 500
node ema-atr-pro-engine.cjs BTCUSDT --agent --json --out engine.json
```

**Inputs:** `ema2Len`, `ema3Len`, `useEMA2`, `useEMA3`, `pivotLen`, `atrLen`, `atrMult`, `confirmClose`, `fastMode`, `enableReentry`

---

### 5. Generic Pine Script Indicator

**Script:** `generic-indicator.cjs`  
**Pine ID:** (Required via `--pine`)  
**Verification:** ✅ Executable

**What It Does:**
Universal runner for ANY TradingView Pine Script indicator. Auto-discovers inputs, categorizes numerical fields, detects crossovers, and extracts graphics.

**Key Outputs:**
- Numerical plots (any `plot()` output)
- Field categorization (price, oscillator, signal, volume, etc.)
- Signal detection (zero-crossings, discrete triggers)
- Crossover detection between series
- Graphic extraction (labels, lines, boxes, tables)
- Strategy backtest metrics (if available)

**Trading Logic:**
- Depends on the specific indicator being run
- `recommendation` field provides bullish/bearish/neutral/mixed
- Signal fields provide direct trade triggers
- Crossovers indicate momentum shifts

**CLI Usage:**
```bash
node generic-indicator.cjs --pine PUB;ff1a0136336340f38e908eeb12ea33aa --symbol BTCUSDT
node generic-indicator.cjs --pine USER;abc123 --symbol ETHUSDT --tf 1h --input lookback=200
```

**Required:** `--pine <PINE_ID>` (format: `PUB;...` or `USER;...`)

---

### 6. ICT Auto-Validated SMC

**Script:** `ict-auto-validated-smc.cjs`  
**Pine ID:** `PUB;789a5c79bfe9443585da09e85ece73de`  
**Verification:** ✅ Executable

**What It Does:**
Implements ICT Smart Money Concepts with auto-validation. Detects structure breaks (BOS/CHoCH), order blocks, fair value gaps, breaker blocks, and BPRs.

**Key Outputs:**
- Structure State (BULLISH/BEARISH + last break type)
- HTF Alignment check
- Order Blocks with star ratings (★)
- Fair Value Gaps (3-candle imbalances)
- Breaker Blocks (failed OBs that flip)
- Grade signals (Long/Short with star ratings)

**Trading Logic:**
- HTF alignment is the primary filter
- Trade in premium zone for shorts, discount zone for longs
- Best OBs have: liquidity sweep + displacement + HTF alignment
- FVG + OB confluence = exceptional setup
- Breaker blocks = one of ICT's strongest levels

**CLI Usage:**
```bash
node ict-auto-validated-smc.cjs BTCUSDT --tf 1h --bars 1000
node ict-auto-validated-smc.cjs BTCUSDT --agent --json --out btc-smc.json
```

**Validation Requirements:** Sweep, Displacement, HTF Check, Min Score

---

### 7. Precision Sniper

**Script:** `precision-sniper.cjs`  
**Pine ID:** `PUB;1fc29950178c42a1a88f52a18161dd53`  
**Verification:** ✅ Executable

**What It Does:**
EMA confluence system with grade-based signals (A+/A/B/C). Calculates confluence score (0-10) from EMA alignment, RSI momentum, and ADX strength.

**Key Outputs:**
- Grade Signals (A+/A/B/C with score 0-10)
- Trend State (EMA fast/slow/trend alignment)
- HTF Bias
- Trade Plan (ENTRY, SL, TP1-3)
- Confluence Score
- ADX filter (>25 preferred)

**Trading Logic:**
- Only trade A+ and A grades (highest confidence)
- HTF bias must align with signal direction
- ADX > 25 = trending, signals more reliable
- B grades acceptable with HTF alignment + ADX > 25
- C grades = avoid

**CLI Usage:**
```bash
node precision-sniper.cjs BTCUSDT --preset auto
node precision-sniper.cjs ETHUSDT --preset scalping --tf 5m
node precision-sniper.cjs BTCUSDT --preset conservative --agent
```

**Presets:** `auto`, `scalping` (5,13,34), `swing` (21,55,200), `conservative`, `aggressive`  
**Inputs:** EMA Fast/Slow/Trend, Min Score, ATR Length, SL Mult, TP1/2/3

---

### 8. Quantum Ribbon Lite

**Script:** `quantum-ribbon.cjs`  
**Pine ID:** `PUB;91e003af510345f299e5846773538206`  
**Verification:** ✅ Executable

**What It Does:**
Multi-layer EMA ribbon (5 layers) with crossover detection and momentum slope analysis.

**Key Outputs:**
- Ribbon State (strong_bull/strong_bear/bull/bear/neutral)
- Layer Analysis (5 layers, fast vs slow EMA comparison)
- Layer 5 Crossover signals (primary trend change)
- Momentum Slopes (fast and slow EMA)
- Buy/Sell/Stop/Target signals

**Trading Logic:**
- strong_bull (5/5 layers bullish) = strongest long bias
- strong_bear (5/5 layers bearish) = strongest short bias
- Layer 5 crossover = major trend shift signal
- Widening spread = strengthening trend
- Narrowing spread = weakening trend

**CLI Usage:**
```bash
node quantum-ribbon.cjs BTCUSDT --tf 15m --bars 500
node quantum-ribbon.cjs BTCUSDT --agent --json --out ribbon.json
```

**Inputs:** `i_sensitivity`, `i_stop_distance`, `i_target_rr`, `i_show_table`, `i_table_size`

---

### 9. Self-Aware Trend System [WillyAlgoTrader]

**Script:** `self-aware-trend-system.cjs`  
**Pine ID:** `PUB;0f80bcf05d544d4c98fde06faab1c976`  
**Verification:** ✅ Executable

**What It Does:**
Adaptive SuperTrend system with Trend Quality Index (TQI). Uses asymmetric bands, character-flip detection, and efficiency-weighted ATR.

**Key Outputs:**
- Trend State (bullish/bearish/neutral) + TQI quality
- TQI Breakdown (Efficiency, Volatility, Structure, Momentum Persist)
- Trade Signals (BUY/SELL with scores 0-30)
- Trade Plan (ENTRY, SL, TP1-3 with live R-multiples)
- Performance Stats (Win Rate, Avg R, Drawdown, Regime Edge)

**Trading Logic:**
- Trade only when TQI quality is "moderate" or "high"
- Low TQI (<0.35) = choppy market, stay out
- BUY/SELL score ≥20 = high-quality signal
- Dynamic TP scaling based on trend quality
- Regime-aware position sizing

**CLI Usage:**
```bash
node self-aware-trend-system.cjs BTCUSDT --preset default
node self-aware-trend-system.cjs ETHUSDT --preset scalping --tf 5m
node self-aware-trend-system.cjs BTCUSDT --agent --json
```

**Presets:** `default`, `scalping`, `swing`, `crypto`  
**Inputs:** ATR Length, Base Band Width, Quality Strength, Quality Curve, Char-Flip settings

---

### 10. SHEMAR HMA ST + SMC Confidence Filter

**Script:** `shemar-smc-confidence.cjs`  
**Pine ID:** `PUB;70f6e4e05f9c439c9d1f8fe26019357e`  
**Verification:** ✅ Executable

**What It Does:**
Combines HMA (Hull Moving Average), Supertrend, and Kernel regression for multi-indicator convergence. Filters raw signals for high-confidence setups.

**Key Outputs:**
- Alignment State (FULLY_ALIGNED_BULLISH/FULLY_ALIGNED_BEARISH/MIXED)
- Indicator States (HMA, Supertrend, Kernel positions)
- Signal Counts (raw vs filtered buy/sell)
- Close Signals (exit signals)
- Squeeze momentum detection

**Trading Logic:**
- Only trade when FULLY_ALIGNED
- Only trade FilteredBuy/FilteredSell (highest probability)
- Raw signals alone = insufficient confirmation
- Kernel crossing HMA = potential early trend change
- MIXED alignment = no trade

**CLI Usage:**
```bash
node shemar-smc-confidence.cjs BTCUSDT --tf 15m --bars 500
node shemar-smc-confidence.cjs BTCUSDT --agent --json
```

**Inputs:** `hmaLength`, `atrPeriod`, `factor`, `enableShorts`, `useStopEntry`, `htfPeriod`, `sqzLength`, `kernelPeriod`, `confidenceThresh`

---

### 11. Smart Money Concepts [LuxAlgo]

**Script:** `smart-money-concepts.cjs`  
**Pine ID:** `PUB;6daafb2cabe6419d98ae25229d2327f8`  
**Verification:** ✅ Executable

**What It Does:**
Institutional-grade SMC analysis. Detects BOS/CHoCH (Break of Structure/Change of Character), Fair Value Gaps, Order Blocks, and Equal Highs/Lows.

**Key Outputs:**
- Structure Events (BOS/CHoCH with bullish/bearish direction)
- Fair Value Gaps (bullish/bearish, mitigated or active)
- Order Blocks (internal/swing, bullish/bearish)
- Equal Highs/Lows (liquidity pools)
- Swing Bias (STRONGLY_BULLISH to NEUTRAL)
- Pre-scored signals with confidence levels

**Trading Logic:**
- Latest BOS/CHoCH determines structural bias
- Active FVGs near price = best entry zones
- Active OBs in direction of bias = confirmation
- EQH/EQL = liquidity targets
- Multi-timeframe analysis recommended (1H + 4H)

**CLI Usage:**
```bash
node smart-money-concepts.cjs BTCUSDT --tf 1h --bars 800
node smart-money-concepts.cjs BTCUSDT --agent --json --out smc.json
```

**Enhanced Features:** `enhanced.signals[]` (pre-scored), `narrative` (auto-generated prose), `agenticScore` (0-1 reusability)

---

### 12. Support and Resistance Breaks

**Script:** `support-resistance-breaks.cjs`  
**Pine ID:** `PUB;NXS6SoOdr880Hrvh9vA36UcAjC14bOkc`  
**Verification:** ✅ Executable

**What It Does:**
Detects pivot-based support/resistance level breaks. Measures break intensity and identifies price position relative to key structural levels.

**Key Outputs:**
- Break Counts (total, support breaks, resistance breaks)
- Break Intensity (frequency of breaks)
- Current S/R Levels (active support and resistance prices)
- Price Position (ABOVE_RESISTANCE/BELOW_SUPPORT/BETWEEN_LEVELS)
- Distance to Levels

**Trading Logic:**
- ABOVE_RESISTANCE = long bias, resistance now support
- BELOW_SUPPORT = short bias, support now resistance
- BETWEEN_LEVELS = range-bound, trade the range or wait
- High break intensity (>5%) = volatile, many opportunities
- Low intensity (<2%) = calm, cleaner setups

**CLI Usage:**
```bash
node support-resistance-breaks.cjs BTCUSDT --tf 15m --bars 500
node support-resistance-breaks.cjs BTCUSDT --agent --json
```

**Inputs:** `pivotLookback`, `pivotStrength`, `showSupport`, `showResistance`, `showBreaks`, `breakIntensity`

---

### 13. Ultra Sensitive SuperTrend

**Script:** `ultra-sensitive-supertrend.cjs`  
**Pine ID:** `PUB;fc33f2d98699414a8585923116dbd959`  
**Verification:** ✅ Executable

**What It Does:**
Uses dual SuperTrend calculations for double confirmation. Detects ultra signals for early reversal detection.

**Key Outputs:**
- Combined Trend (BULLISH/BEARISH/MIXED from dual ST alignment)
- Alignment Status (whether ST1 and ST2 agree)
- Signal Counts (buy, sell, ultraBuy, ultraSell)
- Signal History (timestamps of last signals)
- Background Trend (additional filter)

**Trading Logic:**
- BULLISH + aligned = long bias, highest confidence
- BEARISH + aligned = short bias, highest confidence
- MIXED = no trade, STs disagree
- UltraBuy/UltraSell = strongest early reversal signals
- Ultra signals in alignment = highest conviction

**CLI Usage:**
```bash
node ultra-sensitive-supertrend.cjs BTCUSDT --tf 15m --bars 500
node ultra-sensitive-supertrend.cjs BTCUSDT --agent --json
```

**Inputs:** `atrPeriod1`, `multiplier1`, `atrPeriod2`, `multiplier2`, `useHeikenAshi`, `showLabels`, `showBG`

---

### 14. Volume Gaps & Imbalances (Zeiierman)

**Script:** `volume-gaps-imbalances-zeiierman.cjs`  
**Pine ID:** `PUB;Q7YQQq7g-Volume-Gaps-Imbalances-Zeiierman`  
**Verification:** ✅ Executable

**What It Does:**
Builds price-by-price volume profile with zero-volume gaps (structural voids). Includes delta panel for sector-based buy/sell pressure analysis.

**Key Outputs:**
- Zero-Volume Gaps (structural voids where no liquidity traded)
- Bull/Bear Volume Profile (per-price-row dominance)
- Delta Panel (sector-based buy/sell pressure %)
- Largest gap location and size
- Profile rows (bullish/bearish control at each level)

**Trading Logic:**
- Gaps are structural voids that attract revisits
- Price retracing INTO gap = potential reversal/entry
- Price trading THROUGH gap cleanly = continuation
- Delta > +10% = bullish flow dominates
- Delta < -10% = bearish flow dominates
- Wait for rejection candlestick + delta shift

**CLI Usage:**
```bash
node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --preset default
node volume-gaps-imbalances-zeiierman.cjs ETHUSDT --preset scalping --tf 5m
node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --agent --json
```

**Presets:** `default` (200 lookback, 50 rows), `scalping` (100, 30), `swing` (1000, 150)  
**Inputs:** `lookback`, `rows`, `source`, `summarySections`, `summaryWidth`

**Video Reference:** [How Banks Trade via Volume Gap Strategy](https://www.youtube.com/watch?v=cmJY6o4ymp4)  
**Optimized Settings (from video):** lookback=100, rows=20

---

### 15. XAUUSD MTF Trend Dashboard

**Script:** `xauusd-mtf-trend.cjs`  
**Pine ID:** `PUB;d1ad30c0261f49f297357f8aa2a7854a`  
**Verification:** ✅ Executable

**What It Does:**
Multi-timeframe trend dashboard analyzing 6 timeframes simultaneously (1m, 5m, 15m, 1h, 4h, 1D). Calculates overall bias from weighted agreement.

**Key Outputs:**
- MTF Entries (trend readings per timeframe from dashboard table)
- Overall Bias (STRONGLY_BULLISH to NEUTRAL)
- Trend Labels (bull/bear annotations)
- Levels (horizontal S/R lines)
- Timeframe agreement count

**Trading Logic:**
- Higher TFs (1h, 4h, 1D) = macro direction
- Lower TFs (1m, 5m, 15m) = entry timing
- All TFs aligned = highest conviction
- Higher TFs aligned + lower TFs turning = best entry
- Mixed across all TFs = chop, avoid
- Counter-trend (lower TFs vs higher TFs) = low probability

**CLI Usage:**
```bash
node xauusd-mtf-trend.cjs XAUUSD --tf 15m --bars 500
node xauusd-mtf-trend.cjs BTCUSDT --agent --json
```

**Inputs:** `show_M15`, `show_M30`, `show_H1`, `show_H4`, `show_D1`, `fastLength`, `slowLength`, `rsiLength`, `macdFastLength`, `bbLength`, `dmiLength`, `sarStartValue`

---

## Common Features Across All Skills

### CLI Options (Standard)
| Option | Description |
|--------|-------------|
| `--tf <timeframe>` | Chart timeframe (1m, 5m, 15m, 1h, 4h, 1D) |
| `--bars <n>` | Historical bars to analyze (default: 500) |
| `--input key=value` | Override Pine script inputs |
| `--json` | Output raw JSON instead of formatted table |
| `--agent` | Agent mode (simplified JSON for AI workflows) |
| `--out <file>` | Write output to file |
| `--verbose, -v` | Verbose output for debugging |
| `--dry-run` | Skip TradingView connection, show parsed args |
| `--help, -h` | Show help message |

### Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Critical error (missing credentials, connection failed) |
| 2 | No data |
| 3 | Timeout / cancelled |
| 4 | Validation error |

### Environment Requirements
- **Node.js:** v18+
- **TradingView Credentials:** SESSION + SIGNATURE in `.env` file
- **WebSocket Client:** `tv.cjs` in project root
- **Network:** Active internet connection to TradingView

---

### 16. Golden Rule Strategy

**Script:** `golden-rule-strategy.cjs`  
**Pine ID:** `PUB;6daafb2cabe6419d98ae25229d2327f8` (SMC by LuxAlgo)  
**Verification:** ✅ Executable

**What It Does:**
Automates the Golden Rule Strategy — a disciplined, probability-based trading framework. Runs SMC on Weekly, Daily, and 4-Hour timeframes, computes RSI(14), Stochastic(21,5,5), and MACD from 4H price data locally, then applies the 3-Step Filter + 4-Signal Checklist. Outputs a PASS/FAIL verdict with suggested SL/TP derived from SMC Order Blocks and Fair Value Gaps.

**Key Outputs:**
- 3-Step Filter verdict (Weekly → Daily → 4H alignment)
- 4-Signal Checklist (SMC Green, RSI Crossover, Stochastic Crossover, MACD Histogram)
- Alignment score (0–100)
- Auto-computed SL/TP from nearest OBs/FVGs
- Danger zone warnings

**Trading Logic:**
- **PASS** (90–100): All 6 checks pass → High-probability setup
- **PENDING** (60–89): Timeframes aligned, signals incomplete → Wait
- **FAIL** (< 60): Misalignment → No trade

**The Golden Rule:** Never trade against the weekly momentum.

---

## Skill Selection Guide

### By Trading Style
| Style | Recommended Skills |
|-------|-------------------|
| **Scalping** | precision-sniper (scalping), volume-gaps-imbalances-zeiierman (scalping), buying-selling-volume (scalping) |
| **Intraday** | precision-sniper (auto), self-aware-trend-system (default), quantum-ribbon, ema-atr-pro-engine |
| **Swing** | precision-sniper (swing), self-aware-trend-system (swing), volume-gaps-imbalances-zeiierman (swing), delta-volume-intensity |
| **ICT/SMC** | ict-auto-validated-smc, smart-money-concepts, shemar-smc-confidence |

### By Analysis Type
| Analysis Type | Skills |
|--------------|-------|
| **Volume Analysis** | anchored-clusters-vp, buying-selling-volume, delta-volume-intensity, volume-gaps-imbalances-zeiierman |
| **Trend Following** | quantum-ribbon, ema-atr-pro-engine, self-aware-trend-system, ultra-sensitive-supertrend |
| **SMC/ICT** | ict-auto-validated-smc, smart-money-concepts, shemar-smc-confidence |
| **Multi-Timeframe** | xauusd-mtf-trend, golden-rule-strategy, precision-sniper (HTF bias), ict-auto-validated-smc (HTF check) |
| **Support/Resistance** | support-resistance-breaks, anchored-clusters-vp, smart-money-concepts |
| **Generic/Any Indicator** | generic-indicator |

### By Signal Confidence Mechanism
| Mechanism | Skills |
|-----------|-------|
| **Grade/Score Based** | precision-sniper (A+/A/B/C), self-aware-trend-system (TQI 0-1, score 0-30) |
| **Alignment Based** | shemar-smc-confidence (FULLY_ALIGNED), ultra-sensitive-supertrend (BULLISH/BEARISH/MIXED), quantum-ribbon (5-layer) |
| **Structure Based** | ict-auto-validated-smc (BOS/CHoCH), smart-money-concepts (BOS/CHoCH), support-resistance-breaks, golden-rule-strategy (SMC + 4-signal) |
| **Volume Based** | buying-selling-volume (MA crosses), delta-volume-intensity (trend alerts), volume-gaps-imbalances-zeiierman (gaps + delta) |

---

## Verification Summary

✅ **All 16 skills verified executable** — each `.cjs` script responds to `--help` and shows proper usage information.

| Skill | Script | Help Output | Status |
|-------|--------|-------------|--------|
| anchored-clusters-vp | anchored-clusters-vp.cjs | ✅ | Verified |
| buying-selling-volume | buying-selling-volume.cjs | ✅ | Verified |
| delta-volume-intensity | delta-volume-intensity.cjs | ✅ | Verified |
| ema-atr-pro-engine | ema-atr-pro-engine.cjs | ✅ | Verified |
| generic-indicator | generic-indicator.cjs | ✅ | Verified |
| ict-auto-validated-smc | ict-auto-validated-smc.cjs | ✅ | Verified |
| precision-sniper | precision-sniper.cjs | ✅ | Verified |
| quantum-ribbon | quantum-ribbon.cjs | ✅ | Verified |
| self-aware-trend-system | self-aware-trend-system.cjs | ✅ | Verified |
| shemar-smc-confidence | shemar-smc-confidence.cjs | ✅ | Verified |
| smart-money-concepts | smart-money-concepts.cjs | ✅ | Verified |
| support-resistance-breaks | support-resistance-breaks.cjs | ✅ | Verified |
| ultra-sensitive-supertrend | ultra-sensitive-supertrend.cjs | ✅ | Verified |
| volume-gaps-imbalances-zeiierman | volume-gaps-imbalances-zeiierman.cjs | ✅ | Verified |
| xauusd-mtf-trend | xauusd-mtf-trend.cjs | ✅ | Verified |
| golden-rule-strategy | golden-rule-strategy.cjs | ✅ | Verified |

---

## Files in This Project

### Root Directory Scripts (.cjs)
- `anchored-clusters-vp.cjs`
- `buying-selling-volume.cjs`
- `delta-volume-intensity.cjs`
- `ema-atr-pro-engine.cjs`
- `generic-indicator.cjs`
- `ict-auto-validated-smc.cjs`
- `precision-sniper.cjs`
- `quantum-ribbon.cjs`
- `self-aware-trend-system.cjs`
- `shemar-smc-confidence.cjs`
- `smart-money-concepts.cjs`
- `support-resistance-breaks.cjs`
- `ultra-sensitive-supertrend.cjs`
- `volume-gaps-imbalances-zeiierman.cjs`
- `xauusd-mtf-trend.cjs`
- `golden-rule-strategy.cjs`
- `tv.cjs` (WebSocket client dependency)
- `tv-optimized.cjs`
- `agent-output.cjs`
- `benchmark.cjs`
- `validate-agent-schema.cjs`

### Skill Documentation (SKILL.md)
Each skill has a dedicated directory with `SKILL.md` and optional preset JSON files.

### Preset Configurations
- `buying-selling-volume/` — `default.json`, `scalping.json`, `swing.json`
- `precision-sniper/` — `aggressive.json`, `auto.json`, `conservative.json`, `crypto.json`, `default.json`, `scalping.json`, `swing.json`
- `self-aware-trend-system/` — `auto.json`, `crypto.json`, `default.json`, `scalping.json`, `swing.json`
- `volume-gaps-imbalances-zeiierman/` — `default.json`, `scalping.json`, `swing.json`, `references/`

---

**End of Index**
