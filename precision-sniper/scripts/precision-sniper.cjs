#!/usr/bin/env node
/**
 * Precision Sniper — Standalone Runner
 *
 * Usage:
 *   node precision-sniper.cjs BTCUSDT
 *   node precision-sniper.cjs BTCUSDT --tf 15m --bars 500
 *   node precision-sniper.cjs BTCUSDT --preset scalping
 *   node precision-sniper.cjs BTCUSDT --tf 1h --bars 1000 --json
 *   node precision-sniper.cjs BTCUSDT --agent
 *   node precision-sniper.cjs BTCUSDT --dry-run
 *
 * Presets: auto | conservative | default | aggressive | scalping | swing | crypto
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
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });

const tv = require(path.join(PROJECT_ROOT, 'tv-optimized.cjs'));
const { AgentOutput, enableSilentMode, isSilent } = require(path.join(PROJECT_ROOT, 'agent-output.cjs'));

const PINE_ID = 'PUB;1fc29950178c42a1a88f52a18161dd53';
const SCRIPT_NAME = 'Precision Sniper';
const PRESET_DEFAULT = {
  presetInput: 'Auto',
  emaFastLenInput: 9,
  emaSlowLenInput: 21,
  emaTrendLenInput: 55,
  minScoreInput: 5,
  rsiLenInput: 13,
  atrLenInput: 14,
  slMultInput: 1.5,
  tp1MultInput: 1.0,
  tp2MultInput: 2.0,
  tp3MultInput: 3.0,
  useTrailInput: true,
  useStructureSLInput: true,
  swingLookbackInput: 10,
};

const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };


function exitWithError(code, message) {
  console.error(`\n❌ Error ${code}: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    _symbol: argv[0]?.toUpperCase() || null,
    symbol: 'BTCUSDT',
    tf: '15m',
    bars: 500,
    preset: 'auto',
    json: false,
    out: null,
    agent: false,
    verbose: false,
    dryRun: false,
    silent: false,
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
    else if (a === '--preset' && argv[i + 1]) { args.preset = argv[++i]; }
    else if (a === '--json') { args.json = true; }
    else if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; }
    else if (a === '--agent') { args.json = true; args.agent = true; }
    else if (a === '--verbose' || a === '-v') { args.verbose = true; }
    else if (a === '--dry-run') { args.dryRun = true; }
    else if (a === '--silent') { args.silent = true; }
    else if (a === '--help' || a === '-h') { args.help = true; }
  }
  return args;
}

function printUsage() {
  console.log(`
Precision Sniper — Standalone Runner
=====================================

Usage:
  node precision-sniper.cjs <SYMBOL> [options]

Arguments:
  SYMBOL                    Trading pair (default: BTCUSDT)

Options:
  --tf <timeframe>          Timeframe (default: 15m)
  --bars <n>                Number of chart bars (default: 500)
  --preset <name>           Preset: auto, conservative, default, aggressive, scalping, swing, crypto (default: auto)
  --json                    Output JSON
  --agent                   Agent mode
  --out <file>              Write JSON to file
  --verbose, -v             Verbose output
  --dry-run                 Skip connection
  --help, -h                Show this help

Examples:
  node precision-sniper.cjs BTCUSDT
  node precision-sniper.cjs ETHUSDT --preset scalping --tf 5m
  node precision-sniper.cjs BTCUSDT --agent
`);
}

function loadPreset(name) {
  const presets = {
    auto: { presetInput: 'Auto' },
    conservative: { presetInput: 'Conservative', minScoreInput: 7, slMultInput: 2.0 },
    default: { ...PRESET_DEFAULT },
    aggressive: { presetInput: 'Aggressive', minScoreInput: 3, slMultInput: 1.2 },
    scalping: { presetInput: 'Scalping', emaFastLenInput: 5, emaSlowLenInput: 13, atrLenInput: 10, slMultInput: 1.2 },
    swing: { presetInput: 'Swing', emaFastLenInput: 21, emaSlowLenInput: 55, emaTrendLenInput: 200, atrLenInput: 21, slMultInput: 2.5 },
    crypto: { presetInput: 'Crypto 24/7', slMultInput: 2.0 },
  };
  return presets[name] || presets.auto;
}

const INPUT_MAP = [
  { variable: 'sourceInput', tvInputId: 'in_0', type: 'source', default: 'close' },
  { variable: 'htfInput', tvInputId: 'in_1', type: 'timeframe', default: '' },
  { variable: 'presetInput', tvInputId: 'in_2', type: 'string', default: 'Auto' },
  { variable: 'emaFastLenInput', tvInputId: 'in_3', type: 'int', default: 9 },
  { variable: 'emaSlowLenInput', tvInputId: 'in_4', type: 'int', default: 21 },
  { variable: 'emaTrendLenInput', tvInputId: 'in_5', type: 'int', default: 55 },
  { variable: 'minScoreInput', tvInputId: 'in_6', type: 'int', default: 5 },
  { variable: 'rsiLenInput', tvInputId: 'in_7', type: 'int', default: 13 },
  { variable: 'gradeFilterInput', tvInputId: 'in_8', type: 'string', default: 'All' },
  { variable: 'hideCGradeInput', tvInputId: 'in_9', type: 'bool', default: true },
  { variable: 'atrLenInput', tvInputId: 'in_10', type: 'int', default: 14 },
  { variable: 'slMultInput', tvInputId: 'in_11', type: 'float', default: 1.5 },
  { variable: 'tp1MultInput', tvInputId: 'in_12', type: 'float', default: 1 },
  { variable: 'tp2MultInput', tvInputId: 'in_13', type: 'float', default: 2 },
  { variable: 'tp3MultInput', tvInputId: 'in_14', type: 'float', default: 3 },
  { variable: 'useTrailInput', tvInputId: 'in_15', type: 'bool', default: true },
  { variable: 'useStructureSLInput', tvInputId: 'in_16', type: 'bool', default: true },
  { variable: 'swingLookbackInput', tvInputId: 'in_17', type: 'int', default: 10 },
  { variable: 'themeInput', tvInputId: 'in_18', type: 'string', default: 'Auto' },
  { variable: 'showSignalsInput', tvInputId: 'in_19', type: 'bool', default: true },
  { variable: 'signalSizeInput', tvInputId: 'in_20', type: 'string', default: 'Small' },
  { variable: 'showTPSLInput', tvInputId: 'in_21', type: 'bool', default: true },
  { variable: 'showRibbonInput', tvInputId: 'in_22', type: 'bool', default: true },
  { variable: 'showTrailInput', tvInputId: 'in_23', type: 'bool', default: true },
  { variable: 'showBgInput', tvInputId: 'in_24', type: 'bool', default: false },
  { variable: 'showWatermarkInput', tvInputId: 'in_25', type: 'bool', default: true },
  { variable: 'showGradeInput', tvInputId: 'in_26', type: 'bool', default: true },
  { variable: 'labelOffsetInput', tvInputId: 'in_27', type: 'int', default: 20 },
  { variable: 'showDashInput', tvInputId: 'in_28', type: 'bool', default: true },
  { variable: 'showBtDashInput', tvInputId: 'in_29', type: 'bool', default: true },
  { variable: 'dashPosStr', tvInputId: 'in_30', type: 'string', default: 'Top Right' },
  { variable: 'webhookInput', tvInputId: 'in_31', type: 'bool', default: false },
  { variable: 'bullColorInput', tvInputId: 'in_32', type: 'color', default: '#00E676' },
  { variable: 'bearColorInput', tvInputId: 'in_33', type: 'color', default: '#FF5252' },
  { variable: 'neutralColorInput', tvInputId: 'in_34', type: 'color', default: '#FFEB3B' }
];

function applyInputs(indicator, inputs) {
  if (!inputs || Object.keys(inputs).length === 0) return;
  AgentOutput.info(`📝 Applying input overrides...`);
  for (const [key, value] of Object.entries(inputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) { AgentOutput.warn(`   ⚠️  Unknown input: ${key}`); continue; }
    try {
      const tvInputDef = indicator.inputs[mapping.tvInputId];
      if (!tvInputDef) { AgentOutput.warn(`   ⚠️  Input ${key} not in indicator`); continue; }
      const typed = _coerce(value, mapping.type);
      indicator.setOption(mapping.tvInputId, typed);
      AgentOutput.info(`   ✅ ${key} → ${mapping.tvInputId}: ${JSON.stringify(value)} → ${JSON.stringify(typed)} (${tvInputDef.type})`);
    } catch (e) {
      AgentOutput.warn(`   ⚠️  ${key} failed: ${e.message}`);
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
  const graphic = rawData?.graphic ?? {};
  const dashboard = _parseDashboard(graphic);
  const signals = _parseSignals(graphic);
  const numerical = _parseNumerical(rawData);
  const lines = _parseLines(graphic);
  const meta = _parseMeta(rawData, graphic, timeframe);
  const lastBar = _extractLastBar(rawData);

  const trendState = _extractTrendState(dashboard, numerical);
  const tradePlan = _extractTradePlan(signals, lines);
  const enhanced = {
    trendState,
    tradePlan,
    signals: _generateSignals(signals, trendState, tradePlan, dashboard),
    narrative: _generateNarrative(trendState, signals, dashboard, tradePlan),
    validation: _validateOutput(dashboard, signals, trendState),
    agenticScore: _computeAgenticScore(signals, trendState, dashboard),
  };

  return { dashboard, signals, numerical, lines, meta, lastBar, trendState, enhanced };
}

function _parseDashboard(graphic) {
  const tables = graphic?.dwgtables ?? {};
  const cells = graphic?.dwgtablecells ?? {};
  const tableId = Object.keys(tables).find(id => tables[id]?.pos === 'top_right');
  if (!tableId) return { fields: {}, rawRows: [] };

  const tableCells = [];
  Object.values(cells).forEach(cell => {
    if (String(cell?.tid) === String(tableId)) tableCells.push(cell);
  });
  if (tableCells.length === 0) return { fields: {}, rawRows: [] };

  let maxRow = 0, maxCol = 0;
  tableCells.forEach(cell => {
    if (cell.row > maxRow) maxRow = cell.row;
    if (cell.col > maxCol) maxCol = cell.col;
  });

  const grid = [];
  for (let r = 0; r <= maxRow; r++) grid[r] = new Array(maxCol + 1).fill(null);
  tableCells.forEach(cell => { if (grid[cell.row]) grid[cell.row][cell.col] = cell.t ?? ''; });

  const fields = {};
  const rawRows = [];
  grid.forEach(row => {
    if (row && row[0] !== null) {
      const key = row[0];
      const value = row[1] ?? '';
      if (key) fields[key] = value;
      rawRows.push(row.filter(item => item !== null));
    }
  });
  return { fields, rawRows };
}

function _parseSignals(graphic) {
  const labels = graphic?.dwglabels ?? {};
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
        barIndex: label.x,
        price: label.y,
      });
    }
    const markerTypes = ['ENTRY', 'SL', 'TP1', 'TP2', 'TP3', 'TRAIL'];
    markerTypes.forEach(type => {
      if (text.includes(type)) {
        markers[type.toLowerCase()] = {
          price: label.y,
          text,
          barIndex: label.x,
          timestamp: label.x ? label.x * 1000 : null,
        };
      }
    });
  });

  grades.sort((a, b) => (b.barIndex ?? 0) - (a.barIndex ?? 0));
  return { grades, markers };
}

function _parseNumerical(rawData) {
  const periods = rawData?.periods ?? [];
  const latest = periods[0] ?? {};
  return {
    timestamp: latest.timestamp,
    datetime: latest.datetime,
    emaFast: latest.EMAFast,
    emaFastColor: latest.EMAFast_colorer,
    emaSlow: latest.EMASlow,
    emaSlowColor: latest.EMASlow_colorer,
    emaTrend: latest.EMATrend,
    emaTrendColor: latest.EMATrend_colorer,
    fillColor: latest.fill_0_colorer,
    trendBackground: latest.TrendBackground,
  };
}

function _parseMeta(rawData, graphic, timeframe) {
  return {
    pineId: PINE_ID,
    scriptName: SCRIPT_NAME,
    timeframe: timeframe || '15m',
    periodCount: rawData?.periods?.length ?? 0,
    labelCount: Object.keys(graphic?.dwglabels ?? {}).length,
    tableCount: Object.keys(graphic?.dwgtables ?? {}).length,
    cellCount: Object.keys(graphic?.dwgtablecells ?? {}).length,
    lineCount: Object.keys(graphic?.dwglines ?? {}).length,
  };
}

function _parseLines(graphic) {
  const lines = graphic?.dwglines ?? {};
  const result = { entryLines: [], slLines: [], tpLines: [], trailLines: [], otherLines: [] };
  Object.values(lines).forEach(line => {
    if (line?.y1 === undefined && line?.y2 === undefined) return;
    const price = line.y1 ?? line.y2;
    const lineData = { price, x1: line.x1, x2: line.x2, style: line.st, color: line.ci, extend: line.ex };
    if (line.ex === 'right') {
      if (line.st === 'solid' || line.st === null) result.entryLines.push(lineData);
      else if (line.st === 'dotted') result.slLines.push(lineData);
      else result.tpLines.push(lineData);
    } else {
      result.otherLines.push(lineData);
    }
  });
  return result;
}

function _extractTrendState(dashboard, numerical) {
  const fields = dashboard?.fields || {};
  const trend = fields.Trend || '';
  const scoreRaw = fields.Score || '';
  const htfBias = fields['HTF Bias'] || '';
  const adx = fields.ADX || '';
  const volatility = fields.Volatility || '';

  let direction = null;
  if (/bullish/i.test(trend)) direction = 'bullish';
  else if (/bearish/i.test(trend)) direction = 'bearish';
  else direction = 'neutral';

  let score = 0;
  const scoreMatch = String(scoreRaw).match(/(\d+)\s*\/\s*10/);
  if (scoreMatch) score = Number(scoreMatch[1]);

  let adxValue = null;
  const adxMatch = String(adx).match(/([\d.]+)/);
  if (adxMatch) adxValue = Number(adxMatch[1]);

  return {
    direction,
    trendText: trend,
    score,
    htfBias,
    adx: adxValue,
    volatility,
    emaFast: numerical.emaFast,
    emaSlow: numerical.emaSlow,
    emaTrend: numerical.emaTrend,
  };
}

function _extractTradePlan(signals, lines) {
  const markers = signals?.markers || {};
  const latestGrade = signals?.grades?.[0] || null;
  const entry = markers.entry?.price ?? lines.entryLines[0]?.price ?? null;
  const sl = markers.sl?.price ?? lines.slLines[0]?.price ?? null;
  const tp1 = markers.tp1?.price ?? lines.tpLines[0]?.price ?? null;
  const tp2 = markers.tp2?.price ?? null;
  const tp3 = markers.tp3?.price ?? null;

  const plan = { direction: latestGrade?.direction?.toLowerCase() || null, entry, sl, tp1, tp2, tp3 };
  if (entry !== null && sl !== null) {
    plan.riskDistance = Math.abs(entry - sl);
    if (plan.riskDistance > 0 && tp1 !== null) {
      plan.tp1R = _round(Math.abs(tp1 - entry) / plan.riskDistance, 2);
    }
  }
  return plan;
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

// ── enhanced intelligence ─────────────────────────────────────────
function _generateSignals(signals, trendState, tradePlan, dashboard) {
  const generated = [];
  const grades = signals.grades || [];
  if (grades.length === 0) return generated;

  const latest = grades[0];
  const gradeValue = latest.grade === 'A+' ? 1.0 : latest.grade === 'A' ? 0.9 : latest.grade === 'B' ? 0.7 : 0.5;
  const trendAligned = (trendState.direction === 'bullish' && latest.direction === 'Long') ||
                       (trendState.direction === 'bearish' && latest.direction === 'Short');
  const htfAligned = trendState.htfBias.toLowerCase().includes(trendState.direction || '');

  let confluenceScore = _round(gradeValue * 0.5 + (trendAligned ? 0.25 : 0) + (htfAligned ? 0.15 : 0) + (trendState.adx && trendState.adx > 25 ? 0.1 : 0), 2);

  let confidence;
  if (confluenceScore >= 0.85) confidence = 'STRONG';
  else if (confluenceScore >= 0.70) confidence = 'HIGH';
  else if (confluenceScore >= 0.55) confidence = 'MED';
  else confidence = 'LOW';

  if (tradePlan.entry !== null && tradePlan.sl !== null) {
    const risk = Math.abs(tradePlan.entry - tradePlan.sl);
    const rr = risk > 0 && tradePlan.tp1 !== null ? _round(Math.abs(tradePlan.tp1 - tradePlan.entry) / risk, 2) : 0;
    generated.push({
      rank: 1,
      setupType: 'ema_confluence',
      direction: latest.direction === 'Long' ? 'long' : 'short',
      entryZone: { min: _round(tradePlan.entry * 0.999), max: _round(tradePlan.entry * 1.001) },
      optimalEntry: _round(tradePlan.entry),
      stopLoss: _round(tradePlan.sl),
      takeProfits: [
        { method: 'tp1', price: tradePlan.tp1 },
        { method: 'tp2', price: tradePlan.tp2 },
        { method: 'tp3', price: tradePlan.tp3 },
      ].filter(tp => tp.price !== null),
      riskReward: rr,
      confluenceScore,
      confidence,
      grade: latest.grade,
      rationale: `${latest.direction} ${latest.grade} grade signal. EMA confluence score ${trendState.score}/10. ${trendAligned ? 'Aligned' : 'Counter'} to ${trendState.direction} trend. HTF bias: ${trendState.htfBias}.`,
    });
  }

  return generated;
}

function _generateNarrative(trendState, signals, dashboard, tradePlan) {
  const parts = [];
  parts.push(`Market trend is ${trendState.direction} with EMA confluence score ${trendState.score}/10.`);
  parts.push(`HTF bias: ${trendState.htfBias}. Volatility: ${trendState.volatility}.`);

  const grades = signals.grades || [];
  if (grades.length > 0) {
    parts.push(`Latest signal: ${grades[0].direction} ${grades[0].grade} (${grades.length} total grades).`);
  } else {
    parts.push('No grade signals detected.');
  }

  const warnings = [];
  if (trendState.score < 5) warnings.push('Low confluence score — weak signal quality.');
  if (trendState.adx !== null && trendState.adx < 20) warnings.push('Low ADX — weak trend strength, avoid chasing.');
  if (!tradePlan.entry) warnings.push('No active trade plan — wait for setup.');

  const watchlist = [];
  watchlist.push('Watch for A+ or A grade signals for highest confidence.');
  watchlist.push(`Monitor HTF bias alignment with ${trendState.htfBias}.`);

  return { marketStructure: parts.join(' '), primaryOpportunity: tradePlan.entry ? `Active ${tradePlan.direction} at ${tradePlan.entry.toFixed(2)}` : 'No active trade plan.', warnings, watchlist };
}

function _validateOutput(dashboard, signals, trendState) {
  const checks = [];
  const warnings = [];
  const hasDashboard = Object.keys(dashboard.fields || {}).length > 0;
  checks.push({ name: 'dashboard_present', passed: hasDashboard, detail: hasDashboard ? 'ok' : 'missing' });
  if (!hasDashboard) warnings.push('No dashboard detected.');
  checks.push({ name: 'trend_state', passed: trendState.direction !== null, detail: trendState.direction || 'unknown' });
  const hasGrades = signals.grades && signals.grades.length > 0;
  checks.push({ name: 'grades_present', passed: hasGrades, detail: hasGrades ? `${signals.grades.length} grades` : 'none' });
  const passed = checks.every(c => c.passed);
  return { passed, checks, warnings };
}

function _computeAgenticScore(signals, trendState, dashboard) {
  let score = 0.2;
  if (signals.grades && signals.grades.length > 0) score += 0.2;
  if (trendState.score >= 7) score += 0.2;
  else if (trendState.score >= 5) score += 0.1;
  if (trendState.adx && trendState.adx > 25) score += 0.1;
  if (trendState.htfBias.toLowerCase().includes(trendState.direction || '')) score += 0.1;
  if (trendState.direction !== null && trendState.direction !== 'neutral') score += 0.1;
  return _round(Math.min(score, 0.99), 2);
}

// ── agent mode ────────────────────────────────────────────────────
function transformForAgentMode(result, args) {
  const { dashboard, signals, trendState, meta, enhanced, lastBar } = result;
  const now = new Date().toISOString();

  return {
    status: 'ok',
    exitCode: EXIT_CODES.SUCCESS,
    timestamp: now,
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: {
      workflow: 'ema-confluence-sniper', htfTimeframe: args?.inputs?.htfInput || 'auto',
      modelVersion: 'agent-ready-v2',
      symbol: args?.symbol || 'unknown',
      timeframe: meta.timeframe || '15m',
    },
    market: {
      lastPrice: lastBar?.close,
      bias: trendState.direction,
      htfBias: trendState.htfBias,
      score: trendState.score,
      adx: trendState.adx,
      volatility: trendState.volatility,
    },
    structure: {
      emaFast: trendState.emaFast,
      emaSlow: trendState.emaSlow,
      emaTrend: trendState.emaTrend,
    },
    signals: {
      grades: signals.grades.slice(0, 5).map(g => ({ direction: g.direction, grade: g.grade, price: g.price })),
      markers: signals.markers,
    },
    opportunities: enhanced.signals.map(s => {
      const lastPrice = lastBar?.close ?? 0;
      const distanceFromPrice = (s.optimalEntry && lastPrice) ? _round(Math.abs(s.optimalEntry - lastPrice)) : null;
      const isStale = distanceFromPrice !== null && distanceFromPrice > (lastPrice * 0.005);
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
        rationale: s.rationale + (isStale ? ` ⚠️ Signal is ${distanceFromPrice} away from current price — stale.` : ''),
      };
    }),
    tradePlan: enhanced.tradePlan,
    narrative: enhanced.narrative,
    validation: enhanced.validation,
    conformance: {
      hasValidStructure: enhanced.validation.passed,
      hasQualitySignal: trendState.score >= 5,
      htfAligned: trendState.htfBias.toLowerCase().includes(trendState.direction || ''),
      agenticScore: enhanced.agenticScore,
    },
    schemaVersion: 'agent-ready-v2.0.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'ema-confluence-sniper',
    },
  };
}

// ── output formatting ─────────────────────────────────────────────
function printResults(result) {
  const { dashboard, signals, trendState, lines, meta, enhanced, lastBar } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  PRECISION SNIPER — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');

  console.log('\n📊 MARKET STATE');
  console.log(`   Trend:      ${trendState.direction?.toUpperCase() || 'UNKNOWN'}`);
  console.log(`   Score:      ${trendState.score}/10`);
  console.log(`   HTF Bias:   ${trendState.htfBias}`);
  console.log(`   ADX:        ${trendState.adx ?? 'N/A'}`);
  console.log(`   Volatility: ${trendState.volatility}`);
  if (lastBar?.close) console.log(`   Last Price: ${lastBar.close.toFixed(2)}`);

  console.log('\n⚡ GRADE SIGNALS');
  if (signals.grades.length > 0) {
    signals.grades.slice(0, 5).forEach((g, i) => {
      const emoji = g.direction === 'Long' ? '🟢' : '🔴';
      console.log(`   ${emoji} ${g.direction} ${g.grade} @ ${g.price?.toFixed(2) || 'N/A'}`);
    });
  } else {
    console.log('   No grade signals.');
  }

  console.log('\n🎯 TRADE PLAN');
  if (enhanced.tradePlan.entry) {
    console.log(`   Direction: ${enhanced.tradePlan.direction}`);
    console.log(`   Entry:     ${enhanced.tradePlan.entry.toFixed(2)}`);
    console.log(`   SL:        ${enhanced.tradePlan.sl?.toFixed(2) || 'N/A'}`);
    console.log(`   TP1:       ${enhanced.tradePlan.tp1?.toFixed(2) || 'N/A'}`);
  } else {
    console.log('   No active trade plan.');
  }

  if (enhanced.signals.length > 0) {
    console.log('\n🎯 GENERATED SIGNALS');
    enhanced.signals.forEach(s => {
      const emoji = s.direction === 'long' ? '🟢' : '🔴';
      console.log(`   ${emoji} #${s.rank} ${s.direction.toUpperCase()} ${s.grade} | Confidence: ${s.confidence} | R/R: ${s.riskReward}`);
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
          AgentOutput.info(`🧹 Removing ${existing.length} existing study/studies...`);
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
        AgentOutput.info(`⚠️  Study limit hit (attempt ${attempt}/3), retrying in ${attempt * 3}s...`);
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
  if (args.silent || args.agent) enableSilentMode(true);

  if (args.help || (!args._symbol && process.argv.length <= 2)) {
    printUsage();
    process.exit(0);
  }

  const startTime = Date.now();
  AgentOutput.info('\n======================================================================');
  AgentOutput.info(`📊 Running: ${PINE_ID}`);
  AgentOutput.info(`   Symbol: ${args.symbol} | Timeframe: ${args.tf} | Bars: ${args.bars}`);
  AgentOutput.info('======================================================================');

  const inputs = loadPreset(args.preset);
  args.inputs = inputs;
  AgentOutput.info(`📝 Input overrides (${args.preset} preset):`);
  AgentOutput.info(JSON.stringify(inputs, null, 2));

  if (args.dryRun) {
    const dry = JSON.stringify({ status: 'dry_run', symbol: args.symbol, timeframe: args.tf, bars: args.bars, inputs, timestamp: new Date().toISOString() }, null, 2);
    if (args.json) console.log(dry);
    else {
      AgentOutput.info('\n🏜️  DRY RUN — Skipping TradingView connection.');
      AgentOutput.info(dry);
    }
    process.exit(EXIT_CODES.SUCCESS);
  }

  try {
    const result = await runWebSocket(args.symbol, args.tf, args.bars, inputs, startTime);
    if (args.verbose) AgentOutput.info(`\n✓ Completed in ${result.meta.durationMs}ms`);
    if (args.json || args.agent) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      AgentOutput.emit(output, { outPath: args.out, pretty: !isSilent() });
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
