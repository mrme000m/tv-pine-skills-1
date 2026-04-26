#!/usr/bin/env node
/**
 * Smart Money Concepts (LuxAlgo) — Standalone Runner
 * Pine ID: PUB;6daafb2cabe6419d98ae25229d2327f8
 * Detects BOS/CHoCH, Fair Value Gaps (FVG), Order Blocks (OB), Equal Highs/Lows
 * Outputs: study.graphic boxes + labels + lines + data fields
 */

const fs = require('fs');
const path = require('path');

// ─── Project Root Resolution ─────────────────────────────────────────
// Auto-detects project root (where tv-optimized.cjs / .env live) so the
// script works from the project root OR from a skill's scripts/ subdirectory.
function findProjectRoot() {
  let dir = path.resolve(__dirname);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'tv-optimized.cjs'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return __dirname;
}
const PROJECT_ROOT = findProjectRoot();
// ──────────────────────────────────────────────────────────────────────
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });
const tv = require(path.join(PROJECT_ROOT, 'tv-optimized.cjs'));
const { AgentOutput, enableSilentMode, isSilent } = require(path.join(PROJECT_ROOT, 'agent-output.cjs'));

const PINE_ID = 'PUB;6daafb2cabe6419d98ae25229d2327f8';
const SCRIPT_NAME = 'Smart Money Concepts';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

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

function parseArgs(argv) {
  const args = { _symbol: argv[0]?.toUpperCase() || null, symbol: 'BTCUSDT', tf: '15m', bars: 500, json: false, out: null, agent: false, verbose: false, dryRun: false, silent: false, inputs: {} };
  let start = 0;
  if (args._symbol && !args._symbol.startsWith('-')) { args.symbol = args._symbol; start = 1; }
  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) args.symbol = argv[++i].toUpperCase();
    else if (a === '--tf' && argv[i + 1]) args.tf = argv[++i];
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
Smart Money Concepts (LuxAlgo) — Standalone Runner
Usage: node smart-money-concepts.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --silent, --help
Inputs: modeInput, styleInput, showTrendInput, showInternalsInput, showInternalBullInput, internalBullColorInput, showInternalBearInput, internalBearColorInput, internalFilterConfluenceInput, internalStructureSize, showStructureInput, showSwingBullInput, swingBullColorInput, showSwingBearInput, swingBearColorInput, swingStructureSize, showSwingsInput, swingsLengthInput, showHighLowSwingsInput, showInternalOrderBlocksInput, internalOrderBlocksSizeInput, showSwingOrderBlocksInput, swingOrderBlocksSizeInput, orderBlockFilterInput, orderBlockMitigationInput, internalBullishOrderBlockColor, internalBearishOrderBlockColor, swingBullishOrderBlockColor, swingBearishOrderBlockColor, showEqualHighsLowsInput, equalHighsLowsLengthInput, equalHighsLowsThresholdInput, equalHighsLowsSizeInput, showFairValueGapsInput, fairValueGapsThresholdInput, fairValueGapsTimeframeInput, fairValueGapsBullColorInput, fairValueGapsBearColorInput, fairValueGapsExtendInput, showDailyLevelsInput, dailyLevelsStyleInput, dailyLevelsColorInput, showWeeklyLevelsInput, weeklyLevelsStyleInput, weeklyLevelsColorInput, showMonthlyLevelsInput, monthlyLevelsStyleInput, monthlyLevelsColorInput, showPremiumDiscountZonesInput, premiumZoneColorInput, equilibriumZoneColorInput, discountZoneColorInput
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

function _round(val, d = 2) { return typeof val === 'number' ? Math.round(val * 10 ** d) / 10 ** d : val; }
function _coerce(val, type) { const s = String(val); if (type === 'bool') return s.toLowerCase() === 'true' || s === '1'; if (type === 'int') return parseInt(s, 10); if (type === 'float') return parseFloat(s); return val; }

const DEFAULT_INPUT_OVERRIDES = {
  // FVGs are core SMC data; enable by default unless explicitly disabled by user.
  showFairValueGapsInput: true
};

function applyInputs(indicator, inputs) {
  const userInputs = inputs || {};
  const mergedInputs = { ...DEFAULT_INPUT_OVERRIDES, ...userInputs };
  if (Object.keys(mergedInputs).length === 0) return;
  console.log('📝 Applying input configuration...');
  if (!Object.prototype.hasOwnProperty.call(userInputs, 'showFairValueGapsInput')) {
    console.log('   ℹ️  Default override: showFairValueGapsInput=true');
  }
  for (const [key, value] of Object.entries(mergedInputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) { console.warn(`   ⚠️  Unknown input: ${key}`); continue; }
    try { const tvInputDef = indicator.inputs[mapping.tvInputId]; if (!tvInputDef) { console.warn(`   ⚠️  Input ${key} not in indicator`); continue; } const typed = _coerce(value, mapping.type); indicator.setOption(mapping.tvInputId, typed); console.log(`   ✅ ${key} → ${mapping.tvInputId}: ${JSON.stringify(typed)} (${tvInputDef.type})`); } catch (e) { console.warn(`   ⚠️  ${key} failed: ${e.message}`); }
  }
}

function _colorToHex(c) {
  if (!c) return '';
  if (typeof c === 'string') return c.toLowerCase().replace(/[^a-f0-9]/g, '');
  const hex = (c >>> 0).toString(16).padStart(8, '0');
  return hex.slice(2); // strip alpha
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
  if (!Array.isArray(periods) || periods.length === 0) return { close: null, time: null, source: 'none' };
  let latestByTime = null;
  for (const p of periods) {
    const close = _extractPeriodClose(p);
    const time = _extractPeriodTime(p);
    if (close == null) continue;
    if (time == null) {
      if (!latestByTime) latestByTime = { close, time: null };
      continue;
    }
    if (!latestByTime || latestByTime.time == null || time > latestByTime.time) {
      latestByTime = { close, time };
    }
  }
  if (latestByTime) return { ...latestByTime, source: latestByTime.time != null ? 'chart-max-time' : 'chart-first-valid' };
  return { close: null, time: null, source: 'none' };
}

function _resolveLatestStructureLevel(bosLabels, chochLabels) {
  const events = [...(bosLabels || []), ...(chochLabels || [])].filter(e => _toNumber(e?.y) != null && _toNumber(e?.x) != null);
  if (events.length === 0) return null;
  events.sort((a, b) => (a.x || 0) - (b.x || 0));
  const latest = events[events.length - 1];
  return { x: latest.x, y: latest.y, type: latest.type };
}

function _pctDiff(a, b) {
  if (_toNumber(a) == null || _toNumber(b) == null || b === 0) return 0;
  return Math.abs((a - b) / b);
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

function _findEqLineForLabel(label, lines) {
  const lx = _toNumber(label?.x);
  const ly = _toNumber(label?.y);
  if (lx == null || ly == null) return null;
  const EPS = 100;
  for (const ln of lines || []) {
    const normStyle = _normalizeLineStyle(ln?.st);
    const x1 = _toNumber(ln?.x1);
    const x2 = _toNumber(ln?.x2);
    const y1 = _toNumber(ln?.y1);
    const y2 = _toNumber(ln?.y2);
    if (normStyle !== 'dotted' || x1 == null || x2 == null || y1 == null || y2 == null) continue;
    const minX = Math.min(x1, x2) - 1;
    const maxX = Math.max(x1, x2) + 1;
    if (lx < minX || lx > maxX) continue;
    if (Math.abs(y1 - ly) <= EPS || Math.abs(y2 - ly) <= EPS) return ln;
  }
  return null;
}

function parseGraphicOutput(rawData, timeframe, chartPeriods) {
  const graphic = rawData?.graphic || {};
  const boxes = Object.values(graphic.dwgBoxes ?? graphic.boxes ?? graphic.dwgboxes ?? {});
  const labels = Object.values(graphic.dwgLabels ?? graphic.labels ?? graphic.dwglabels ?? {});
  const lines = Object.values(graphic.dwgLines ?? graphic.lines ?? graphic.dwglines ?? {});
  const tables = Object.values(graphic.dwgTables ?? graphic.tables ?? graphic.dwgtables ?? {});

  // BOS/CHoCH labels
  // Infer bullish/bearish from y-value trend (higher = bullish break, lower = bearish break)
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
    return {
      text: l.t, x: l.x, y: l.y, color: l.ci,
      type: 'BOS', isBullish, isBearish,
      scope,
      lineStyle,
      time: l.time
    };
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
    return {
      text: l.t, x: l.x, y: l.y, color: l.ci,
      type: 'CHoCH', isBullish, isBearish,
      scope,
      lineStyle,
      time: l.time
    };
  });

  // FVG boxes: small boxes with top/bottom representing the gap
  // Filter by text first, then fall back to narrow boxes (gaps are typically 1-bar wide)
  const fvgBoxes = boxes.filter(b => /fvg/i.test(String(b.t)) || (b.x2 !== undefined && b.x1 !== undefined && Math.abs(b.x2 - b.x1) <= 2 && b.t !== '•')).map(b => ({
    top: Math.max(b.y1||0, b.y2||0), bottom: Math.min(b.y1||0, b.y2||0),
    left: b.x1, right: b.x2,
    color: b.c, text: b.t,
    size: Math.abs((Math.max(b.y1||0, b.y2||0)) - (Math.min(b.y1||0, b.y2||0))),
    isMitigated: b.ex === false
  }));

  const chartPrice = _resolveLatestClose(chartPeriods || []);
  const legacyTail = Array.isArray(chartPeriods) && chartPeriods.length > 0 ? chartPeriods[chartPeriods.length - 1] : null;
  const legacyTailClose = _extractPeriodClose(legacyTail);
  const latestClose = chartPrice.close ?? legacyTailClose;

  // OB boxes: larger boxes representing order blocks
  // Infer bullish/bearish from position relative to latest close (below = demand/bullish, above = supply/bearish)
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
    const direction = isBullish ? 'bullish' : isBearish ? 'bearish' : null;
    return {
      top, bottom, left: b.x1, right: b.x2,
      color: b.c, text: b.t,
      size: Math.abs(top - bottom),
      isBullish, isBearish, direction,
      isMitigated: b.ex === false
    };
  });

  // EQH/EQL are rendered as labels (EQH/EQL) plus dotted connector lines.
  const eqLabels = labels.filter(l => /^eqh$|^eql$/i.test(String(l.t))).sort((a, b) => (a.x || 0) - (b.x || 0));
  const eqhLines = eqLabels.map(l => {
    const line = _findEqLineForLabel(l, lines);
    return {
      price: _toNumber(l.y) ?? _toNumber(line?.y2) ?? _toNumber(line?.y1) ?? _toNumber(line?.price) ?? _toNumber(line?.level),
      color: line?.ci ?? l.ci,
      style: _normalizeLineStyle(line?.st),
      type: /eql/i.test(String(l.t)) ? 'EQL' : 'EQH',
      x: l.x,
      y: l.y
    };
  });

  // Trend lines (breaker blocks, liquidity sweeps)
  const trendLines = lines.filter(l => {
    const style = _normalizeLineStyle(l.st);
    return style === 'solid' || style === 'dashed';
  }).map(l => ({
    from: { x: l.x1, y: l.y1 }, to: { x: l.x2, y: l.y2 },
    color: l.ci, style: _normalizeLineStyle(l.st),
    type: l.y1 > l.y2 ? 'resistance' : 'support'
  }));

  // Period data for price context (study periods may not have OHLC; use chartPeriods for latestClose)
  const periods = rawData?.periods || [];

  // Calculate active vs mitigated structures
  const activeFVGs = fvgBoxes.filter(b => !b.isMitigated);
  const activeOBs = obBoxes.filter(b => !b.isMitigated);
  const mitigatedFVGs = fvgBoxes.filter(b => b.isMitigated);
  const mitigatedOBs = obBoxes.filter(b => b.isMitigated);

  const recentBOS = bosLabels.slice(-5);
  const recentCHoCH = chochLabels.slice(-5);

  // Market structure bias
  const lastBOS = bosLabels[bosLabels.length - 1];
  const lastCHoCH = chochLabels[chochLabels.length - 1];
  const hasBullishBOS = lastBOS?.isBullish || false;
  const hasBearishBOS = lastBOS?.isBearish || false;
  const hasBullishCHoCH = lastCHoCH?.isBullish || false;
  const hasBearishCHoCH = lastCHoCH?.isBearish || false;

  const biasScore = (hasBullishBOS ? 1 : 0) + (hasBearishBOS ? -1 : 0) + (hasBullishCHoCH ? 0.5 : 0) + (hasBearishCHoCH ? -0.5 : 0);
  const structureBias = biasScore > 0.5 ? 'BULLISH' : biasScore < -0.5 ? 'BEARISH' : 'NEUTRAL';
  const latestStructure = _resolveLatestStructureLevel(bosLabels, chochLabels);

  const integrityWarnings = [];
  if (latestClose != null && legacyTailClose != null) {
    const tailDivergence = _pctDiff(latestClose, legacyTailClose);
    if (tailDivergence > 0.02) {
      integrityWarnings.push(`Price integrity warning: chart tail close diverges from latest-time close by ${_round(tailDivergence * 100, 2)}%. Using latest-time close ${_round(latestClose)}.`);
    }
  }
  if (latestClose != null && latestStructure?.y != null) {
    const structureDivergence = _pctDiff(latestClose, latestStructure.y);
    if (structureDivergence > 0.02) {
      integrityWarnings.push(`Price integrity warning: price ${_round(latestClose)} diverges from latest ${latestStructure.type} level ${_round(latestStructure.y)} by ${_round(structureDivergence * 100, 2)}%.`);
    }
  }

  // Liquidity levels
  const liquidityLevels = [...eqhLines.map(l => l.price), ...trendLines.map(l => Math.max(l.from.y, l.to.y))].filter(Boolean);

  const summary = {
    totalBoxes: boxes.length, totalLabels: labels.length, totalLines: lines.length, totalTables: tables.length,
    bosCount: bosLabels.length, chochCount: chochLabels.length, fvgCount: fvgBoxes.length, obCount: obBoxes.length, eqhCount: eqhLines.length,
    activeFVGs: activeFVGs.length, activeOBs: activeOBs.length, mitigatedFVGs: mitigatedFVGs.length, mitigatedOBs: mitigatedOBs.length,
    recentBOS: recentBOS.length, recentCHoCH: recentCHoCH.length,
    structureBias, biasScore: _round(biasScore, 2), liquidityLevelCount: liquidityLevels.length,
    currentPrice: latestClose != null ? _round(latestClose, 2) : null,
    priceIntegrityWarnings: integrityWarnings.length
  };

  const signals = _generateSignals(structureBias, activeOBs, activeFVGs, latestClose, recentBOS, recentCHoCH);
  const narrative = _generateNarrative(summary, signals, latestClose, integrityWarnings);
  const agenticScore = _computeAgenticScore(summary);

  return {
    summary,
    bosLabels: bosLabels.slice(-10),
    chochLabels: chochLabels.slice(-10),
    fvgBoxes: fvgBoxes.slice(-10),
    obBoxes: obBoxes.slice(-10),
    eqhLines: eqhLines.slice(-10),
    trendLines: trendLines.slice(-10),
    activeOBs: activeOBs.slice(-5),
    activeFVGs: activeFVGs.slice(-5),
    signals,
    narrative,
    meta: {
      pineId: PINE_ID,
      scriptName: SCRIPT_NAME,
      timeframe,
      periodCount: periods.length,
      dataSource: 'graphic+periods',
      price: {
        close: latestClose,
        source: chartPrice.source,
        timestamp: chartPrice.time,
        legacyTailClose
      },
      integrity: {
        warningCount: integrityWarnings.length,
        warnings: integrityWarnings,
        latestStructureLevel: latestStructure ? { type: latestStructure.type, price: latestStructure.y, x: latestStructure.x } : null
      }
    },
    enhanced: { signals, narrative, agenticScore }
  };
}

function _generateSignals(structureBias, activeOBs, activeFVGs, latestClose, recentBOS, recentCHoCH) {
  const generated = [];
  const direction = structureBias === 'BULLISH' ? 'long' : structureBias === 'BEARISH' ? 'short' : 'neutral';
  if (direction === 'neutral' || activeOBs.length === 0 || _toNumber(latestClose) == null) return generated;

  // Find nearest OB
  const sortedOBs = activeOBs.filter(b => b.bottom && b.top).sort((a, b) => {
    const distA = Math.min(Math.abs(latestClose - a.bottom), Math.abs(latestClose - a.top));
    const distB = Math.min(Math.abs(latestClose - b.bottom), Math.abs(latestClose - b.top));
    return distA - distB;
  });

  const nearestOB = sortedOBs[0];
  if (!nearestOB) return generated;

  const obEntry = nearestOB.isBullish ? nearestOB.top : nearestOB.bottom;
  const obSL = nearestOB.isBullish ? nearestOB.bottom : nearestOB.top;

  const confluenceScore = _round((recentBOS.length > 0 ? 0.2 : 0) + (recentCHoCH.length > 0 ? 0.2 : 0) + (activeFVGs.length > 0 ? 0.15 : 0) + (activeOBs.length > 2 ? 0.2 : 0.1), 2);
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.60 ? 'HIGH' : confluenceScore >= 0.40 ? 'MED' : 'LOW';

  generated.push({ rank: 1, setupType: 'smart_money_concepts', direction, confluenceScore, confidence, rationale: `${direction.toUpperCase()} bias with active ${nearestOB.isBullish ? 'bull' : 'bear'} OB at ${_round(obEntry)}-${_round(obSL)}. Recent BOS/CHoCH: ${recentBOS.length}/${recentCHoCH.length}.` });

  return generated;
}

function _generateNarrative(summary, signals, latestClose, integrityWarnings = []) {
  const parts = [`SMC Structure: ${summary.bosCount} BOS, ${summary.chochCount} CHoCH, ${summary.fvgCount} FVG, ${summary.obCount} OB, ${summary.eqhCount} EQH/EQL.`];
  parts.push(`Active: ${summary.activeOBs} OBs, ${summary.activeFVGs} FVGs. Bias: ${summary.structureBias}.`);
  if (latestClose) parts.push(`Price: ${_round(latestClose)}.`);
  const warnings = [];
  if (summary.bosCount === 0 && summary.chochCount === 0) warnings.push('No BOS/CHoCH detected — structure may be weak or unclear.');
  if (summary.activeOBs === 0) warnings.push('No active order blocks — look for fresh structure forming.');
  warnings.push(...integrityWarnings);
  const watchlist = ['Monitor OB mitigation as price sweeps liquidity.', 'BOS confirms trend continuation; CHoCH signals potential reversal.', 'EQH/EQL are liquidity targets — watch for sweeps.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'Wait for clear structure bias.', warnings, watchlist };
}

function _computeAgenticScore(summary) {
  let score = 0.2;
  if (summary.bosCount > 0 || summary.chochCount > 0) score += 0.15;
  if (summary.activeOBs > 0) score += 0.15;
  if (summary.activeFVGs > 0) score += 0.1;
  if (summary.structureBias !== 'NEUTRAL') score += 0.2;
  if (summary.activeOBs > 2 || summary.activeFVGs > 2) score += 0.15;
  if (summary.eqhCount > 0) score += 0.05;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, bosLabels, chochLabels, fvgBoxes, obBoxes, eqhLines, trendLines, activeOBs, activeFVGs, signals, narrative, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'smart-money-concepts', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: args?.inputs?.fairValueGapsTimeframeInput || null },
    structure: { bias: summary.structureBias, bosCount: summary.bosCount, chochCount: summary.chochCount, fvgCount: summary.fvgCount, obCount: summary.obCount, eqhCount: summary.eqhCount },
    active: { obCount: summary.activeOBs, fvgCount: summary.activeFVGs },
    recent: { bos: bosLabels.slice(-3), choch: chochLabels.slice(-3), ob: obBoxes.slice(-3), fvg: fvgBoxes.slice(-3) },
    levels: { eqh: eqhLines.slice(-3), trendLines: trendLines.slice(-3) },
    opportunities: signals.map(s => ({ rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice: null, isStale: false, rationale: s.rationale })),
    narrative, conformance: { hasValidData: summary.totalLabels > 0 || summary.totalBoxes > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'smart-money-concepts',
    },
  };
}

function printResults(result) {
  const { summary, bosLabels, chochLabels, fvgBoxes, obBoxes, eqhLines, activeOBs, activeFVGs, signals, narrative, meta, enhanced } = result;
  AgentOutput.info('\n══════════════════════════════════════════════════════════════════════');
  AgentOutput.info('  SMART MONEY CONCEPTS — ANALYSIS RESULTS');
  AgentOutput.info('══════════════════════════════════════════════════════════════════════');
  AgentOutput.info(`\n📊 STRUCTURE (${summary.totalLabels} labels, ${summary.totalBoxes} boxes, ${summary.totalLines} lines)`);
  AgentOutput.info(`   BOS: ${summary.bosCount} | CHoCH: ${summary.chochCount} | FVG: ${summary.fvgCount} | OB: ${summary.obCount} | EQH: ${summary.eqhCount}`);
  AgentOutput.info(`   Active OBs: ${summary.activeOBs} | Active FVGs: ${summary.activeFVGs}`);
  AgentOutput.info(`   Bias: ${summary.structureBias} | Score: ${summary.biasScore}`);
  if (bosLabels.length > 0) { AgentOutput.info('\n📈 RECENT BOS'); bosLabels.slice(-3).forEach(l => AgentOutput.info(`   ${l.isBullish ? 'BULL' : 'BEAR'}: ${l.t}`)); }
  if (chochLabels.length > 0) { AgentOutput.info('\n📉 RECENT CHoCH'); chochLabels.slice(-3).forEach(l => AgentOutput.info(`   ${l.isBullish ? 'BULL' : 'BEAR'}: ${l.t}`)); }
  if (activeOBs.length > 0) { AgentOutput.info('\n📦 ACTIVE OBs'); activeOBs.slice(-3).forEach(b => AgentOutput.info(`   ${_round(b.top)}-${_round(b.bottom)} | ${b.isBullish ? 'BULL' : b.isBearish ? 'BEAR' : '?'}${b.isMitigated ? ' [M]' : ''}`)); }
  if (activeFVGs.length > 0) { AgentOutput.info('\n⚡ ACTIVE FVGs'); activeFVGs.slice(-3).forEach(b => AgentOutput.info(`   ${_round(b.top)}-${_round(b.bottom)} | Size: ${_round(b.size)}`)); }
  if (signals.length > 0) { AgentOutput.info('\n🎯 SIGNALS'); signals.forEach(s => AgentOutput.info(`   ${s.direction.toUpperCase()} | ${s.confidence} | ${s.rationale}`)); }
  if (narrative.warnings.length > 0) { AgentOutput.info('\n⚠️ WARNINGS'); narrative.warnings.forEach(w => AgentOutput.info(`   • ${w}`)); }
  AgentOutput.info(`\nℹ️ META | Duration: ${meta.durationMs}ms | Score: ${enhanced.agenticScore}`);
  AgentOutput.info('══════════════════════════════════════════════════════════════════════\n');
}

async function runWebSocket(symbol, tf, bars, startTime, inputs) {
  const session = process.env.SESSION || '', signature = process.env.SIGNATURE || '';
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
      const symbolReady = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Symbol load timeout')), 15000); chart.onSymbolLoaded(() => { clearTimeout(timer); resolve(); }); chart.onError((err) => { clearTimeout(timer); reject(err); }); });
      chart.setMarket(symbol, { timeframe: normalizedTf, range: bars });
      await symbolReady;
      try { const existing = chart.getStudies ? chart.getStudies() : []; if (existing.length > 0 && chart.removeAllStudies) { await chart.removeAllStudies(); } } catch (e) {}
      study = chart.Study(indicator);
      let updateCount = 0, resolved = false;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { if (!resolved) { const periods = study.periods || []; if (periods.length > 0) { resolved = true; resolve(); } else reject(new Error('Timeout')); } }, 45000);
        study.onError((err) => { clearTimeout(timer); if (!resolved) { resolved = true; reject(err); } });
        study.onUpdate(() => { updateCount++; if (updateCount >= 3 && !resolved) { resolved = true; clearTimeout(timer); resolve(); } });
      });
      const rawData = { periods: study.periods || [], graphic: study.graphic || {}, bars };
      const chartPeriods = chart.periods || [];
      const parsed = parseGraphicOutput(rawData, tf, chartPeriods);
      parsed.meta.durationMs = Date.now() - startTime;
      try { study.remove(); } catch {}
      try { chart.delete(); } catch {}
      try { client.end(); } catch {}
      return parsed;
    } catch (err) {
      if (/maximum number of studies/i.test(err.message) && attempt < 3) { console.log(`⚠️ Retry ${attempt}/3...`); try { chart.delete(); } catch {} try { client.end(); } catch {} await new Promise(r => setTimeout(r, attempt * 3000)); continue; }
      throw err;
    } finally { try { study.remove(); } catch {} try { chart.delete(); } catch {} try { client.end(); } catch {} }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args._symbol && process.argv.length <= 2)) { printUsage(); process.exit(0); }
  if (args.silent || args.agent) enableSilentMode(true);
  const startTime = Date.now();
  AgentOutput.info(`\n📊 Running: ${PINE_ID} | ${args.symbol} | ${args.tf} | ${args.bars} bars`);
  if (args.dryRun) { console.log('\n🏜️ DRY RUN'); console.log(JSON.stringify({ status: 'dry_run', ...args, timestamp: new Date().toISOString() }, null, 2)); process.exit(EXIT_CODES.SUCCESS); }
  try {
    const result = await runWebSocket(args.symbol, args.tf, args.bars, startTime, args.inputs);
    if (args.verbose) console.log(`\n✓ Completed in ${result.meta.durationMs}ms`);
    if (args.json || args.agent) { const output = args.agent ? transformForAgentMode(result, args) : result; AgentOutput.emit(output, { outPath: args.out, pretty: !isSilent() }); }
    else printResults(result);
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) { const isCritical = /SESSION|SIGNATURE|connection/i.test(err.message); console.error(`\n❌ Error: ${err.message}`); process.exit(isCritical ? EXIT_CODES.CRITICAL : EXIT_CODES.VALIDATION); }
}
main().catch(err => { console.error(`\n❌ Unexpected: ${err.message}`); process.exit(1); });
