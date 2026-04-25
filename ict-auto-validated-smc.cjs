#!/usr/bin/env node
/**
 * ICT Auto-Validated SMC — Standalone Runner
 *
 * Usage:
 *   node ict-auto-validated-smc.cjs BTCUSDT
 *   node ict-auto-validated-smc.cjs BTCUSDT --tf 15m --bars 500
 *   node ict-auto-validated-smc.cjs BTCUSDT --tf 1h --bars 1000 --json
 *   node ict-auto-validated-smc.cjs BTCUSDT --agent
 *   node ict-auto-validated-smc.cjs BTCUSDT --dry-run
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env') });

const tv = require('./tv-optimized.cjs');

const PINE_ID = 'PUB;789a5c79bfe9443585da09e85ece73de';
const SCRIPT_NAME = 'ICT Auto-Validated SMC';
const PRESET_DEFAULT = {
  swingLen: 10,
  internalLen: 5,
  showSwings: true,
  showStructure: true,
  showInternalStructure: false,
  useHTF: true,
  htfTimeframe: '240',
  htfSwingLen: 10,
  showHTFStructure: true,
  showOB: true,
  obMaxCount: 5,
  requireSweep: true,
  requireDisplacement: true,
  showMitigated: false,
  showBreakers: true,
  brkMaxCount: 5,
  showFVG: true,
  fvgMaxCount: 5,
  fvgMinATRMult: 1.0,
  showCE: true,
  showMitigatedFVG: false,
  showIFVG: true,
  showBPR: true,
  showLiquidity: true,
  showEQHL: true,
  showSessionLevels: true,
  showPDHL: true,
  showPWHL: true,
  showOTE: true,
  showOTEFibs: true,
  enableSignals: true,
  minSigScore: 4,
  requireHTFAlign: true,
  showSigSL: true,
  showSigTP: true,
  sigCooldown: 10,
  showConfluence: true,
  minScore: 3,
};

const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

function parseArgs(argv) {
  const args = {
    _symbol: argv[0]?.toUpperCase() || null,
    symbol: 'BTCUSDT',
    tf: '15m',
    bars: 500,
    json: false,
    out: null,
    agent: false,
    verbose: false,
    dryRun: false,
  };
  let start = 0;
  if (args._symbol && !args._symbol.startsWith('-')) {
    args.symbol = args._symbol;
    start = 1;
  }
  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) { args.symbol = argv[++i].toUpperCase(); }
    else if (a === '--tf' && argv[i + 1]) { args.tf = argv[++i]; }
    else if (a === '--bars' && argv[i + 1]) { args.bars = parseInt(argv[++i]); }
    else if (a === '--json') { args.json = true; }
    else if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; }
    else if (a === '--agent') { args.json = true; args.agent = true; }
    else if (a === '--verbose' || a === '-v') { args.verbose = true; }
    else if (a === '--dry-run') { args.dryRun = true; }
    else if (a === '--help' || a === '-h') { args.help = true; }
  }
  return args;
}

function printUsage() {
  console.log(`
ICT Auto-Validated SMC — Standalone Runner
===========================================

Usage:
  node ict-auto-validated-smc.cjs <SYMBOL> [options]

Arguments:
  SYMBOL                    Trading pair (default: BTCUSDT)

Options:
  --tf <timeframe>          Timeframe (default: 15m)
  --bars <n>                Number of chart bars (default: 500)
  --json                    Output JSON
  --agent                   Agent mode
  --out <file>              Write JSON to file
  --verbose, -v             Verbose output
  --dry-run                 Skip connection
  --help, -h                Show this help

Examples:
  node ict-auto-validated-smc.cjs BTCUSDT
  node ict-auto-validated-smc.cjs ETHUSDT --tf 1h --bars 1000 --json
  node ict-auto-validated-smc.cjs BTCUSDT --agent
`);
}

const INPUT_MAP = [
  { variable: 'swingLen', tvInputId: 'in_0', type: 'int', default: 10 },
  { variable: 'internalLen', tvInputId: 'in_1', type: 'int', default: 5 },
  { variable: 'showSwings', tvInputId: 'in_2', type: 'bool', default: true },
  { variable: 'showStructure', tvInputId: 'in_3', type: 'bool', default: true },
  { variable: 'showInternalStructure', tvInputId: 'in_4', type: 'bool', default: false },
  { variable: 'requireBodyClose', tvInputId: 'in_5', type: 'bool', default: false },
  { variable: 'useHTF', tvInputId: 'in_6', type: 'bool', default: true },
  { variable: 'htfTimeframe', tvInputId: 'in_7', type: 'timeframe', default: '240' },
  { variable: 'htfSwingLen', tvInputId: 'in_8', type: 'int', default: 10 },
  { variable: 'showHTFStructure', tvInputId: 'in_9', type: 'bool', default: true },
  { variable: 'showOB', tvInputId: 'in_10', type: 'bool', default: true },
  { variable: 'obMaxCount', tvInputId: 'in_11', type: 'int', default: 5 },
  { variable: 'requireSweep', tvInputId: 'in_12', type: 'bool', default: true },
  { variable: 'requireDisplacement', tvInputId: 'in_13', type: 'bool', default: true },
  { variable: 'showMitigated', tvInputId: 'in_14', type: 'bool', default: false },
  { variable: 'showBreakers', tvInputId: 'in_15', type: 'bool', default: true },
  { variable: 'brkMaxCount', tvInputId: 'in_16', type: 'int', default: 5 },
  { variable: 'brkBullColor', tvInputId: 'in_17', type: 'color', default: 'color.new(#00E676, 75)' },
  { variable: 'brkBearColor', tvInputId: 'in_18', type: 'color', default: 'color.new(#FF6D00, 75)' },
  { variable: 'showFVG', tvInputId: 'in_19', type: 'bool', default: true },
  { variable: 'fvgMaxCount', tvInputId: 'in_20', type: 'int', default: 5 },
  { variable: 'fvgMinATRMult', tvInputId: 'in_21', type: 'float', default: 1 },
  { variable: 'showCE', tvInputId: 'in_22', type: 'bool', default: true },
  { variable: 'showMitigatedFVG', tvInputId: 'in_23', type: 'bool', default: false },
  { variable: 'showIFVG', tvInputId: 'in_24', type: 'bool', default: true },
  { variable: 'ifvgColor', tvInputId: 'in_25', type: 'color', default: 'color.new(#FFD600, 80)' },
  { variable: 'showBPR', tvInputId: 'in_26', type: 'bool', default: true },
  { variable: 'bprColor', tvInputId: 'in_27', type: 'color', default: 'color.new(#E040FB, 75)' },
  { variable: 'showLiquidity', tvInputId: 'in_28', type: 'bool', default: true },
  { variable: 'showEQHL', tvInputId: 'in_29', type: 'bool', default: true },
  { variable: 'eqTolerance', tvInputId: 'in_30', type: 'float', default: 0.15 },
  { variable: 'showSweeps', tvInputId: 'in_31', type: 'bool', default: true },
  { variable: 'sweepRequireWickReject', tvInputId: 'in_32', type: 'bool', default: false },
  { variable: 'showIDM', tvInputId: 'in_33', type: 'bool', default: true },
  { variable: 'idmColor', tvInputId: 'in_34', type: 'color', default: 'color.new(#FF6D00, 0)' },
  { variable: 'idmMaxCount', tvInputId: 'in_35', type: 'int', default: 5 },
  { variable: 'showPD', tvInputId: 'in_36', type: 'bool', default: true },
  { variable: 'showEQ', tvInputId: 'in_37', type: 'bool', default: true },
  { variable: 'showSessionLevels', tvInputId: 'in_38', type: 'bool', default: true },
  { variable: 'showPDHL', tvInputId: 'in_39', type: 'bool', default: true },
  { variable: 'showPWHL', tvInputId: 'in_40', type: 'bool', default: true },
  { variable: 'slPDColor', tvInputId: 'in_41', type: 'color', default: 'color.new(#2196F3, 30)' },
  { variable: 'slPWColor', tvInputId: 'in_42', type: 'color', default: 'color.new(#E040FB, 30)' },
  { variable: 'showKZ', tvInputId: 'in_43', type: 'bool', default: true },
  { variable: 'kzAsian', tvInputId: 'in_44', type: 'bool', default: false },
  { variable: 'kzLondon', tvInputId: 'in_45', type: 'bool', default: true },
  { variable: 'kzNYAM', tvInputId: 'in_46', type: 'bool', default: true },
  { variable: 'kzNYPM', tvInputId: 'in_47', type: 'bool', default: false },
  { variable: 'kzTransparency', tvInputId: 'in_48', type: 'int', default: 92 },
  { variable: 'showOTE', tvInputId: 'in_49', type: 'bool', default: true },
  { variable: 'oteFibHigh', tvInputId: 'in_50', type: 'float', default: 0.786 },
  { variable: 'oteFibLow', tvInputId: 'in_51', type: 'float', default: 0.618 },
  { variable: 'showOTEFibs', tvInputId: 'in_52', type: 'bool', default: true },
  { variable: 'oteMaxCount', tvInputId: 'in_53', type: 'int', default: 3 },
  { variable: 'oteBullColor', tvInputId: 'in_54', type: 'color', default: 'color.new(#00BCD4, 80)' },
  { variable: 'oteBearColor', tvInputId: 'in_55', type: 'color', default: 'color.new(#E040FB, 80)' },
  { variable: 'enableSignals', tvInputId: 'in_56', type: 'bool', default: true },
  { variable: 'minSigScore', tvInputId: 'in_57', type: 'int', default: 4 },
  { variable: 'requireHTFAlign', tvInputId: 'in_58', type: 'bool', default: true },
  { variable: 'requireKZActive', tvInputId: 'in_59', type: 'bool', default: false },
  { variable: 'requireCISD', tvInputId: 'in_60', type: 'bool', default: false },
  { variable: 'showSigSL', tvInputId: 'in_61', type: 'bool', default: true },
  { variable: 'showSigTP', tvInputId: 'in_62', type: 'bool', default: true },
  { variable: 'sigLongColor', tvInputId: 'in_63', type: 'color', default: 'color.new(#00E676, 0)' },
  { variable: 'sigShortColor', tvInputId: 'in_64', type: 'color', default: 'color.new(#FF1744, 0)' },
  { variable: 'sigCooldown', tvInputId: 'in_65', type: 'int', default: 10 },
  { variable: 'showConfluence', tvInputId: 'in_66', type: 'bool', default: true },
  { variable: 'minScore', tvInputId: 'in_67', type: 'int', default: 3 },
  { variable: 'bullColor', tvInputId: 'in_68', type: 'color', default: 'color.new(#00C853, 0)' },
  { variable: 'bearColor', tvInputId: 'in_69', type: 'color', default: 'color.new(#FF1744, 0)' },
  { variable: 'fvgBullColor', tvInputId: 'in_70', type: 'color', default: 'color.new(#00C853, 85)' },
  { variable: 'fvgBearColor', tvInputId: 'in_71', type: 'color', default: 'color.new(#FF1744, 85)' },
  { variable: 'obBullColor', tvInputId: 'in_72', type: 'color', default: 'color.new(#2196F3, 80)' },
  { variable: 'obBearColor', tvInputId: 'in_73', type: 'color', default: 'color.new(#FF9800, 80)' },
  { variable: 'sweepColor', tvInputId: 'in_74', type: 'color', default: 'color.new(#FFD600, 0)' },
  { variable: 'showInfoPanel', tvInputId: 'in_75', type: 'bool', default: true },
  { variable: 'chartLabelSize', tvInputId: 'in_76', type: 'string', default: 'small' },
  { variable: 'panelTextSize', tvInputId: 'in_77', type: 'string', default: 'small' }
];

function applyInputs(indicator, inputs) {
  if (!inputs || Object.keys(inputs).length === 0) return;
  console.log(`📝 Applying input overrides...`);
  for (const [key, value] of Object.entries(inputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) { console.warn(`   ⚠️  Unknown input: ${key}`); continue; }
    try {
      const tvInputDef = indicator.inputs[mapping.tvInputId];
      if (!tvInputDef) { console.warn(`   ⚠️  Input ${key} not in indicator`); continue; }
      const typed = _coerce(value, mapping.type);
      indicator.setOption(mapping.tvInputId, typed);
      console.log(`   ✅ ${key} → ${mapping.tvInputId}: ${JSON.stringify(value)} → ${JSON.stringify(typed)} (${tvInputDef.type})`);
    } catch (e) {
      console.warn(`   ⚠️  ${key} failed: ${e.message}`);
    }
  }
}

function _coerce(val, type) {
  const s = String(val);
  if (type === 'bool') return s.toLowerCase() === 'true' || s === '1';
  if (type === 'int') return parseInt(s, 10);
  if (type === 'float') return parseFloat(s);
  return val;
}

function normalizeTf(tf) {
  const t = String(tf || '15').trim().toLowerCase();
  if (/^\d+$/.test(t)) return t;
  if (/^[dwm]$/.test(t)) return t.toUpperCase();
  const m = t.match(/^(\d+)m$/);
  if (m) return m[1];
  const h = t.match(/^(\d+)h$/);
  if (h) return String(Number(h[1]) * 60);
  if (t === '1d') return '1D';
  if (t === '1w') return '1W';
  return t;
}

function _round(val, decimals = 2) {
  return typeof val === 'number' ? Math.round(val * 10 ** decimals) / 10 ** decimals : val;
}

// ── parser ────────────────────────────────────────────────────────
function parseOutput(rawData, timeframe) {
  const graphic = rawData?.graphic || {};
  const periods = rawData?.periods || [];
  const dashboard = _parseDashboard(graphic);
  const signals = _parseSignals(graphic);
  const numerical = _parseNumerical(periods);
  const lines = _parseLines(graphic);
  const boxes = _parseBoxes(graphic);
  const meta = _parseMeta(rawData, graphic, timeframe);
  const lastBar = _extractLastBar(rawData);

  const structureState = _extractStructureState(dashboard);
  const alignment = _extractAlignment(dashboard);
  const enhanced = {
    structureState,
    alignment,
    signals: _generateSignals(structureState, alignment, boxes, signals, lines),
    narrative: _generateNarrative(structureState, alignment, boxes, dashboard, signals),
    validation: _validateOutput(dashboard, signals, structureState),
    agenticScore: _computeAgenticScore(structureState, alignment, boxes, signals),
  };

  return { dashboard, signals, numerical, lines, boxes, meta, lastBar, structureState, alignment, enhanced };
}

function _parseDashboard(graphic) {
  // Accept multiple key casings across TradingView indicator versions
  const tables = graphic?.dwgtables ?? graphic?.dwgTables ?? graphic?.tables ?? {};
  const cells = graphic?.dwgtablecells ?? graphic?.dwgTableCells ?? graphic?.tableCells ?? {};
  let targetTableId = null;
  Object.entries(tables).forEach(([id, table]) => { if (table?.pos === 'top_right') targetTableId = id; });
  if (!targetTableId) return { fields: {}, rawRows: [], _warn: tables.length === 0 ? 'No tables found' : 'No top_right table found' };

  const tableCells = [];
  Object.values(cells).forEach(cell => { if (String(cell?.tid) === String(targetTableId)) tableCells.push(cell); });
  if (tableCells.length === 0) return { fields: {}, rawRows: [] };

  const grid = new Map();
  tableCells.forEach(cell => {
    const row = cell?.row, col = cell?.col, text = cell?.t ?? '';
    if (row !== undefined && col !== undefined) {
      if (!grid.has(row)) grid.set(row, new Map());
      grid.get(row).set(col, text);
    }
  });

  const fields = {};
  const rawRows = [];
  grid.forEach((cols, rowIdx) => {
    const rowData = {};
    cols.forEach((text, colIdx) => { rowData[colIdx] = text; });
    rawRows.push(rowData);
    const key = cols.get(0);
    const value = cols.get(1);
    if (key !== undefined) fields[key] = value ?? null;
  });
  return { fields, rawRows };
}

function _parseSignals(graphic) {
  const labels = graphic?.dwglabels ?? graphic?.dwgLabels ?? graphic?.labels ?? {};
  const grades = [];
  const markers = {};

  Object.values(labels).forEach(label => {
    const text = label?.t ?? '';
    const gradeMatch = text.match(/^(Long|Short)\s+([A-Z]+\+?)$/i);
    if (gradeMatch) {
      grades.push({
        direction: gradeMatch[1].charAt(0).toUpperCase() + gradeMatch[1].slice(1).toLowerCase(),
        grade: gradeMatch[2],
        text,
        barIndex: label?.x,
        price: label?.y,
      });
    }
    const markerChecks = [
      { key: 'entry', pattern: 'ENTRY' },
      { key: 'sl', pattern: 'SL' },
      { key: 'tp1', pattern: 'TP1' },
      { key: 'tp2', pattern: 'TP2' },
      { key: 'tp3', pattern: 'TP3' },
      { key: 'trail', pattern: 'TRAIL' },
    ];
    markerChecks.forEach(({ key, pattern }) => {
      if (text.includes(pattern)) {
        markers[key] = { price: label?.y, text, barIndex: label?.x, timestamp: label?.time ?? label?.time };
      }
    });
  });
  return { grades, markers };
}

function _parseNumerical(periods) {
  if (!periods || periods.length === 0) return {};
  const latest = periods[0];
  const timestamp = latest?.$time ?? latest?.timestamp;
  return {
    timestamp,
    datetime: latest?.datetime,
    BackgroundColor: latest?.BackgroundColor,
    LongSignal: latest?.LongSignal,
    LongSignal_colorer: latest?.LongSignal_colorer,
    ShortSignal: latest?.ShortSignal,
    ShortSignal_colorer: latest?.ShortSignal_colorer,
    LongSL: latest?.LongSL,
    LongSL_colorer: latest?.LongSL_colorer,
    ShortSL: latest?.ShortSL,
    ShortSL_colorer: latest?.ShortSL_colorer,
    BullishCHoCH: latest?.BullishCHoCH,
    BearishCHoCH: latest?.BearishCHoCH,
    BullishBOS: latest?.BullishBOS,
    BearishBOS: latest?.BearishBOS,
    BullishOBFormed: latest?.BullishOBFormed,
    BearishOBFormed: latest?.BearishOBFormed,
    HighScoreBullishOB: latest?.HighScoreBullishOB,
    HighScoreBearishOB: latest?.HighScoreBearishOB,
    BullishBreaker: latest?.BullishBreaker,
    BearishBreaker: latest?.BearishBreaker,
    InducementSwept: latest?.InducementSwept,
    ValidatedLongSignal: latest?.ValidatedLongSignal,
    ValidatedShortSignal: latest?.ValidatedShortSignal,
  };
}

function _parseLines(graphic) {
  const lines = graphic?.dwglines ?? graphic?.dwgLines ?? graphic?.lines ?? {};
  const result = { slLines: [], tpLines: [], entryLines: [], structureLines: [], otherLines: [] };
  Object.values(lines).forEach(line => {
    if (line?.y1 === undefined && line?.y2 === undefined) return;
    const price = line.y1 ?? line.y2;
    const lineData = { price, x1: line.x1, x2: line.x2, style: line.st, extend: line.ex, color: line.ci };
    if (line.st === 'dotted' && line.ex === 'right') result.slLines.push(lineData);
    else if (line.st === 'solid' && line.ex === 'right') result.entryLines.push(lineData);
    else if (line.ex === 'right') result.tpLines.push(lineData);
    else result.structureLines.push(lineData);
  });
  return result;
}

function _parseBoxes(graphic) {
  // Accept TradingView's inconsistent key casing across indicator versions
  const boxes = graphic?.dwgboxes ?? graphic?.dwgBoxes ?? graphic?.boxes ?? graphic?.dwg_boxes ?? {};
  const result = { orderBlocks: [], fvgs: [], breakers: [], bprs: [], oteZones: [], other: [] };

  if (Object.keys(boxes).length === 0) {
    // No boxes found under any key — warn the caller
    result._warn = 'No dwgboxes found under any known key (dwgboxes, dwgBoxes, boxes, dwg_boxes)';
    return result;
  }

  // Build price-range stats for relative classification
  const allRanges = [];
  const working = [];

  Object.values(boxes).forEach(box => {
    let top = box?.top, bottom = box?.bottom;
    if (typeof top !== 'number' || typeof bottom !== 'number') {
      if (typeof box?.y1 === 'number' && typeof box?.y2 === 'number') {
        top = Math.max(box.y1, box.y2);
        bottom = Math.min(box.y1, box.y2);
      } else if (typeof box?.y === 'number') {
        top = bottom = box.y;
      } else {
        // Preserve raw data for diagnostics
        result.other.push({ _raw: box, _note: 'unrecognised coordinates' });
        return;
      }
    }
    const priceRange = Math.abs(top - bottom);
    if (priceRange === 0 && !box.t) return; // Text-only label marker
    allRanges.push(priceRange);
    working.push({ top, bottom, priceRange, box });
  });

  if (working.length === 0) {
    result._warn = `Found ${Object.keys(boxes).length} raw boxes but none with valid coordinates`;
    return result;
  }

  // Percentile-based thresholds adapt to any price scale (EURUSD 1.x vs BTC 100k)
  const sorted = [...allRanges].sort((a, b) => a - b);
  const pp = p => sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)] || 0;
  const p10 = pp(10), p33 = pp(33), p66 = pp(66);

  working.forEach(({ top, bottom, priceRange, box }) => {
    const boxData = {
      top: _round(top),
      bottom: _round(bottom),
      left: box.x1 ?? box.left,
      right: box.x2 ?? box.right,
      height: _round(priceRange),
      mid: _round((top + bottom) / 2),
      borderStyle: box.borderStyle ?? box.brstyle,
      borderColor: box.borderColor ?? box.bc,
      bgColor: box.bgcolor ?? box.c,
      text: box.t ?? '',
    };
    const isBullish = _isBullishColor(boxData.bgColor) || _isBullishColor(boxData.borderColor);
    const isBearish = _isBearishColor(boxData.bgColor) || _isBearishColor(boxData.borderColor);
    boxData.side = isBullish ? 'bull' : isBearish ? 'bear' : 'unknown';
    boxData.active = boxData.borderStyle === 'solid' ? true
      : boxData.borderStyle === 'dotted' ? false
      : null;

    // Classification via percentiles (adapts to any symbol's price scale)
    if (boxData.bgColor === null && boxData.borderStyle === 'solid') {
      result.fvgs.push(boxData);       // Border-only = inversion FVG / vacuum gap
    } else if (priceRange > 0 && priceRange <= p10 && boxData.bgColor !== null) {
      result.fvgs.push(boxData);       // Very narrow = FVG
    } else if (priceRange > p33 && priceRange <= p66 && boxData.active === false) {
      result.oteZones.push(boxData);   // Medium width, mitigated = OTE zone
    } else if (priceRange > p33 && priceRange <= p66 && boxData.active === true) {
      result.breakers.push(boxData);   // Medium width, active = breaker
    } else if (priceRange > p66 || (priceRange > p10 && boxData.bgColor !== null)) {
      result.orderBlocks.push(boxData); // Wide = OB or large structural box
    } else {
      result.other.push(boxData);
    }
  });

  // Carry thresholds for diagnostics
  result._meta = { thresholds: { p10, p33, p66 }, totalRaw: Object.keys(boxes).length, valid: working.length };
  return result;
}

function _isBullishColor(color) {
  if (!color || typeof color !== 'number') return false;
  const r = (color >> 16) & 0xFF, g = (color >> 8) & 0xFF, b = color & 0xFF;
  return g > r + 20 && g > b;
}

function _isBearishColor(color) {
  if (!color || typeof color !== 'number') return false;
  const r = (color >> 16) & 0xFF, g = (color >> 8) & 0xFF, b = color & 0xFF;
  return r > g + 20 && r > b;
}

function _extractLastBar(rawData) {
  const p = rawData?.periods || [];
  const latest = p[0];
  if (!latest) return null;
  return {
    timestamp: latest.$time ?? latest.time ?? null,
    open: latest.open ?? latest.o ?? null,
    high: latest.high ?? latest.max ?? latest.h ?? null,
    low: latest.low ?? latest.min ?? latest.l ?? null,
    close: latest.close ?? latest.c ?? null,
    volume: latest.volume ?? latest.v ?? null,
  };
}

function _extractStructureState(dashboard) {
  const fields = dashboard?.fields || {};
  const structure = fields['Structure:'] || fields['Structure'] || '';
  const lastBreak = fields['Last Break:'] || fields['Last Break'] || '';
  const htf = fields['HTF (240):'] || fields['HTF'] || '';
  const htfBreak = fields['HTF Break:'] || '';
  const activeOBs = fields['Active OBs:'] || fields['Active OBs'] || '0';
  const breakers = fields['Breakers:'] || '0';
  const fvgs = fields['Active FVGs:'] || fields['Active FVGs'] || '0';
  const zone = fields['Zone:'] || fields['Zone'] || '';

  let direction = null;
  if (/bearish/i.test(structure)) direction = 'bearish';
  else if (/bullish/i.test(structure)) direction = 'bullish';

  let lastBreakType = null;
  if (/BOS/i.test(lastBreak)) lastBreakType = 'bos';
  else if (/CHoCH/i.test(lastBreak)) lastBreakType = 'choch';

  return {
    direction,
    structureText: structure,
    lastBreak: lastBreakType,
    lastBreakText: lastBreak,
    htfDirection: /bullish/i.test(htf) ? 'bullish' : /bearish/i.test(htf) ? 'bearish' : null,
    htfBreak: htfBreak,
    activeOBs: parseInt(String(activeOBs).replace(/\D/g, ''), 10) || 0,
    breakers: parseInt(String(breakers).replace(/\D/g, ''), 10) || 0,
    activeFVGs: parseInt(String(fvgs).replace(/\D/g, ''), 10) || 0,
    zone,
  };
}

function _extractAlignment(dashboard) {
  const fields = dashboard?.fields || {};
  const alignment = fields['Alignment:'] || fields['Alignment'] || '';
  const isAligned = /aligned/i.test(alignment) && !/counter/i.test(alignment);
  const isCounterTrend = /counter/i.test(alignment);
  const minScore = fields['Min Score:'] || fields['Min Score'] || '';
  const scoreMatch = String(minScore).match(/(\d+)\s*\/\s*(\d+)/);

  return {
    raw: alignment,
    aligned: isAligned,
    counterTrend: isCounterTrend,
    score: scoreMatch ? { current: Number(scoreMatch[1]), max: Number(scoreMatch[2]) } : null,
  };
}

function _parseMeta(rawData, graphic, timeframe) {
  const boxes = (rawData?.boxes ?? {}) || (graphic?.dwgboxes ?? graphic?.dwgBoxes ?? graphic?.boxes ?? {});
  return {
    pineId: PINE_ID,
    scriptName: SCRIPT_NAME,
    timeframe: timeframe || '15m',
    labelCount: Object.keys(graphic?.dwglabels ?? graphic?.dwgLabels ?? graphic?.labels ?? {}).length,
    tableCount: Object.keys(graphic?.dwgtables ?? graphic?.dwgTables ?? graphic?.tables ?? {}).length,
    boxCount: Object.keys(boxes).length,
    lineCount: Object.keys(graphic?.dwglines ?? graphic?.dwgLines ?? graphic?.lines ?? {}).length,
    hasStrategyMetrics: Object.keys(rawData?.strategyReport?.performance || {}).length > 0,
    periodsCount: rawData?.periods?.length ?? 0,
  };
}

// ── enhanced intelligence ─────────────────────────────────────────
function _generateSignals(structureState, alignment, boxes, signals, lines) {
  const generated = [];
  const grades = signals.grades || [];
  const latestGrade = grades[0] || null;
  const entry = signals.markers?.entry?.price ?? lines.entryLines[0]?.price ?? null;
  const sl = signals.markers?.sl?.price ?? lines.slLines[0]?.price ?? null;
  const tp1 = signals.markers?.tp1?.price ?? lines.tpLines[0]?.price ?? null;

  if (!latestGrade) return generated;

  const isLong = latestGrade.direction === 'Long';
  const isShort = latestGrade.direction === 'Short';
  const direction = isLong ? 'long' : isShort ? 'short' : 'neutral';

  // Confluence: alignment + structure direction + grade
  let confluenceScore = 0.3;
  if (alignment.aligned) confluenceScore += 0.3;
  if (alignment.score && alignment.score.current >= alignment.score.max * 0.5) confluenceScore += 0.2;
  if (latestGrade.grade === 'A+' || latestGrade.grade === 'A') confluenceScore += 0.2;
  confluenceScore = _round(Math.min(confluenceScore, 0.99), 2);

  let confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.65 ? 'HIGH' : confluenceScore >= 0.50 ? 'MED' : 'LOW';

  if (entry !== null && sl !== null) {
    const risk = Math.abs(entry - sl);
    const rr = risk > 0 && tp1 !== null ? _round(Math.abs(tp1 - entry) / risk, 2) : 0;
    generated.push({
      rank: 1,
      setupType: 'smc_structure',
      direction,
      entryZone: { min: _round(entry * 0.999), max: _round(entry * 1.001) },
      optimalEntry: _round(entry),
      stopLoss: _round(sl),
      takeProfits: [{ method: 'tp1', price: tp1 }].filter(tp => tp.price !== null),
      riskReward: rr,
      confluenceScore,
      confidence,
      grade: latestGrade.grade,
      rationale: `${latestGrade.direction} ${latestGrade.grade} with ${structureState.structureText} structure. HTF: ${structureState.htfDirection || 'unknown'}. Alignment: ${alignment.raw}. Active OBs: ${structureState.activeOBs}, FVGs: ${structureState.activeFVGs}.`,
    });
  }

  // OB-based setups
  const relevantOBs = isLong
    ? boxes.orderBlocks.filter(b => b.side === 'bull' && b.active)
    : boxes.orderBlocks.filter(b => b.side === 'bear' && b.active);

  if (relevantOBs.length > 0) {
    const bestOB = relevantOBs[0];
    generated.push({
      rank: 2,
      setupType: 'order_block',
      direction,
      entryZone: { min: bestOB.bottom, max: bestOB.top },
      optimalEntry: bestOB.mid,
      stopLoss: isLong ? _round(bestOB.bottom * 0.998) : _round(bestOB.top * 1.002),
      takeProfits: [],
      riskReward: 0,
      confluenceScore: _round(confluenceScore * 0.8, 2),
      confidence: confluenceScore >= 0.70 ? 'MED' : 'LOW',
      rationale: `${isLong ? 'Bullish' : 'Bearish'} active order block at ${bestOB.bottom.toFixed(2)}-${bestOB.top.toFixed(2)}.`,
    });
  }

  return generated;
}

function _generateNarrative(structureState, alignment, boxes, dashboard, signals) {
  const parts = [];
  parts.push(`Structure is ${structureState.structureText} with last break ${structureState.lastBreakText || 'none'}.`);
  parts.push(`HTF structure: ${structureState.htfDirection || 'unknown'}.`);
  parts.push(`Alignment: ${alignment.raw || 'unknown'}.`);
  parts.push(`Active zones: ${structureState.activeOBs} OBs, ${structureState.breakers} breakers, ${structureState.activeFVGs} FVGs.`);

  const warnings = [];
  if (alignment.counterTrend) warnings.push('Counter-trend alignment — reduce size or avoid.');
  if (structureState.activeOBs === 0) warnings.push('No active order blocks — weak structural support.');
  if (structureState.zone === 'PREMIUM' && structureState.direction === 'bullish') warnings.push('Price in premium zone — bullish setups less favorable.');
  if (structureState.zone === 'DISCOUNT' && structureState.direction === 'bearish') warnings.push('Price in discount zone — bearish setups less favorable.');

  const watchlist = [];
  watchlist.push('Wait for price to enter discount/premium zone aligned with structure.');
  watchlist.push('Confirm with FVG or breaker block as confluence.');
  if (boxes.fvgs.length > 0) watchlist.push(`Watch ${boxes.fvgs.length} FVGs for displacement confirmation.`);

  return { marketStructure: parts.join(' '), primaryOpportunity: signals.grades[0] ? `${signals.grades[0].direction} ${signals.grades[0].grade} signal available.` : 'No grade signal. Look for OB + FVG confluence.', warnings, watchlist };
}

function _validateOutput(dashboard, signals, structureState) {
  const checks = [];
  const warnings = [];
  const hasDashboard = Object.keys(dashboard.fields || {}).length > 0;
  checks.push({ name: 'dashboard_present', passed: hasDashboard, detail: hasDashboard ? 'ok' : 'missing' });
  if (!hasDashboard) warnings.push('No dashboard detected.');
  checks.push({ name: 'structure_detected', passed: structureState.direction !== null, detail: structureState.direction || 'unknown' });
  const passed = checks.every(c => c.passed);
  return { passed, checks, warnings };
}

function _computeAgenticScore(structureState, alignment, boxes, signals) {
  let score = 0.2;
  if (structureState.direction !== null) score += 0.15;
  if (alignment.aligned) score += 0.2;
  if (signals.grades && signals.grades.length > 0) score += 0.15;
  if (boxes.orderBlocks.length > 0) score += 0.1;
  if (boxes.fvgs.length > 0) score += 0.1;
  if (structureState.activeOBs > 0) score += 0.1;
  return _round(Math.min(score, 0.99), 2);
}

// ── agent mode ────────────────────────────────────────────────────
function transformForAgentMode(result, args) {
  const { dashboard, signals, boxes, structureState, alignment, meta, enhanced, lastBar } = result;
  const now = new Date().toISOString();

  return {
    status: 'ok',
    exitCode: EXIT_CODES.SUCCESS,
    timestamp: now,
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: {
      workflow: 'ict-smc-structure', htfTimeframe: '240',
      modelVersion: 'agent-ready-v2',
      symbol: args?.symbol || 'unknown',
      timeframe: meta.timeframe || '15m',
    },
    market: {
      lastPrice: lastBar?.close,
      bias: structureState.direction,
      zone: structureState.zone,
    },
    structure: {
      direction: structureState.direction,
      text: structureState.structureText,
      lastBreak: structureState.lastBreak,
      lastBreakText: structureState.lastBreakText,
      htf: { direction: structureState.htfDirection, break: structureState.htfBreak },
      alignment: alignment,
      counts: {
        activeOBs: structureState.activeOBs,
        breakers: structureState.breakers,
        activeFVGs: structureState.activeFVGs,
      },
    },
    zones: {
      orderBlocks: boxes.orderBlocks.slice(0, 5),
      fvgs: boxes.fvgs.slice(0, 5),
      breakers: boxes.breakers.slice(0, 5),
      oteZones: boxes.oteZones.slice(0, 5),
    },
    signals: {
      grades: signals.grades.slice(0, 5).map(g => ({ direction: g.direction, grade: g.grade, price: g.price })),
      markers: signals.markers,
    },
    opportunities: enhanced.signals.map(s => {
      const distanceFromPrice = (s.optimalEntry && lastBar?.close) ? _round(Math.abs(s.optimalEntry - lastBar.close)) : null;
      const isStale = distanceFromPrice !== null && distanceFromPrice > (lastBar.close * 0.005);
      return {
        rank: s.rank,
        setup: s.setupType,
        direction: s.direction,
        confidence: s.confidence,
        confluenceScore: s.confluenceScore,
        grade: s.grade,
        entryZone: s.entryZone,
        optimalEntry: s.optimalEntry,
        stopLoss: s.stopLoss,
        takeProfits: s.takeProfits,
        riskReward: s.riskReward,
        distanceFromPrice,
        isStale,
        rationale: s.rationale,
      };
    }),
    narrative: enhanced.narrative,
    validation: enhanced.validation,
    conformance: {
      hasValidStructure: enhanced.validation.passed,
      htfAligned: alignment.aligned,
      hasStructuralZones: boxes.orderBlocks.length > 0 || boxes.fvgs.length > 0,
      agenticScore: enhanced.agenticScore,
    },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

// ── output formatting ─────────────────────────────────────────────
function printResults(result) {
  const { dashboard, signals, boxes, structureState, alignment, meta, enhanced, lastBar } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  ICT AUTO-VALIDATED SMC — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');

  console.log('\n📊 STRUCTURE');
  console.log(`   Direction:  ${structureState.direction?.toUpperCase() || 'UNKNOWN'}`);
  console.log(`   Last Break: ${structureState.lastBreakText || 'N/A'}`);
  console.log(`   HTF:        ${structureState.htfDirection?.toUpperCase() || 'UNKNOWN'}`);
  console.log(`   Alignment:  ${alignment.raw}`);
  console.log(`   Zone:       ${structureState.zone}`);
  if (lastBar?.close) console.log(`   Last Price: ${lastBar.close.toFixed(2)}`);

  console.log('\n📈 ZONE COUNTS');
  console.log(`   Active OBs:   ${structureState.activeOBs}`);
  console.log(`   Breakers:     ${structureState.breakers}`);
  console.log(`   Active FVGs:  ${structureState.activeFVGs}`);

  console.log('\n⚡ SIGNALS');
  if (signals.grades.length > 0) {
    signals.grades.slice(0, 5).forEach(g => {
      const emoji = g.direction === 'Long' ? '🟢' : '🔴';
      console.log(`   ${emoji} ${g.direction} ${g.grade} @ ${g.price?.toFixed(2) || 'N/A'}`);
    });
  } else {
    console.log('   No grade signals.');
  }

  console.log('\n📦 STRUCTURAL ZONES');
  if (boxes.orderBlocks.length > 0) {
    console.log(`   Order Blocks (${boxes.orderBlocks.length}):`);
    boxes.orderBlocks.slice(0, 3).forEach((b, i) => {
      console.log(`      ${i + 1}. ${b.side.toUpperCase()} ${b.active ? 'ACTIVE' : 'mitigated'} ${b.bottom.toFixed(2)}-${b.top.toFixed(2)}`);
    });
  }
  if (boxes.fvgs.length > 0) {
    console.log(`   FVGs (${boxes.fvgs.length}):`);
    boxes.fvgs.slice(0, 3).forEach((b, i) => {
      console.log(`      ${i + 1}. ${b.side.toUpperCase()} ${b.bottom.toFixed(2)}-${b.top.toFixed(2)}`);
    });
  }
  if (boxes.breakers.length > 0) {
    console.log(`   Breakers (${boxes.breakers.length}):`);
    boxes.breakers.slice(0, 3).forEach((b, i) => {
      console.log(`      ${i + 1}. ${b.side.toUpperCase()} ${b.bottom.toFixed(2)}-${b.top.toFixed(2)}`);
    });
  }

  if (enhanced.signals.length > 0) {
    console.log('\n🎯 GENERATED SIGNALS');
    enhanced.signals.forEach(s => {
      const emoji = s.direction === 'long' ? '🟢' : '🔴';
      console.log(`   ${emoji} #${s.rank} ${s.direction.toUpperCase()} ${s.setupType} | Confidence: ${s.confidence}`);
      console.log(`      ${s.rationale}`);
    });
  }

  if (enhanced.narrative.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS');
    enhanced.narrative.warnings.forEach(w => console.log(`   • ${w}`));
  }

  console.log('\nℹ️  META');
  console.log(`   pineId:      ${meta.pineId}`);
  console.log(`   Duration:    ${meta.durationMs}ms`);
  console.log(`   Agentic Score: ${enhanced.agenticScore}`);
  console.log('══════════════════════════════════════════════════════════════════════\n');
}

// ── WebSocket runner ──────────────────────────────────────────────
async function runWebSocket(symbol, tf, bars, inputs, startTime) {
  const session = process.env.SESSION || '';
  const signature = process.env.SIGNATURE || '';
  if (!session || !signature) throw new Error('SESSION and SIGNATURE env vars required');

  const normalizedTf = normalizeTf(tf);

  for (let attempt = 1; attempt <= 3; attempt++) {
    let client = null, chart = null, study = null;
    try {
      const indicator = await tv.getIndicator(PINE_ID, 'last', session, signature);
      client = new tv.Client({ token: session, signature, location: 'https://www.tradingview.com/' });
      await client.connect();
      const connected = await client.waitForConnected(20000);
      if (!connected) throw new Error('Connection timeout');

      chart = client.Session.Chart();
      const symbolReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Symbol load timeout (15s)')), 15000);
        chart.onSymbolLoaded(() => { clearTimeout(timer); resolve(); });
        chart.onError((err) => { clearTimeout(timer); reject(new Error(`Chart error: ${err?.message || JSON.stringify(err)}`)); });
      });

      chart.setMarket(symbol, { timeframe: normalizedTf, range: bars });
      await symbolReady;

      try {
        const existing = chart.getStudies ? chart.getStudies() : [];
        if (existing.length > 0) {
          console.log(`🧹 Removing ${existing.length} existing study/studies...`);
          if (chart.removeAllStudies) {
            await chart.removeAllStudies();
          } else {
            for (const s of existing) {
              try { chart.removeStudy(s.id); } catch {}
            }
          }
        }
      } catch (e) {}

      applyInputs(indicator, inputs);
      study = chart.Study(indicator);

      let updateCount = 0, resolved = false;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!resolved) {
            const periods = study.periods || [];
            if (periods.length > 0 || Object.keys(study.graphic || {}).length > 0) { resolved = true; resolve(); }
            else { reject(new Error('Timeout (45s)')); }
          }
        }, 45000);
        study.onError((err) => { clearTimeout(timer); if (!resolved) { resolved = true; reject(new Error(`Study error: ${err?.message || JSON.stringify(err)}`)); } });
        study.onUpdate(() => { updateCount++; if (updateCount >= 3 && !resolved) { resolved = true; clearTimeout(timer); resolve(); } });
      });

      const periods = (study.periods && study.periods[0]?.close != null)
        ? study.periods
        : (study.periods && chart.periods && chart.periods.length > 0)
          ? chart.periods
          : (study.periods || chart.periods || []);
      const rawData = { periods, graphic: study.graphic || {}, strategyReport: study.strategyReport || null, bars, raw: study };
      const parsed = parseOutput(rawData, tf);
      parsed.meta.durationMs = Date.now() - startTime;

      try { study.remove(); } catch {}
      try { chart.delete(); } catch {}
      try { client.end(); } catch {}
      return parsed;

    } catch (err) {
      const isLimit = /maximum number of studies/i.test(err.message);
      if (isLimit && attempt < 3) {
        console.log(`⚠️  Study limit hit (attempt ${attempt}/3), retrying in ${attempt * 3}s...`);
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

// ── main ──────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args._symbol && process.argv.length <= 2)) {
    printUsage();
    process.exit(0);
  }

  const startTime = Date.now();
  console.log('\n======================================================================');
  console.log(`📊 Running: ${PINE_ID}`);
  console.log(`   Symbol: ${args.symbol} | Timeframe: ${args.tf} | Bars: ${args.bars}`);
  console.log('======================================================================');

  const inputs = { ...PRESET_DEFAULT };
  args.inputs = inputs;
  console.log(`📝 Default inputs:`);
  console.log(JSON.stringify(inputs, null, 2));

  if (args.dryRun) {
    console.log('\n🏜️  DRY RUN — Skipping TradingView connection.');
    console.log(JSON.stringify({ status: 'dry_run', symbol: args.symbol, timeframe: args.tf, bars: args.bars, inputs, timestamp: new Date().toISOString() }, null, 2));
    process.exit(EXIT_CODES.SUCCESS);
  }

  try {
    const result = await runWebSocket(args.symbol, args.tf, args.bars, inputs, startTime);
    if (args.verbose) console.log(`\n✓ Completed in ${result.meta.durationMs}ms`);
    if (args.json) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      const json = JSON.stringify(output, null, 2);
      if (args.out) { fs.writeFileSync(args.out, json, 'utf8'); console.log(`✅ Saved JSON to ${args.out}`); }
      else console.log(json);
    } else {
      printResults(result);
    }
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) {
    const isCritical = /SESSION and SIGNATURE/i.test(err.message) || /connection/i.test(err.message);
    const code = isCritical ? EXIT_CODES.CRITICAL : EXIT_CODES.VALIDATION;
    console.error(`\n❌ Error ${code}: ${err.message}`);
    if (args.verbose && err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    process.exit(code);
  }
}

main().catch(err => {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
