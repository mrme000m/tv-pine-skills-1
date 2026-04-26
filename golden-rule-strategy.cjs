#!/usr/bin/env node
/**
 * Golden Rule Strategy — Standalone Runner
 * ==========================================
 * Implements the 3-Step Filter + 4-Signal Checklist:
 *   1. Weekly Anchor  → primary trend (no trades against weekly momentum)
 *   2. Daily Filter   → swing window confirmation
 *   3. 4-Hour Trigger → execution lens with 4-signal checklist
 *
 * 4-Signal Checklist (4H only):
 *   [✓] SMC Color Candles (Green)  → bullish CHoCH / BOS structure
 *   [✓] RSI Crossover              → RSI(14) above its signal SMA(9)
 *   [✓] Stochastic Crossover       → K(21,5) above D(5)
 *   [✓] MACD Histogram (Green)     → MACD histogram > 0
 *
 * Outputs: PASS / FAIL verdict, suggested SL/TP from SMC OBs/FVGs
 *
 * Usage:
 *   node golden-rule-strategy.cjs BTCUSDT
 *   node golden-rule-strategy.cjs ETHUSDT --json --out grs.json
 *   node golden-rule-strategy.cjs SOLUSDT --agent
 */

const fs = require('fs');
const path = require('path');
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env') });
const tv = require('./tv-optimized.cjs');
const { AgentOutput, enableSilentMode, isSilent } = require('./agent-output.cjs');

const PINE_ID = 'PUB;6daafb2cabe6419d98ae25229d2327f8';
const SCRIPT_NAME = 'Golden Rule Strategy';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

// ─────────────────────────────────────────────────────────────────────────────
// CLI ARGUMENTS
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    _symbol: argv[0]?.toUpperCase() || null,
    symbol: 'BTCUSDT',
    bars: 500,
    json: false,
    out: null,
    agent: false,
    verbose: false,
    dryRun: false,
    silent: false,
    inputs: {},
  };
  let start = 0;
  if (args._symbol && !args._symbol.startsWith('-')) { args.symbol = args._symbol; start = 1; }
  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) args.symbol = argv[++i].toUpperCase();
    else if (a === '--bars' && argv[i + 1]) args.bars = parseInt(argv[++i]);
    else if (a === '--input' && argv[i + 1]) { const [k, v] = argv[++i].split('='); if (k) args.inputs[k] = v; }
    else if (a === '--json') args.json = true;
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--agent') { args.json = true; args.agent = true; }
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--silent') args.silent = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printUsage() {
  console.log(`
Golden Rule Strategy — Multi-Timeframe High-Probability Runner
Usage: node golden-rule-strategy.cjs <SYMBOL> [options]
Options: --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --silent, --help

Description:
  Runs SMC (Smart Money Concepts) on Weekly → Daily → 4H timeframes.
  Computes RSI, Stochastic, MACD from 4H price data locally.
  Applies the Golden Rule 3-step filter + 4-signal checklist.
  Outputs PASS/FAIL verdict with SL/TP suggestions from nearest OBs/FVGs.
`);
}

function normalizeTf(tf) {
  const t = String(tf || '15').trim().toLowerCase();
  if (/^\d+$/.test(t)) return t;
  if (/^[dwm]$/.test(t)) return t.toUpperCase();
  const m = t.match(/^(\d+)m$/); if (m) return m[1];
  const h = t.match(/^(\d+)h$/); if (h) return String(Number(h[1]) * 60);
  if (t === '1d') return '1D'; if (t === '1w') return '1W';
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function _round(val, d = 2) {
  return typeof val === 'number' ? Math.round(val * 10 ** d) / 10 ** d : val;
}
function _coerce(val, type) {
  const s = String(val);
  if (type === 'bool') return s.toLowerCase() === 'true' || s === '1';
  if (type === 'int') return parseInt(s, 10);
  if (type === 'float') return parseFloat(s);
  return val;
}
function _toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function _extractPeriodClose(period) {
  if (!period || typeof period !== 'object') return null;
  return _toNumber(period.close ?? period.c ?? period.Close ?? period.cl);
}
function _extractPeriodTime(period) {
  if (!period || typeof period !== 'object') return null;
  return _toNumber(period.time ?? period.t ?? period.ts ?? period.timestamp);
}
function _resolveLatestClose(periods) {
  if (!Array.isArray(periods) || periods.length === 0) return { close: null, time: null };
  let latestByTime = null;
  for (const p of periods) {
    const close = _extractPeriodClose(p);
    const time = _extractPeriodTime(p);
    if (close == null) continue;
    if (time == null) { if (!latestByTime) latestByTime = { close, time: null }; continue; }
    if (!latestByTime || latestByTime.time == null || time > latestByTime.time) {
      latestByTime = { close, time };
    }
  }
  return latestByTime || { close: null, time: null };
}
function _normalizeLineStyle(style) {
  const s = String(style || '').toLowerCase();
  if (s === 'dsh' || s === 'dashed') return 'dashed';
  if (s === 'sol' || s === 'solid') return 'solid';
  if (s === 'dot' || s === 'dotted') return 'dotted';
  return s || null;
}
function _inferLabelDirection(label) {
  const st = String(label?.st || '').toLowerCase();
  if (st === 'lup') return { isBullish: true, isBearish: false, hasExplicitDirection: true };
  if (st === 'ldn') return { isBullish: false, isBearish: true, hasExplicitDirection: true };
  return { isBullish: false, isBearish: false, hasExplicitDirection: false };
}
function _findStructureLineForLabel(label, lines) {
  const lx = _toNumber(label?.x);
  const ly = _toNumber(label?.y);
  if (lx == null || ly == null) return null;
  const EPS = 1e-4;
  for (const ln of lines || []) {
    const y1 = _toNumber(ln?.y1);
    const x1 = _toNumber(ln?.x1);
    const x2 = _toNumber(ln?.x2);
    if (y1 == null || x1 == null || x2 == null) continue;
    if (Math.abs(y1 - ly) > EPS) continue;
    const minX = Math.min(x1, x2) - 1;
    const maxX = Math.max(x1, x2) + 1;
    if (lx >= minX && lx <= maxX) return ln;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMC INPUT MAP
// ─────────────────────────────────────────────────────────────────────────────
const INPUT_MAP = [
  { variable: 'modeInput', tvInputId: 'in_0', type: 'string', default: 'HISTORICAL' },
  { variable: 'styleInput', tvInputId: 'in_1', type: 'string', default: 'COLORED' },
  { variable: 'showTrendInput', tvInputId: 'in_2', type: 'bool', default: false },
  { variable: 'showInternalsInput', tvInputId: 'in_3', type: 'bool', default: true },
  { variable: 'showInternalBullInput', tvInputId: 'in_4', type: 'string', default: 'ALL' },
  { variable: 'internalBullColorInput', tvInputId: 'in_5', type: 'string', default: 'GREEN' },
  { variable: 'showInternalBearInput', tvInputId: 'in_6', type: 'string', default: 'ALL' },
  { variable: 'internalBearColorInput', tvInputId: 'in_7', type: 'string', default: 'RED' },
  { variable: 'internalFilterConfluenceInput', tvInputId: 'in_8', type: 'bool', default: false },
  { variable: 'internalStructureSize', tvInputId: 'in_9', type: 'string', default: 'TINY' },
  { variable: 'showStructureInput', tvInputId: 'in_10', type: 'bool', default: true },
  { variable: 'showSwingBullInput', tvInputId: 'in_11', type: 'string', default: 'ALL' },
  { variable: 'swingBullColorInput', tvInputId: 'in_12', type: 'string', default: 'GREEN' },
  { variable: 'showSwingBearInput', tvInputId: 'in_13', type: 'string', default: 'ALL' },
  { variable: 'swingBearColorInput', tvInputId: 'in_14', type: 'string', default: 'RED' },
  { variable: 'swingStructureSize', tvInputId: 'in_15', type: 'string', default: 'SMALL' },
  { variable: 'showSwingsInput', tvInputId: 'in_16', type: 'bool', default: false },
  { variable: 'swingsLengthInput', tvInputId: 'in_17', type: 'int', default: 50 },
  { variable: 'showHighLowSwingsInput', tvInputId: 'in_18', type: 'bool', default: true },
  { variable: 'showInternalOrderBlocksInput', tvInputId: 'in_19', type: 'bool', default: true },
  { variable: 'internalOrderBlocksSizeInput', tvInputId: 'in_20', type: 'int', default: 5 },
  { variable: 'showSwingOrderBlocksInput', tvInputId: 'in_21', type: 'bool', default: false },
  { variable: 'swingOrderBlocksSizeInput', tvInputId: 'in_22', type: 'int', default: 5 },
  { variable: 'orderBlockFilterInput', tvInputId: 'in_23', type: 'string', default: 'Atr' },
  { variable: 'orderBlockMitigationInput', tvInputId: 'in_24', type: 'string', default: 'HIGHLOW' },
  { variable: 'internalBullishOrderBlockColor', tvInputId: 'in_25', type: 'color', default: 'color.new(#3179f5, 80)' },
  { variable: 'internalBearishOrderBlockColor', tvInputId: 'in_26', type: 'color', default: 'color.new(#f77c80, 80)' },
  { variable: 'swingBullishOrderBlockColor', tvInputId: 'in_27', type: 'color', default: 'color.new(#1848cc, 80)' },
  { variable: 'swingBearishOrderBlockColor', tvInputId: 'in_28', type: 'color', default: 'color.new(#b22833, 80)' },
  { variable: 'showEqualHighsLowsInput', tvInputId: 'in_29', type: 'bool', default: true },
  { variable: 'equalHighsLowsLengthInput', tvInputId: 'in_30', type: 'int', default: 3 },
  { variable: 'equalHighsLowsThresholdInput', tvInputId: 'in_31', type: 'float', default: 0.1 },
  { variable: 'equalHighsLowsSizeInput', tvInputId: 'in_32', type: 'string', default: 'TINY' },
  { variable: 'showFairValueGapsInput', tvInputId: 'in_33', type: 'bool', default: true },
  { variable: 'fairValueGapsThresholdInput', tvInputId: 'in_34', type: 'bool', default: true },
  { variable: 'fairValueGapsTimeframeInput', tvInputId: 'in_35', type: 'timeframe', default: '' },
  { variable: 'fairValueGapsBullColorInput', tvInputId: 'in_36', type: 'color', default: 'color.new(#00ff68, 70)' },
  { variable: 'fairValueGapsBearColorInput', tvInputId: 'in_37', type: 'color', default: 'color.new(#ff0008, 70)' },
  { variable: 'fairValueGapsExtendInput', tvInputId: 'in_38', type: 'int', default: 1 },
  { variable: 'showDailyLevelsInput', tvInputId: 'in_39', type: 'bool', default: false },
  { variable: 'dailyLevelsStyleInput', tvInputId: 'in_40', type: 'string', default: 'SOLID' },
  { variable: 'dailyLevelsColorInput', tvInputId: 'in_41', type: 'string', default: 'BLUE' },
  { variable: 'showWeeklyLevelsInput', tvInputId: 'in_42', type: 'bool', default: false },
  { variable: 'weeklyLevelsStyleInput', tvInputId: 'in_43', type: 'string', default: 'SOLID' },
  { variable: 'weeklyLevelsColorInput', tvInputId: 'in_44', type: 'string', default: 'BLUE' },
  { variable: 'showMonthlyLevelsInput', tvInputId: 'in_45', type: 'bool', default: false },
  { variable: 'monthlyLevelsStyleInput', tvInputId: 'in_46', type: 'string', default: 'SOLID' },
  { variable: 'monthlyLevelsColorInput', tvInputId: 'in_47', type: 'string', default: 'BLUE' },
  { variable: 'showPremiumDiscountZonesInput', tvInputId: 'in_48', type: 'bool', default: false },
  { variable: 'premiumZoneColorInput', tvInputId: 'in_49', type: 'color', default: 'RED' },
  { variable: 'equilibriumZoneColorInput', tvInputId: 'in_50', type: 'color', default: 'GRAY' },
  { variable: 'discountZoneColorInput', tvInputId: 'in_51', type: 'color', default: 'GREEN' }
];

const DEFAULT_INPUT_OVERRIDES = {
  showFairValueGapsInput: true,
  styleInput: 'Colored',
  showInternalOrderBlocksInput: true,
  showStructureInput: true,
};

function applyInputs(indicator, inputs) {
  const userInputs = inputs || {};
  const mergedInputs = { ...DEFAULT_INPUT_OVERRIDES, ...userInputs };
  if (Object.keys(mergedInputs).length === 0) return;
  AgentOutput.info('📝 Applying SMC input configuration...');
  for (const [key, value] of Object.entries(mergedInputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) { AgentOutput.warn(`   ⚠️  Unknown input: ${key}`); continue; }
    try {
      const tvInputDef = indicator.inputs[mapping.tvInputId];
      if (!tvInputDef) { AgentOutput.warn(`   ⚠️  Input ${key} not in indicator`); continue; }
      const typed = _coerce(value, mapping.type);
      indicator.setOption(mapping.tvInputId, typed);
      AgentOutput.info(`   ✅ ${key} → ${mapping.tvInputId}: ${JSON.stringify(typed)} (${tvInputDef.type})`);
    } catch (e) {
      AgentOutput.warn(`   ⚠️  ${key} failed: ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMC GRAPHIC PARSER (adapted from smart-money-concepts.cjs)
// ─────────────────────────────────────────────────────────────────────────────
function parseSMCGraphic(rawData, timeframe, chartPeriods) {
  const graphic = rawData?.graphic || {};
  const boxes = Object.values(graphic.dwgBoxes ?? graphic.boxes ?? graphic.dwgboxes ?? {});
  const labels = Object.values(graphic.dwgLabels ?? graphic.labels ?? graphic.dwglabels ?? {});
  const lines = Object.values(graphic.dwgLines ?? graphic.lines ?? graphic.dwglines ?? {});

  const rawBOS = labels.filter(l => /bos/i.test(String(l.t))).sort((a, b) => (a.x || 0) - (b.x || 0));
  const bosLabels = rawBOS.map((l, i) => {
    const matchedLine = _findStructureLineForLabel(l, lines);
    const lineStyle = _normalizeLineStyle(matchedLine?.st);
    const scope = lineStyle === 'dashed' ? 'internal' : lineStyle === 'solid' ? 'swing' : null;
    const inferred = _inferLabelDirection(l);
    const prev = i > 0 ? rawBOS[i - 1] : null;
    const yDir = prev ? (l.y > prev.y ? 'up' : l.y < prev.y ? 'down' : 'flat') : 'unknown';
    const isBullish = inferred.hasExplicitDirection ? inferred.isBullish : yDir === 'up';
    const isBearish = inferred.hasExplicitDirection ? inferred.isBearish : yDir === 'down';
    return { text: l.t, x: l.x, y: l.y, color: l.ci, type: 'BOS', isBullish, isBearish, scope, lineStyle, time: l.time };
  });

  const rawCHoCH = labels.filter(l => /choch|choc/i.test(String(l.t))).sort((a, b) => (a.x || 0) - (b.x || 0));
  const chochLabels = rawCHoCH.map((l, i) => {
    const matchedLine = _findStructureLineForLabel(l, lines);
    const lineStyle = _normalizeLineStyle(matchedLine?.st);
    const scope = lineStyle === 'dashed' ? 'internal' : lineStyle === 'solid' ? 'swing' : null;
    const inferred = _inferLabelDirection(l);
    const prev = i > 0 ? rawCHoCH[i - 1] : null;
    const yDir = prev ? (l.y > prev.y ? 'up' : l.y < prev.y ? 'down' : 'flat') : 'unknown';
    const isBullish = inferred.hasExplicitDirection ? inferred.isBullish : yDir === 'up';
    const isBearish = inferred.hasExplicitDirection ? inferred.isBearish : yDir === 'down';
    return { text: l.t, x: l.x, y: l.y, color: l.ci, type: 'CHoCH', isBullish, isBearish, scope, lineStyle, time: l.time };
  });

  const fvgBoxes = boxes.filter(b => /fvg/i.test(String(b.t)) || (b.x2 !== undefined && b.x1 !== undefined && Math.abs(b.x2 - b.x1) <= 2 && b.t !== '•')).map(b => ({
    top: Math.max(b.y1||0, b.y2||0), bottom: Math.min(b.y1||0, b.y2||0),
    left: b.x1, right: b.x2, color: b.c, text: b.t,
    size: Math.abs((Math.max(b.y1||0, b.y2||0)) - (Math.min(b.y1||0, b.y2||0))),
    isMitigated: b.ex === false
  }));

  const chartPrice = _resolveLatestClose(chartPeriods || []);
  const legacyTail = Array.isArray(chartPeriods) && chartPeriods.length > 0 ? chartPeriods[chartPeriods.length - 1] : null;
  const legacyTailClose = _extractPeriodClose(legacyTail);
  const latestClose = chartPrice.close ?? legacyTailClose;

  const obBoxes = boxes.filter(b => /ob|block/i.test(String(b.t)) || (b.x2 !== undefined && b.x1 !== undefined && Math.abs(b.x2 - b.x1) > 5 && !/fvg/i.test(String(b.t)) && b.t !== '•')).map(b => {
    const top = Math.max(b.y1||0, b.y2||0);
    const bottom = Math.min(b.y1||0, b.y2||0);
    const mid = (top + bottom) / 2;
    let isBullish = /bull/i.test(String(b.t));
    let isBearish = /bear/i.test(String(b.t));
    if (!isBullish && !isBearish && latestClose) {
      if (mid < latestClose) isBullish = true;
      else if (mid > latestClose) isBearish = true;
    }
    return { top, bottom, left: b.x1, right: b.x2, color: b.c, text: b.t, size: Math.abs(top - bottom), isBullish, isBearish, direction: isBullish ? 'bullish' : isBearish ? 'bearish' : null, isMitigated: b.ex === false };
  });

  const activeFVGs = fvgBoxes.filter(b => !b.isMitigated);
  const activeOBs = obBoxes.filter(b => !b.isMitigated);

  const lastBOS = bosLabels[bosLabels.length - 1];
  const lastCHoCH = chochLabels[chochLabels.length - 1];
  const hasBullishBOS = lastBOS?.isBullish || false;
  const hasBearishBOS = lastBOS?.isBearish || false;
  const hasBullishCHoCH = lastCHoCH?.isBullish || false;
  const hasBearishCHoCH = lastCHoCH?.isBearish || false;

  const biasScore = (hasBullishBOS ? 1 : 0) + (hasBearishBOS ? -1 : 0) + (hasBullishCHoCH ? 0.5 : 0) + (hasBearishCHoCH ? -0.5 : 0);
  const structureBias = biasScore > 0.5 ? 'BULLISH' : biasScore < -0.5 ? 'BEARISH' : 'NEUTRAL';

  return {
    summary: {
      bosCount: bosLabels.length, chochCount: chochLabels.length,
      fvgCount: fvgBoxes.length, obCount: obBoxes.length,
      activeFVGs: activeFVGs.length, activeOBs: activeOBs.length,
      structureBias, biasScore: _round(biasScore, 2),
      currentPrice: latestClose != null ? _round(latestClose, 2) : null,
    },
    bosLabels: bosLabels.slice(-10),
    chochLabels: chochLabels.slice(-10),
    fvgBoxes: fvgBoxes.slice(-10),
    obBoxes: obBoxes.slice(-10),
    activeOBs: activeOBs.slice(-5),
    activeFVGs: activeFVGs.slice(-5),
    meta: { timeframe, currentPrice: latestClose, chartPeriods }
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// TECHNICAL INDICATOR COMPUTATIONS (pure JS, from OHLCV)
// ─────────────────────────────────────────────────────────────────────────────

function sma(values, period) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j];
    result.push(sum / period);
  }
  return result;
}

function ema(values, period) {
  const result = [];
  const k = 2 / (period + 1);
  let prevEma = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) { result.push(null); continue; }
    if (prevEma === null) {
      let sum = 0, count = 0;
      for (let j = 0; j < period && i - j >= 0; j++) { if (values[i - j] != null) { sum += values[i - j]; count++; } }
      prevEma = count > 0 ? sum / count : values[i];
      result.push(prevEma);
    } else {
      prevEma = values[i] * k + prevEma * (1 - k);
      result.push(prevEma);
    }
  }
  return result;
}

function computeRSI(closes, period = 14) {
  const gains = [], losses = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { gains.push(0); losses.push(0); continue; }
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  const avgGains = [], avgLosses = [];
  for (let i = 0; i < gains.length; i++) {
    if (i < period) { avgGains.push(null); avgLosses.push(null); continue; }
    if (i === period) {
      let gSum = 0, lSum = 0;
      for (let j = 1; j <= period; j++) { gSum += gains[j]; lSum += losses[j]; }
      avgGains.push(gSum / period);
      avgLosses.push(lSum / period);
    } else {
      avgGains.push((avgGains[avgGains.length - 1] * (period - 1) + gains[i]) / period);
      avgLosses.push((avgLosses[avgLosses.length - 1] * (period - 1) + losses[i]) / period);
    }
  }
  const rsi = [];
  for (let i = 0; i < avgGains.length; i++) {
    if (avgGains[i] == null || avgLosses[i] == null) { rsi.push(null); continue; }
    if (avgLosses[i] === 0) { rsi.push(100); continue; }
    const rs = avgGains[i] / avgLosses[i];
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

function computeRSISignalLine(rsi, signalPeriod = 9) {
  return sma(rsi, signalPeriod);
}

function computeStochastic(highs, lows, closes, kPeriod = 21, kSmooth = 5, dSmooth = 5) {
  const rawK = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < kPeriod - 1) { rawK.push(null); continue; }
    let highestHigh = -Infinity, lowestLow = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      highestHigh = Math.max(highestHigh, highs[i - j]);
      lowestLow = Math.min(lowestLow, lows[i - j]);
    }
    const range = highestHigh - lowestLow;
    if (range === 0) { rawK.push(50); continue; }
    rawK.push(((closes[i] - lowestLow) / range) * 100);
  }
  const K = sma(rawK, kSmooth);
  const D = sma(K, dSmooth);
  return { K, D, rawK };
}

function computeMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] == null || emaSlow[i] == null) macdLine.push(null);
    else macdLine.push(emaFast[i] - emaSlow[i]);
  }
  const signalLine = ema(macdLine, signal);
  const histogram = [];
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] == null || signalLine[i] == null) histogram.push(null);
    else histogram.push(macdLine[i] - signalLine[i]);
  }
  return { macdLine, signalLine, histogram };
}

function computeIndicators(periods) {
  const chronological = [...periods].reverse();
  const closes = chronological.map(p => _toNumber(p.close ?? p.c));
  const highs = chronological.map(p => _toNumber(p.high ?? p.max ?? p.h));
  const lows = chronological.map(p => _toNumber(p.low ?? p.min ?? p.l));

  if (closes.length < 50) {
    return { error: 'Insufficient data for indicator computation (need 50+ bars)' };
  }

  const rsi = computeRSI(closes, 14);
  const rsiSignal = computeRSISignalLine(rsi, 9);
  const stoch = computeStochastic(highs, lows, closes, 21, 5, 5);
  const macd = computeMACD(closes, 12, 26, 9);

  const latestIdx = chronological.length - 1;

  return {
    rsi: {
      value: _round(rsi[latestIdx], 2),
      signal: _round(rsiSignal[latestIdx], 2),
      isBullish: rsi[latestIdx] > rsiSignal[latestIdx],
      seriesLength: rsi.length,
    },
    stochastic: {
      K: _round(stoch.K[latestIdx], 2),
      D: _round(stoch.D[latestIdx], 2),
      isBullish: stoch.K[latestIdx] > stoch.D[latestIdx],
      seriesLength: stoch.K.length,
    },
    macd: {
      histogram: _round(macd.histogram[latestIdx], 4),
      macdLine: _round(macd.macdLine[latestIdx], 4),
      signalLine: _round(macd.signalLine[latestIdx], 4),
      isBullish: macd.histogram[latestIdx] > 0,
      seriesLength: macd.histogram.length,
    },
    latestClose: _round(closes[latestIdx], 2),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET RUNNER — SMC + chart periods for a single timeframe
// ─────────────────────────────────────────────────────────────────────────────
async function runSMCForTimeframe(symbol, tf, bars, inputs, startTime) {
  const session = process.env.SESSION || '';
  const signature = process.env.SIGNATURE || '';
  if (!session || !signature) throw new Error('SESSION and SIGNATURE env vars required');
  const normalizedTf = normalizeTf(tf);

  for (let attempt = 1; attempt <= 3; attempt++) {
    let client = null, chart = null, study = null;
    try {
      const indicator = await tv.getIndicator(PINE_ID, 'last', session, signature);
      applyInputs(indicator, inputs);
      client = new tv.Client({ token: session, signature, location: 'https://www.tradingview.com/' });
      await client.connect();
      if (!await client.waitForConnected(20000)) throw new Error('Connection timeout');

      chart = client.Session.Chart();
      const symbolReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Symbol load timeout')), 15000);
        chart.onSymbolLoaded(() => { clearTimeout(timer); resolve(); });
        chart.onError((err) => { clearTimeout(timer); reject(err); });
      });
      chart.setMarket(symbol, { timeframe: normalizedTf, range: bars });
      await symbolReady;

      try {
        const existing = chart.getStudies ? chart.getStudies() : [];
        if (existing.length > 0 && chart.removeAllStudies) { await chart.removeAllStudies(); }
      } catch (e) {}

      study = chart.Study(indicator);
      let updateCount = 0, resolved = false;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!resolved) {
            const periods = study.periods || [];
            if (periods.length > 0) { resolved = true; resolve(); }
            else reject(new Error('Timeout'));
          }
        }, 45000);
        study.onError((err) => { clearTimeout(timer); if (!resolved) { resolved = true; reject(err); } });
        study.onUpdate(() => { updateCount++; if (updateCount >= 3 && !resolved) { resolved = true; clearTimeout(timer); resolve(); } });
      });

      const rawData = { periods: study.periods || [], graphic: study.graphic || {}, bars };
      const chartPeriods = chart.periods || [];
      const parsed = parseSMCGraphic(rawData, tf, chartPeriods);
      parsed.meta.durationMs = Date.now() - startTime;

      try { study.remove(); } catch {}
      try { chart.delete(); } catch {}
      try { client.end(); } catch {}
      return parsed;
    } catch (err) {
      if (/maximum number of studies/i.test(err.message) && attempt < 3) {
        AgentOutput.warn(`⚠️ Retry ${attempt}/3...`);
        try { chart.delete(); } catch {}
        try { client.end(); } catch {}
        await new Promise(r => setTimeout(r, attempt * 3000));
        continue;
      }
      throw err;
    } finally {
      try { study.remove(); } catch {}
      try { chart.delete(); } catch {}
      try { client.end(); } catch {}
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN RULE LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function evaluateGoldenRule(weeklySMC, dailySMC, h4SMC, h4Indicators) {
  const verdict = {
    pass: false,
    direction: null,
    score: 0,
    checklist: {
      weeklyMomentum: false,
      dailyAlignment: false,
      smcGreen: false,
      rsiCrossover: false,
      stochasticCrossover: false,
      macdHistogram: false,
    },
    reasons: [],
    warnings: [],
    sltp: null,
  };

  const weeklyBias = weeklySMC?.summary?.structureBias || 'NEUTRAL';
  const dailyBias = dailySMC?.summary?.structureBias || 'NEUTRAL';
  const h4Bias = h4SMC?.summary?.structureBias || 'NEUTRAL';

  verdict.checklist.weeklyMomentum = weeklyBias === 'BULLISH';
  verdict.checklist.dailyAlignment = dailyBias === 'BULLISH';

  if (!verdict.checklist.weeklyMomentum) {
    verdict.reasons.push('❌ WEEKLY: Momentum is not bullish. Golden Rule violated — no long trades permitted.');
    verdict.warnings.push('Weekly trend is the fortune. Standing aside is a proactive strategy.');
  } else {
    verdict.reasons.push('✅ WEEKLY: Bullish momentum confirmed.');
    verdict.score += 30;
  }

  if (!verdict.checklist.dailyAlignment) {
    verdict.reasons.push('❌ DAILY: Swing window not aligned bullishly.');
  } else {
    verdict.reasons.push('✅ DAILY: Swing window aligned with weekly trend.');
    verdict.score += 20;
  }

  if (h4Bias !== 'BULLISH') {
    verdict.reasons.push('❌ 4H: Trigger timeframe not bullish.');
  } else {
    verdict.reasons.push('✅ 4H: Trigger timeframe bullish.');
    verdict.score += 10;
  }

  if (!h4Indicators || h4Indicators.error) {
    verdict.warnings.push(`Indicator computation failed: ${h4Indicators?.error || 'unknown'}`);
    return verdict;
  }

  const latestCHoCH = h4SMC?.chochLabels?.[h4SMC.chochLabels.length - 1];
  verdict.checklist.smcGreen = h4Bias === 'BULLISH' && (latestCHoCH?.isBullish || false);
  if (verdict.checklist.smcGreen) {
    verdict.reasons.push('✅ SMC: Green candles / bullish CHoCH confirmed.');
    verdict.score += 15;
  } else {
    verdict.reasons.push('❌ SMC: No bullish CHoCH — structure not yet green.');
  }

  verdict.checklist.rsiCrossover = !!h4Indicators.rsi?.isBullish;
  if (verdict.checklist.rsiCrossover) {
    verdict.reasons.push(`✅ RSI: ${_round(h4Indicators.rsi.value)} > ${_round(h4Indicators.rsi.signal)} (bullish crossover).`);
    verdict.score += 10;
  } else {
    verdict.reasons.push(`❌ RSI: ${_round(h4Indicators.rsi?.value)} vs signal ${_round(h4Indicators.rsi?.signal)} — no bullish crossover.`);
  }

  verdict.checklist.stochasticCrossover = !!h4Indicators.stochastic?.isBullish;
  if (verdict.checklist.stochasticCrossover) {
    verdict.reasons.push(`✅ Stochastic: K(${_round(h4Indicators.stochastic.K)}) > D(${_round(h4Indicators.stochastic.D)}) — bullish momentum shift.`);
    verdict.score += 10;
  } else {
    verdict.reasons.push(`❌ Stochastic: K(${_round(h4Indicators.stochastic?.K)}) ≤ D(${_round(h4Indicators.stochastic?.D)}) — no bullish crossover.`);
  }

  verdict.checklist.macdHistogram = !!h4Indicators.macd?.isBullish;
  if (verdict.checklist.macdHistogram) {
    verdict.reasons.push(`✅ MACD: Histogram ${_round(h4Indicators.macd.histogram)} > 0 (trend confirmation).`);
    verdict.score += 10;
  } else {
    verdict.reasons.push(`❌ MACD: Histogram ${_round(h4Indicators.macd?.histogram)} — not green.`);
  }

  const allFourSignals = verdict.checklist.smcGreen && verdict.checklist.rsiCrossover &&
                         verdict.checklist.stochasticCrossover && verdict.checklist.macdHistogram;
  const timeframesAligned = verdict.checklist.weeklyMomentum && verdict.checklist.dailyAlignment;

  if (timeframesAligned && allFourSignals) {
    verdict.pass = true;
    verdict.direction = 'long';
    verdict.reasons.push('\n🎯 VERDICT: PASS — All 3 timeframes aligned + 4 signals confirmed. High-probability long setup.');
  } else if (timeframesAligned && !allFourSignals) {
    verdict.pass = false;
    verdict.direction = 'long';
    verdict.reasons.push('\n⏳ VERDICT: PENDING — Timeframes aligned, but 4H signals not fully confirmed. Wait for all stars to align.');
    verdict.warnings.push('Do not chase. Wait for RSI, Stochastic, and MACD to realign on 4H.');
  } else {
    verdict.pass = false;
    verdict.direction = null;
    verdict.reasons.push('\n🚫 VERDICT: FAIL — Timeframe alignment missing or signals incomplete.');
  }

  if (weeklyBias === 'BEARISH') {
    verdict.warnings.push('DANGER ZONE: Weekly trend is bearish. Trading long is fighting the tide.');
  }

  return verdict;
}

function calculateSLTP(h4SMC, indicators, direction) {
  const latestClose = indicators?.latestClose || h4SMC?.meta?.currentPrice;
  const activeOBs = h4SMC?.activeOBs || [];
  const activeFVGs = h4SMC?.activeFVGs || [];

  if (!latestClose || direction !== 'long') return null;

  const bullishOBs = activeOBs.filter(ob => ob.isBullish).sort((a, b) => {
    const distA = Math.min(Math.abs(latestClose - a.bottom), Math.abs(latestClose - a.top));
    const distB = Math.min(Math.abs(latestClose - b.bottom), Math.abs(latestClose - b.top));
    return distA - distB;
  });

  const bullishFVGs = activeFVGs.filter(fvg => fvg.bottom < latestClose).sort((a, b) => {
    return Math.abs(latestClose - a.bottom) - Math.abs(latestClose - b.bottom);
  });

  let sl = null, slSource = null;

  if (bullishOBs.length > 0) {
    const ob = bullishOBs[0];
    sl = ob.bottom;
    slSource = `bullish OB @ ${_round(ob.top)}-${_round(ob.bottom)}`;
  } else if (bullishFVGs.length > 0) {
    const fvg = bullishFVGs[0];
    sl = fvg.bottom;
    slSource = `bullish FVG @ ${_round(fvg.bottom)}-${_round(fvg.top)}`;
  } else {
    const atr = latestClose * 0.02;
    sl = latestClose - atr;
    slSource = 'fallback (2% risk buffer)';
  }

  const targets = [];
  const fvgAbove = activeFVGs.filter(fvg => fvg.bottom > latestClose).sort((a, b) => a.bottom - b.bottom);
  if (fvgAbove.length > 0) {
    targets.push({ label: 'TP1 (FVG)', price: _round(fvgAbove[0].top), source: `FVG ${_round(fvgAbove[0].bottom)}-${_round(fvgAbove[0].top)}` });
  }

  const obAbove = bullishOBs.filter(ob => ob.bottom > latestClose).sort((a, b) => a.bottom - b.bottom);
  if (obAbove.length > 0) {
    targets.push({ label: 'TP2 (OB)', price: _round(obAbove[0].top), source: `OB ${_round(obAbove[0].bottom)}-${_round(obAbove[0].top)}` });
  }

  const risk = Math.abs(latestClose - sl);
  if (risk > 0) {
    targets.push({ label: 'TP3 (2R)', price: _round(latestClose + risk * 2), source: '2:1 risk/reward' });
  }

  return {
    entry: _round(latestClose),
    stopLoss: _round(sl),
    stopLossSource: slSource,
    takeProfits: targets,
    riskReward: risk > 0 ? _round((targets[targets.length - 1]?.price - latestClose) / risk, 2) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT FORMATTING
// ─────────────────────────────────────────────────────────────────────────────
function printResults(result) {
  const { weekly, daily, h4, indicators, verdict } = result;
  AgentOutput.info('\n══════════════════════════════════════════════════════════════════════');
  AgentOutput.info('  GOLDEN RULE STRATEGY — MULTI-TIMEFRAME ANALYSIS');
  AgentOutput.info('══════════════════════════════════════════════════════════════════════');

  AgentOutput.info('\n📊 WEEKLY ANCHOR');
  AgentOutput.info(`   Bias: ${weekly?.summary?.structureBias || 'N/A'} | BOS: ${weekly?.summary?.bosCount || 0} | CHoCH: ${weekly?.summary?.chochCount || 0}`);

  AgentOutput.info('\n📊 DAILY FILTER');
  AgentOutput.info(`   Bias: ${daily?.summary?.structureBias || 'N/A'} | BOS: ${daily?.summary?.bosCount || 0} | CHoCH: ${daily?.summary?.chochCount || 0}`);

  AgentOutput.info('\n📊 4-HOUR TRIGGER');
  AgentOutput.info(`   Bias: ${h4?.summary?.structureBias || 'N/A'} | BOS: ${h4?.summary?.bosCount || 0} | CHoCH: ${h4?.summary?.chochCount || 0}`);
  AgentOutput.info(`   Active OBs: ${h4?.summary?.activeOBs || 0} | Active FVGs: ${h4?.summary?.activeFVGs || 0}`);

  if (indicators && !indicators.error) {
    AgentOutput.info('\n📈 4-HOUR OSCILLATORS');
    AgentOutput.info(`   RSI:      ${indicators.rsi?.value} (signal: ${indicators.rsi?.signal}) ${indicators.rsi?.isBullish ? '✅' : '❌'}`);
    AgentOutput.info(`   Stoch:    K=${indicators.stochastic?.K}, D=${indicators.stochastic?.D} ${indicators.stochastic?.isBullish ? '✅' : '❌'}`);
    AgentOutput.info(`   MACD:     Hist=${indicators.macd?.histogram} ${indicators.macd?.isBullish ? '✅' : '❌'}`);
  }

  AgentOutput.info('\n🎯 GOLDEN RULE VERDICT');
  AgentOutput.info(`   Score: ${verdict.score}/100 | Pass: ${verdict.pass ? '✅ YES' : '❌ NO'} | Direction: ${verdict.direction?.toUpperCase() || 'NONE'}`);
  AgentOutput.info('\n   Checklist:');
  AgentOutput.info(`      Weekly Momentum:      ${verdict.checklist.weeklyMomentum ? '✅' : '❌'}`);
  AgentOutput.info(`      Daily Alignment:      ${verdict.checklist.dailyAlignment ? '✅' : '❌'}`);
  AgentOutput.info(`      SMC Green/CHoCH:      ${verdict.checklist.smcGreen ? '✅' : '❌'}`);
  AgentOutput.info(`      RSI Crossover:        ${verdict.checklist.rsiCrossover ? '✅' : '❌'}`);
  AgentOutput.info(`      Stochastic Crossover: ${verdict.checklist.stochasticCrossover ? '✅' : '❌'}`);
  AgentOutput.info(`      MACD Histogram:       ${verdict.checklist.macdHistogram ? '✅' : '❌'}`);

  if (verdict.sltp) {
    AgentOutput.info('\n💰 SUGGESTED LEVELS');
    AgentOutput.info(`   Entry:     ${verdict.sltp.entry}`);
    AgentOutput.info(`   Stop Loss: ${verdict.sltp.stopLoss}  (${verdict.sltp.stopLossSource})`);
    verdict.sltp.takeProfits.forEach(tp => {
      AgentOutput.info(`   ${tp.label}: ${tp.price}  (${tp.source})`);
    });
    if (verdict.sltp.riskReward) {
      AgentOutput.info(`   R/R: 1:${verdict.sltp.riskReward}`);
    }
  }

  if (verdict.reasons.length > 0) {
    AgentOutput.info('\n📝 RATIONALE');
    verdict.reasons.forEach(r => AgentOutput.info(`   ${r}`));
  }

  if (verdict.warnings.length > 0) {
    AgentOutput.info('\n⚠️ WARNINGS');
    verdict.warnings.forEach(w => AgentOutput.info(`   • ${w}`));
  }

  AgentOutput.info('\n══════════════════════════════════════════════════════════════════════\n');
}

function transformForAgentMode(result, args) {
  const { weekly, daily, h4, indicators, verdict } = result;
  return {
    status: verdict.pass ? 'ok' : 'no_trade',
    exitCode: EXIT_CODES.SUCCESS,
    timestamp: new Date().toISOString(),
    execution: { durationMs: result.durationMs, attempts: 1 },
    agentContext: {
      workflow: 'golden-rule-strategy',
      modelVersion: 'agent-ready-v2',
      symbol: args?.symbol || 'unknown',
    },
    goldenRule: {
      verdict: verdict.pass ? 'PASS' : 'FAIL',
      direction: verdict.direction,
      score: verdict.score,
      checklist: verdict.checklist,
      sltp: verdict.sltp,
      rationale: verdict.reasons,
      warnings: verdict.warnings,
    },
    timeframes: {
      weekly: {
        bias: weekly?.summary?.structureBias,
        bosCount: weekly?.summary?.bosCount,
        chochCount: weekly?.summary?.chochCount,
        activeOBs: weekly?.summary?.activeOBs,
        activeFVGs: weekly?.summary?.activeFVGs,
      },
      daily: {
        bias: daily?.summary?.structureBias,
        bosCount: daily?.summary?.bosCount,
        chochCount: daily?.summary?.chochCount,
        activeOBs: daily?.summary?.activeOBs,
        activeFVGs: daily?.summary?.activeFVGs,
      },
      h4: {
        bias: h4?.summary?.structureBias,
        bosCount: h4?.summary?.bosCount,
        chochCount: h4?.summary?.chochCount,
        activeOBs: h4?.summary?.activeOBs,
        activeFVGs: h4?.summary?.activeFVGs,
        currentPrice: h4?.summary?.currentPrice,
        recentBOS: h4?.bosLabels?.slice(-3),
        recentCHoCH: h4?.chochLabels?.slice(-3),
        activeOBsDetail: h4?.activeOBs?.slice(-3),
        activeFVGsDetail: h4?.activeFVGs?.slice(-3),
      },
    },
    indicators: indicators?.error ? { error: indicators.error } : {
      rsi: indicators?.rsi,
      stochastic: indicators?.stochastic,
      macd: indicators?.macd,
      latestClose: indicators?.latestClose,
    },
    schemaVersion: 'agent-ready-v2.1.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'golden-rule-strategy',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args._symbol && process.argv.length <= 2)) { printUsage(); process.exit(0); }
  if (args.silent || args.agent) enableSilentMode(true);

  const startTime = Date.now();
  AgentOutput.info(`\n📊 Golden Rule Strategy | ${args.symbol} | SMC + RSI + Stoch + MACD`);

  if (args.dryRun) {
    AgentOutput.info('\n🏜️ DRY RUN');
    const dummy = {
      status: 'dry_run', symbol: args.symbol, timestamp: new Date().toISOString(),
      goldenRule: { verdict: 'DRY_RUN', checklist: { weeklyMomentum: true, dailyAlignment: true, smcGreen: true, rsiCrossover: true, stochasticCrossover: true, macdHistogram: true } }
    };
    AgentOutput.emit(dummy, { outPath: args.out, pretty: !isSilent() });
    process.exit(EXIT_CODES.SUCCESS);
  }

  try {
    AgentOutput.info('\n🔎 Running WEEKLY anchor...');
    const weekly = await runSMCForTimeframe(args.symbol, '1W', Math.min(args.bars, 200), args.inputs, startTime);
    AgentOutput.info(`   Weekly: ${weekly.summary.structureBias} | ${weekly.summary.bosCount} BOS | ${weekly.summary.chochCount} CHoCH`);

    AgentOutput.info('\n🔎 Running DAILY filter...');
    const daily = await runSMCForTimeframe(args.symbol, '1D', Math.min(args.bars, 300), args.inputs, startTime);
    AgentOutput.info(`   Daily: ${daily.summary.structureBias} | ${daily.summary.bosCount} BOS | ${daily.summary.chochCount} CHoCH`);

    AgentOutput.info('\n🔎 Running 4-HOUR trigger + oscillators...');
    const h4 = await runSMCForTimeframe(args.symbol, '240', args.bars, args.inputs, startTime);
    AgentOutput.info(`   4H: ${h4.summary.structureBias} | ${h4.summary.bosCount} BOS | ${h4.summary.chochCount} CHoCH | ${h4.summary.activeOBs} OBs | ${h4.summary.activeFVGs} FVGs`);

    let indicators = null;
    if (h4.meta.chartPeriods && h4.meta.chartPeriods.length > 0) {
      indicators = computeIndicators(h4.meta.chartPeriods);
      if (indicators.error) {
        AgentOutput.warn(`   ⚠️ Indicator computation: ${indicators.error}`);
      } else {
        AgentOutput.info(`   RSI: ${indicators.rsi.value} | Stoch K: ${indicators.stochastic.K} | MACD Hist: ${indicators.macd.histogram}`);
      }
    } else {
      AgentOutput.warn('   ⚠️ No chart periods available for indicator computation.');
    }

    const verdict = evaluateGoldenRule(weekly, daily, h4, indicators);

    if (verdict.pass && verdict.direction) {
      verdict.sltp = calculateSLTP(h4, indicators, verdict.direction);
    }

    const result = {
      weekly, daily, h4, indicators, verdict,
      durationMs: Date.now() - startTime,
    };

    if (args.verbose) AgentOutput.info(`\n✓ Completed in ${result.durationMs}ms`);

    if (args.json || args.agent) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      AgentOutput.emit(output, { outPath: args.out, pretty: !isSilent() });
    } else {
      printResults(result);
    }

    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) {
    const isCritical = /SESSION|SIGNATURE|connection/i.test(err.message);
    AgentOutput.error(`\n❌ Error: ${err.message}`);
    if (args.verbose && err.stack) AgentOutput.error(err.stack.split('\n').slice(0, 5).join('\n'));
    process.exit(isCritical ? EXIT_CODES.CRITICAL : EXIT_CODES.VALIDATION);
  }
}

main().catch(err => {
  console.error(`\n❌ Unexpected: ${err.message}`);
  process.exit(1);
});
