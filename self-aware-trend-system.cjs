#!/usr/bin/env node
/**
 * Self-Aware Trend System [WillyAlgoTrader] — Standalone Runner
 *
 * Usage:
 *   node self-aware-trend-system.cjs BTCUSDT
 *   node self-aware-trend-system.cjs BTCUSDT --tf 15m --bars 500
 *   node self-aware-trend-system.cjs BTCUSDT --preset scalping
 *   node self-aware-trend-system.cjs BTCUSDT --tf 1h --bars 1000 --json
 *   node self-aware-trend-system.cjs BTCUSDT --agent
 *   node self-aware-trend-system.cjs BTCUSDT --dry-run
 *
 * Presets: auto | scalping | default | swing | crypto
 */

const fs = require('fs');
const path = require('path');

// ── paths ─────────────────────────────────────────────────────────
const SCRIPT_DIR = path.dirname(__filename);

// Load env from project root (tv.cjs needs SESSION + SIGNATURE)
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env') });

const tv = require('./tv-optimized.cjs');
const { AgentOutput, enableSilentMode, isSilent } = require('./agent-output.cjs');

// ── constants ─────────────────────────────────────────────────────
const PINE_ID = 'PUB;0f80bcf05d544d4c98fde06faab1c976';
const SCRIPT_NAME = 'Self-Aware Trend System [WillyAlgoTrader]';
const PRESET_DEFAULT = {
  presetInput: 'Default',
  atrLenInput: 13,
  baseMultInput: 2.0,
  sourceInput: 'close',
  useTqiInput: true,
  qualityStrengthInput: 0.4,
  useCharFlipInput: true,
};

// Exit codes
const EXIT_CODES = {
  SUCCESS: 0,
  CRITICAL: 1,
  NO_DATA: 2,
  TIMEOUT: 3,
  VALIDATION: 4,
};

function exitWithError(code, message) {
  AgentOutput.error(`\n❌ Error ${code}: ${message}`);
  process.exit(code);
}

function exitWithStatus(status, message) {
  if (message) AgentOutput.error(`\n${message}`);
  process.exit(status);
}

// ── CLI parser ────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    _symbol: argv[0]?.toUpperCase() || null,
    symbol: 'BTCUSDT',
    tf: '15m',
    bars: 500,
    preset: 'default',
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
Self-Aware Trend System [WillyAlgoTrader] — Standalone Runner
===============================================================

Usage:
  node self-aware-trend-system.cjs <SYMBOL> [options]

Arguments:
  SYMBOL                    Trading pair (default: BTCUSDT)

Options:
  --tf <timeframe>          Timeframe: 1m, 5m, 15m, 1h, 4h, 1D (default: 15m)
  --bars <n>                Number of chart bars (default: 500)
  --preset <name>           Preset: auto, scalping, default, swing, crypto (default: default)
  --json                    Output JSON instead of table
  --agent                   Agent mode (simplified JSON, optimized for AI agents)
  --out <file>              Write JSON to file
  --verbose, -v             Verbose output for debugging
  --silent                  Suppress all non-JSON stdout (use with --json or --agent)
  --dry-run                 Skip TradingView connection, show parsed args only
  --help, -h                Show this help

Examples:
  node self-aware-trend-system.cjs BTCUSDT
  node self-aware-trend-system.cjs ETHUSDT --tf 1h --bars 1000
  node self-aware-trend-system.cjs SOLUSDT --preset scalping --json --out sol.json
  node self-aware-trend-system.cjs BTCUSDT --agent

Exit Codes:
  0  = Success
  1  = Critical error (missing credentials, connection failed)
  2  = No data
  3  = Timeout / cancelled
  4  = Validation error
`);
}

function loadPreset(name) {
  const presets = {
    auto: { presetInput: 'Auto', atrLenInput: 13, baseMultInput: 2.0 },
    scalping: { presetInput: 'Scalping', atrLenInput: 10, baseMultInput: 1.5, qualityStrengthInput: 0.5 },
    default: { ...PRESET_DEFAULT },
    swing: { presetInput: 'Swing', atrLenInput: 21, baseMultInput: 2.5, qualityStrengthInput: 0.3 },
    crypto: { presetInput: 'Crypto 24/7', atrLenInput: 13, baseMultInput: 2.0 },
  };
  return presets[name] || presets.default;
}

// ── input mapping ─────────────────────────────────────────────────
const INPUT_MAP = [
  { variable: 'presetInput', tvInputId: 'in_0', type: 'string', default: 'Auto' },
  { variable: 'atrLenInput', tvInputId: 'in_1', type: 'int', default: 13 },
  { variable: 'baseMultInput', tvInputId: 'in_2', type: 'float', default: 2 },
  { variable: 'sourceInput', tvInputId: 'in_3', type: 'source', default: 'close' },
  { variable: 'useAdaptiveInput', tvInputId: 'in_4', type: 'bool', default: true },
  { variable: 'erLengthInput', tvInputId: 'in_5', type: 'int', default: 20 },
  { variable: 'adaptStrengthInput', tvInputId: 'in_6', type: 'float', default: 0.5 },
  { variable: 'atrBaselineLenInput', tvInputId: 'in_7', type: 'int', default: 100 },
  { variable: 'useTqiInput', tvInputId: 'in_8', type: 'bool', default: true },
  { variable: 'qualityStrengthInput', tvInputId: 'in_9', type: 'float', default: 0.4 },
  { variable: 'qualityCurveInput', tvInputId: 'in_10', type: 'float', default: 1.5 },
  { variable: 'multSmoothInput', tvInputId: 'in_11', type: 'bool', default: true },
  { variable: 'useAsymBandsInput', tvInputId: 'in_12', type: 'bool', default: true },
  { variable: 'asymStrengthInput', tvInputId: 'in_13', type: 'float', default: 0.5 },
  { variable: 'useEffAtrInput', tvInputId: 'in_14', type: 'bool', default: true },
  { variable: 'useCharFlipInput', tvInputId: 'in_15', type: 'bool', default: true },
  { variable: 'charFlipMinAgeInput', tvInputId: 'in_16', type: 'int', default: 5 },
  { variable: 'charFlipHighInput', tvInputId: 'in_17', type: 'float', default: 0.55 },
  { variable: 'charFlipLowInput', tvInputId: 'in_18', type: 'float', default: 0.25 },
  { variable: 'tqiWeightErInput', tvInputId: 'in_19', type: 'float', default: 0.35 },
  { variable: 'tqiWeightVolInput', tvInputId: 'in_20', type: 'float', default: 0.2 },
  { variable: 'tqiWeightStructInput', tvInputId: 'in_21', type: 'float', default: 0.25 },
  { variable: 'tqiWeightMomInput', tvInputId: 'in_22', type: 'float', default: 0.2 },
  { variable: 'tqiStructLenInput', tvInputId: 'in_23', type: 'int', default: 20 },
  { variable: 'tqiMomLenInput', tvInputId: 'in_24', type: 'int', default: 10 },
  { variable: 'useStructureInput', tvInputId: 'in_25', type: 'bool', default: true },
  { variable: 'pivotLenInput', tvInputId: 'in_26', type: 'int', default: 3 },
  { variable: 'useRsiInput', tvInputId: 'in_27', type: 'bool', default: true },
  { variable: 'rsiLenInput', tvInputId: 'in_28', type: 'int', default: 14 },
  { variable: 'rsiOBInput', tvInputId: 'in_29', type: 'int', default: 70 },
  { variable: 'rsiOSInput', tvInputId: 'in_30', type: 'int', default: 30 },
  { variable: 'rsiLookbackInput', tvInputId: 'in_31', type: 'int', default: 20 },
  { variable: 'useVolInput', tvInputId: 'in_32', type: 'bool', default: true },
  { variable: 'volLenInput', tvInputId: 'in_33', type: 'int', default: 20 },
  { variable: 'minScoreInput', tvInputId: 'in_34', type: 'int', default: 60 },
  { variable: 'showRiskInput', tvInputId: 'in_35', type: 'bool', default: true },
  { variable: 'slAtrMultInput', tvInputId: 'in_36', type: 'float', default: 1.5 },
  { variable: 'tpModeInput', tvInputId: 'in_37', type: 'string', default: 'Fixed' },
  { variable: 'tp1RInput', tvInputId: 'in_38', type: 'float', default: 1 },
  { variable: 'tp2RInput', tvInputId: 'in_39', type: 'float', default: 2 },
  { variable: 'tp3RInput', tvInputId: 'in_40', type: 'float', default: 3 },
  { variable: 'dynTpTqiWeightInput', tvInputId: 'in_41', type: 'float', default: 0.6 },
  { variable: 'dynTpVolWeightInput', tvInputId: 'in_42', type: 'float', default: 0.4 },
  { variable: 'dynTpMinScaleInput', tvInputId: 'in_43', type: 'float', default: 0.5 },
  { variable: 'dynTpMaxScaleInput', tvInputId: 'in_44', type: 'float', default: 2 },
  { variable: 'dynTpFloorR1Input', tvInputId: 'in_45', type: 'float', default: 0.5 },
  { variable: 'dynTpCeilR3Input', tvInputId: 'in_46', type: 'float', default: 8 },
  { variable: 'labelOffsetInput', tvInputId: 'in_47', type: 'int', default: 10 },
  { variable: 'showHitsInput', tvInputId: 'in_48', type: 'bool', default: true },
  { variable: 'tradeMaxAgeInput', tvInputId: 'in_49', type: 'int', default: 100 },
  { variable: 'useAutoCalibInput', tvInputId: 'in_50', type: 'bool', default: false },
  { variable: 'calibWindowInput', tvInputId: 'in_51', type: 'int', default: 20 },
  { variable: 'calibBadRInput', tvInputId: 'in_52', type: 'float', default: 0 },
  { variable: 'calibGoodRInput', tvInputId: 'in_53', type: 'float', default: 0.7 },
  { variable: 'calibStepQInput', tvInputId: 'in_54', type: 'float', default: 0.05 },
  { variable: 'calibCooldownInput', tvInputId: 'in_55', type: 'int', default: 5 },
  { variable: 'calibMinQInput', tvInputId: 'in_56', type: 'float', default: 0.1 },
  { variable: 'calibMaxQInput', tvInputId: 'in_57', type: 'float', default: 0.9 },
  { variable: 'resetLearningInput', tvInputId: 'in_58', type: 'bool', default: false },
  { variable: 'themeInput', tvInputId: 'in_59', type: 'string', default: 'Auto' },
  { variable: 'showBandsInput', tvInputId: 'in_60', type: 'bool', default: true },
  { variable: 'showTqiColorInput', tvInputId: 'in_61', type: 'bool', default: true },
  { variable: 'showSignalsInput', tvInputId: 'in_62', type: 'bool', default: true },
  { variable: 'showBgInput', tvInputId: 'in_63', type: 'bool', default: false },
  { variable: 'showWatermarkInput', tvInputId: 'in_64', type: 'bool', default: true },
  { variable: 'showDashInput', tvInputId: 'in_65', type: 'bool', default: true },
  { variable: 'showTqiBreakdownInput', tvInputId: 'in_66', type: 'bool', default: true },
  { variable: 'showBreakdownInput', tvInputId: 'in_67', type: 'bool', default: false },
  { variable: 'showPerfInput', tvInputId: 'in_68', type: 'bool', default: true },
  { variable: 'dashPosStr', tvInputId: 'in_69', type: 'string', default: 'Top Right' },
  { variable: 'bullColorInput', tvInputId: 'in_70', type: 'color', default: '#00E676' },
  { variable: 'bearColorInput', tvInputId: 'in_71', type: 'color', default: '#FF5252' },
  { variable: 'slColorInput', tvInputId: 'in_72', type: 'color', default: '#FF1744' },
  { variable: 'tpColorInput', tvInputId: 'in_73', type: 'color', default: '#00E676' },
  { variable: 'enableAlertsInput', tvInputId: 'in_74', type: 'bool', default: true },
  { variable: 'webhookInput', tvInputId: 'in_75', type: 'bool', default: false }
];

function applyInputs(indicator, inputs) {
  if (!inputs || Object.keys(inputs).length === 0) return;
  console.log(`📝 Applying input overrides...`);
  for (const [key, value] of Object.entries(inputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) {
      console.warn(`   ⚠️  Unknown input: ${key}`);
      continue;
    }
    try {
      const tvInputDef = indicator.inputs[mapping.tvInputId];
      if (!tvInputDef) {
        console.warn(`   ⚠️  Input ${key} (${mapping.tvInputId}) not in indicator`);
        continue;
      }
      const typed = _coerce(value, mapping.type);
      indicator.setOption(mapping.tvInputId, typed);
      console.log(`   ✅ ${key} → ${mapping.tvInputId} (${tvInputDef.name}): ${JSON.stringify(value)} → ${JSON.stringify(typed)} (${tvInputDef.type})`);
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

// ── parser ────────────────────────────────────────────────────────
function _round(val, decimals = 2) {
  return typeof val === 'number' ? Math.round(val * 10 ** decimals) / 10 ** decimals : val;
}

function parseOutput(rawData, timeframe) {
  const dashboard = _extractDashboard(rawData);
  const signals = _extractSignals(rawData);
  const numerical = _extractNumerical(rawData);
  const lines = _extractLines(rawData);
  const meta = _extractMeta(rawData, timeframe);

  const trendState = _extractTrendState(dashboard, signals, numerical);
  const tqiBreakdown = _extractTqiBreakdown(dashboard);
  const performance = _extractPerformance(dashboard);
  const regime = _extractRegime(dashboard);
  const tradePlan = _extractTradePlan(signals, lines);
  const lastBar = _extractLastBar(rawData);

  // Enhanced intelligence
  const enhanced = {
    trendState,
    tqiBreakdown,
    performance,
    regime,
    tradePlan,
    signals: _generateSignals(trendState, signals, tradePlan, tqiBreakdown, performance),
    narrative: _generateNarrative(trendState, signals, regime, performance, tradePlan),
    validation: _validateOutput(dashboard, signals, trendState),
    agenticScore: _computeAgenticScore(trendState, tqiBreakdown, signals, performance),
  };

  return { dashboard, signals, numerical, lines, meta, lastBar, trendState, enhanced };
}

function _extractDashboard(rawData) {
  const tables = rawData?.graphic?.dwgtables ?? rawData?.graphic?.dwgTables ?? rawData?.graphic?.tables ?? {};
  const cells = rawData?.graphic?.dwgtablecells ?? rawData?.graphic?.dwgTableCells ?? rawData?.graphic?.tablecells ?? {};
  const targetTableId = Object.keys(tables).find(key => tables[key]?.pos === 'top_right');
  if (!targetTableId) return { fields: {}, rawRows: [] };

  const grid = {};
  Object.values(cells).forEach(cell => {
    if (String(cell?.tid) === String(targetTableId)) {
      const row = cell?.row;
      const col = cell?.col;
      if (row !== undefined && col !== undefined) {
        if (!grid[row]) grid[row] = {};
        grid[row][col] = cell?.t ?? '';
      }
    }
  });

  const fields = {};
  const rawRows = [];
  Object.entries(grid)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([rowIdx, rowData]) => {
      const key = rowData[0];
      const value = rowData[1] ?? null;
      if (key !== undefined) {
        fields[key] = value;
        rawRows.push({ key, value, row: Number(rowIdx) });
      }
    });

  return { fields, rawRows };
}

function _extractSignals(rawData) {
  const labels = rawData?.graphic?.dwglabels ?? rawData?.graphic?.dwgLabels ?? rawData?.graphic?.labels ?? {};
  const trades = [];
  const markers = {};

  Object.values(labels).forEach(label => {
    const text = label?.t ?? '';
    const tooltip = label?.tooltip ?? '';

    const tradeMatch = text.match(/^([▼▲])\s+(BUY|SELL)\s+(\d+)/i);
    if (tradeMatch) {
      const trade = {
        direction: tradeMatch[2].toUpperCase(),
        score: Number(tradeMatch[3]),
        text,
        x: label?.x,
        y: label?.y,
      };
      const tooltipLines = tooltip.split('\n').map(l => l.trim()).filter(Boolean);
      const tooltipFields = {};
      tooltipLines.forEach(line => {
        const [k, ...rest] = line.split(':');
        if (k && rest.length) tooltipFields[k.trim()] = rest.join(':').trim();
      });
      if (tooltipFields.TQI) trade.tqi = tooltipFields.TQI;
      if (tooltipFields.ER) trade.er = tooltipFields.ER;
      if (tooltipFields.RSI) trade.rsi = tooltipFields.RSI;
      if (tooltipFields['Vol Z']) trade.volZ = tooltipFields['Vol Z'];
      if (tooltipFields['TP Mode']) trade.tpMode = tooltipFields['TP Mode'];
      if (tooltipFields.Score) trade.rawScore = tooltipFields.Score;
      if (tooltipFields.R) {
        const rMatch = tooltipFields.R.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
        if (rMatch) trade.tpR = [Number(rMatch[1]), Number(rMatch[2]), Number(rMatch[3])];
      }
      trades.push(trade);
    }

    const markerTypes = ['ENTRY', 'SL', 'TP1', 'TP2', 'TP3'];
    for (const type of markerTypes) {
      if (text.includes(type)) {
        const key = type.toLowerCase();
        const isHit = text.includes('\u2713');
        const priceMatch = text.match(new RegExp(type + '\\s+([\\d.]+)'));
        const rMatch = text.match(/\(([\d.]+)R\)/);
        const marker = { text, x: label?.x, y: label?.y, price: priceMatch ? Number(priceMatch[1]) : label?.y, hit: isHit };
        if (rMatch) marker.rMultiple = Number(rMatch[1]);
        if (!markers[key] || (marker.x ?? 0) > (markers[key].x ?? 0)) {
          markers[key] = marker;
        }
      }
    }
  });

  trades.sort((a, b) => (b.x ?? 0) - (a.x ?? 0));
  const latestTrade = trades[0] || null;
  const direction = latestTrade?.direction?.toLowerCase() || null;

  return { trades, markers, latestTrade, direction };
}

function _extractNumerical(rawData) {
  const periods = rawData?.periods || [];
  const latest = periods[0];
  if (!latest) return {};
  return {
    timestamp: latest?.$time ?? latest?.timestamp,
    datetime: latest?.datetime,
    superTrend: latest?.SuperTrend ?? null,
  };
}

function _extractLastBar(rawData) {
  const p = rawData?.periods || [];
  const latest = p[0];
  if (!latest) return null;
  const timestamp = latest.$time ?? latest.time ?? null;
  const open = latest.open ?? latest.o ?? null;
  const high = latest.high ?? latest.max ?? latest.h ?? null;
  const low = latest.low ?? latest.min ?? latest.l ?? null;
  const close = latest.close ?? latest.c ?? null;
  const volume = latest.volume ?? latest.v ?? null;
  return { timestamp, open, high, low, close, volume };
}

function _extractTrendState(dashboard, signals, numerical) {
  const fields = dashboard?.fields || {};
  const trend = fields.Trend || '';
  const tqi = fields.TQI ? parseFloat(fields.TQI) : null;
  const regime = fields.Regime || '';
  const signal = fields.Signal || '';
  const er = fields.ER ? parseFloat(fields.ER) : null;
  const rsi = fields.RSI ? parseFloat(fields.RSI) : null;
  const volZ = fields['Vol Z'] || null;

  let direction = null;
  if (/bullish/i.test(trend)) direction = 'bullish';
  else if (/bearish/i.test(trend)) direction = 'bearish';
  else direction = 'neutral';

  const quality = tqi !== null
    ? (tqi >= 0.6 ? 'high' : tqi >= 0.35 ? 'moderate' : 'low')
    : 'unknown';

  return {
    direction,
    trendText: trend,
    quality,
    tqi,
    regime,
    signal,
    er,
    rsi,
    volZ,
    superTrendPrice: numerical?.superTrend ?? null,
  };
}

function _extractTqiBreakdown(dashboard) {
  const fields = dashboard?.fields || {};
  const eff = fields.Efficiency ? parseFloat(fields.Efficiency) : null;
  const vol = fields.Volatility ? parseFloat(fields.Volatility) : null;
  const struct = fields.Structure ? parseFloat(fields.Structure) : null;
  const mom = fields['Mom Persist'] ? parseFloat(fields['Mom Persist']) : null;

  const components = {};
  if (eff !== null) components.efficiency = eff;
  if (vol !== null) components.volatility = vol;
  if (struct !== null) components.structure = struct;
  if (mom !== null) components.momentum = mom;

  const available = Object.keys(components).length;
  const avg = available > 0
    ? Object.values(components).reduce((a, b) => a + b, 0) / available
    : null;

  return { components, available, average: avg, hasData: available > 0 };
}

function _extractPerformance(dashboard) {
  const fields = dashboard?.fields || {};
  const perf = {};

  const winRateRaw = fields['Win Rate'];
  if (winRateRaw && winRateRaw !== '\u2014') {
    const match = String(winRateRaw).match(/([\d.]+)/);
    if (match) perf.winRate = Number(match[1]) / 100;
  }

  const avgRRaw = fields['Avg R'];
  if (avgRRaw && avgRRaw !== '\u2014') {
    const match = String(avgRRaw).match(/([+-]?[\d.]+)/);
    if (match) perf.avgR = Number(match[1]);
  }

  const windowDDRaw = fields['Window DD'];
  if (windowDDRaw && windowDDRaw !== '\u2014') {
    const match = String(windowDDRaw).match(/([+-]?[\d.]+)/);
    if (match) perf.windowDrawdown = Number(match[1]);
  }

  const streakRaw = fields['Streak W/L'];
  if (streakRaw && streakRaw !== '\u2014') {
    const wMatch = streakRaw.match(/W:(\d+)\/(\d+)/);
    const lMatch = streakRaw.match(/L:(\d+)\/(\d+)/);
    perf.streaks = {};
    if (wMatch) { perf.streaks.currentWin = Number(wMatch[1]); perf.streaks.maxWin = Number(wMatch[2]); }
    if (lMatch) { perf.streaks.currentLoss = Number(lMatch[1]); perf.streaks.maxLoss = Number(lMatch[2]); }
  }

  const regimeEdgeRaw = fields['Regime Edge'];
  if (regimeEdgeRaw && regimeEdgeRaw !== '\u2014') {
    const edgeMatch = String(regimeEdgeRaw).match(/([+-]?[\d.]+)R\s*\((\d+)\)/);
    if (edgeMatch) { perf.regimeEdge = Number(edgeMatch[1]); perf.regimeSampleSize = Number(edgeMatch[2]); }
  }

  const sampleSize = perf.regimeSampleSize || 0;
  perf.confidence = sampleSize >= 30 ? 'high' : sampleSize >= 10 ? 'moderate' : sampleSize > 0 ? 'low' : 'insufficient';

  return perf;
}

function _extractRegime(dashboard) {
  const fields = dashboard?.fields || {};
  const regimeStr = fields.Regime || '';
  const parts = regimeStr.split('/').map(s => s.trim()).filter(Boolean);
  return { raw: regimeStr, erRegime: parts[0] || null, volRegime: parts[1] || null };
}

function _extractLines(rawData) {
  const lines = rawData?.graphic?.dwglines ?? rawData?.graphic?.dwgLines ?? rawData?.graphic?.lines ?? {};
  const result = { entry: null, sl: null, tp1: null, tp2: null, tp3: null, all: [] };

  Object.values(lines).forEach(line => {
    if (line?.y1 === undefined) return;
    const lineData = { price: line.y1, x1: line.x1, x2: line.x2, style: line.st, color: line.ci };
    result.all.push(lineData);

    const colorHex = typeof line.ci === 'number' ? '#' + line.ci.toString(16).padStart(6, '0') : String(line.ci);
    const isRed = colorHex.includes('ff17') || colorHex.includes('ff52') || colorHex.includes('ff0000');
    const isGray = colorHex.includes('8080') || colorHex.includes('9e9e') || colorHex.includes('gray');
    const isGreen = colorHex.includes('00e6') || colorHex.includes('00ff') || colorHex.includes('00e5');

    if (line.st === 'solid' && isGray) result.entry = lineData;
    else if (line.st === 'solid' && isRed) result.sl = lineData;
    else if (line.st === 'dashed' && isGreen) {
      if (line.w === 2) result.tp3 = lineData;
      else if (!result.tp1) result.tp1 = lineData;
      else if (!result.tp2) result.tp2 = lineData;
    }
  });

  return result;
}

function _extractTradePlan(signals, lines) {
  const markers = signals?.markers || {};
  const latestTrade = signals?.latestTrade;
  const plan = {
    direction: latestTrade?.direction || null,
    entry: markers.entry?.price ?? lines.entry?.price ?? null,
    sl: markers.sl?.price ?? lines.sl?.price ?? null,
    tp1: markers.tp1?.price ?? lines.tp1?.price ?? null,
    tp2: markers.tp2?.price ?? lines.tp2?.price ?? null,
    tp3: markers.tp3?.price ?? lines.tp3?.price ?? null,
    tpR: latestTrade?.tpR || null,
    score: latestTrade?.score ?? null,
    tqi: latestTrade?.tqi ? parseFloat(latestTrade.tqi) : null,
    tpMode: latestTrade?.tpMode || null,
  };

  if (plan.entry !== null && plan.sl !== null) {
    plan.riskDistance = Math.abs(plan.entry - plan.sl);
    if (plan.riskDistance > 0) {
      if (plan.tp1 !== null) plan.tp1RActual = Math.abs(plan.tp1 - plan.entry) / plan.riskDistance;
      if (plan.tp2 !== null) plan.tp2RActual = Math.abs(plan.tp2 - plan.entry) / plan.riskDistance;
      if (plan.tp3 !== null) plan.tp3RActual = Math.abs(plan.tp3 - plan.entry) / plan.riskDistance;
    }
  }
  return plan;
}

function _extractMeta(rawData, timeframe) {
  const graphic = rawData?.graphic || {};
  return {
    pineId: PINE_ID,
    scriptName: SCRIPT_NAME,
    timeframe: timeframe || '15m',
    labelCount: Object.keys(graphic?.dwglabels ?? graphic?.dwgLabels ?? graphic?.labels ?? {}).length,
    tableCount: Object.keys(graphic?.dwgtables ?? graphic?.dwgTables ?? graphic?.tables ?? {}).length,
    boxCount: Object.keys(graphic?.dwgboxes ?? graphic?.dwgBoxes ?? graphic?.boxes ?? {}).length,
    lineCount: Object.keys(graphic?.dwglines ?? graphic?.dwgLines ?? graphic?.lines ?? {}).length,
    periodCount: rawData?.periods?.length ?? 0,
  };
}

// ── enhanced intelligence ─────────────────────────────────────────
function _generateSignals(trendState, signals, tradePlan, tqiBreakdown, performance) {
  const generated = [];
  const latest = signals.latestTrade;
  if (!latest) return generated;

  const direction = latest.direction?.toLowerCase();
  const isLong = direction === 'buy';
  const isShort = direction === 'sell';

  // Quality gate: only generate signals if TQI is decent
  const tqi = trendState.tqi ?? 0;
  const quality = tqi >= 0.35 ? 'moderate' : tqi >= 0.2 ? 'low' : 'poor';

  // Confluence score based on TQI + ER + signal score
  const er = trendState.er ?? 0.5;
  const signalScore = latest.score ?? 0;
  const confluenceScore = _round(Math.min(0.99, (tqi * 0.4) + (er * 0.3) + (signalScore / 30 * 0.3)), 2);

  let confidence;
  if (confluenceScore >= 0.80) confidence = 'STRONG';
  else if (confluenceScore >= 0.65) confidence = 'HIGH';
  else if (confluenceScore >= 0.50) confidence = 'MED';
  else confidence = 'LOW';

  if (tradePlan.entry !== null && tradePlan.sl !== null) {
    const risk = Math.abs(tradePlan.entry - tradePlan.sl);
    const rr = risk > 0 && tradePlan.tp1 !== null ? _round(Math.abs(tradePlan.tp1 - tradePlan.entry) / risk, 2) : 0;

    generated.push({
      rank: 1,
      setupType: 'trend_following',
      direction: isLong ? 'long' : isShort ? 'short' : 'neutral',
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
      quality,
      rationale: `${isLong ? 'Bullish' : 'Bearish'} trend-following setup. TQI=${tqi}, ER=${er}, Signal=${signalScore}/30. ${trendState.regime} regime.`,
    });
  }

  return generated;
}

function _generateNarrative(trendState, signals, regime, performance, tradePlan) {
  const parts = [];
  parts.push(`Market is in a ${trendState.direction} trend with ${trendState.quality} quality (TQI ${trendState.tqi ?? 'N/A'}).`);
  parts.push(`Regime: ${regime.raw || 'unknown'}.`);

  if (signals.latestTrade) {
    parts.push(`Latest signal: ${signals.latestTrade.direction} ${signals.latestTrade.score}/30 (${signals.latestTrade.barsAgo || 0} bars ago).`);
  } else {
    parts.push('No active trade signal.');
  }

  const warnings = [];
  if (trendState.quality === 'low') warnings.push('Low TQI — avoid new positions or reduce size.');
  if (trendState.quality === 'moderate' && trendState.signal !== '—') warnings.push('Moderate quality — confirm with higher timeframe.');
  if (regime.volRegime === 'High Vol') warnings.push('High volatility regime — expect wider stops and choppy price action.');
  if (regime.erRegime === 'Choppy') warnings.push('Choppy regime — trend signals less reliable.');
  if (performance.winRate !== null && performance.winRate < 0.35) warnings.push('Low historical win rate in current regime — exercise caution.');
  if (!tradePlan.entry) warnings.push('No active trade plan — wait for setup.');

  const watchlist = [];
  watchlist.push(`Watch for TQI improvement above 0.60 for high-confidence entries.`);
  if (trendState.superTrendPrice) watchlist.push(`Monitor SuperTrend level at ${trendState.superTrendPrice.toFixed(2)} for flip signals.`);
  watchlist.push(`Watch for character-flip on quality collapse (TQI drops below 0.25).`);

  return {
    marketStructure: parts.join(' '),
    primaryOpportunity: tradePlan.entry
      ? `Active ${tradePlan.direction} plan at ${tradePlan.entry.toFixed(2)} with SL ${tradePlan.sl?.toFixed(2) || 'N/A'}`
      : 'No active trade plan.',
    warnings,
    watchlist,
  };
}

function _validateOutput(dashboard, signals, trendState) {
  const checks = [];
  const warnings = [];

  const hasDashboard = Object.keys(dashboard.fields || {}).length > 0;
  checks.push({ name: 'dashboard_present', passed: hasDashboard, detail: hasDashboard ? 'ok' : 'missing' });
  if (!hasDashboard) warnings.push('No dashboard detected — indicator may not have loaded correctly.');

  checks.push({ name: 'trend_state', passed: trendState.direction !== null, detail: trendState.direction || 'unknown' });
  if (trendState.direction === null) warnings.push('Trend direction unknown.');

  const hasSignals = signals.trades && signals.trades.length > 0;
  checks.push({ name: 'signals_present', passed: hasSignals, detail: hasSignals ? `${signals.trades.length} trades` : 'none' });

  const passed = checks.every(c => c.passed);
  return { passed, checks, warnings };
}

function _computeAgenticScore(trendState, tqiBreakdown, signals, performance) {
  let score = 0.2;
  if (trendState.tqi !== null) score += Math.min(trendState.tqi * 0.3, 0.3);
  if (tqiBreakdown.hasData) score += 0.1;
  if (signals.latestTrade) score += 0.15;
  if (performance.winRate !== null) score += 0.1;
  if (trendState.direction !== null && trendState.direction !== 'neutral') score += 0.15;
  return _round(Math.min(score, 0.99), 2);
}

// ── agent mode transformation ─────────────────────────────────────
function transformForAgentMode(result, args) {
  const { dashboard, signals, trendState, meta, enhanced, lastBar } = result;
  const now = new Date().toISOString();

  return {
    status: 'ok',
    exitCode: EXIT_CODES.SUCCESS,
    timestamp: now,
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: {
      workflow: 'adaptive-supertrend-quality', htfTimeframe: null,
      modelVersion: 'agent-ready-v2',
      symbol: args?.symbol || meta.symbol || 'unknown',
      timeframe: meta.timeframe || '15m',
    },
    market: {
      lastPrice: lastBar?.close,
      bias: trendState.direction,
      regime: trendState.regime,
      tqi: trendState.tqi,
      quality: trendState.quality,
    },
    structure: {
      trend: {
        direction: trendState.direction,
        text: trendState.trendText,
        signal: trendState.signal,
        superTrendPrice: trendState.superTrendPrice,
      },
      tqiBreakdown: enhanced.tqiBreakdown,
      regime: enhanced.regime,
    },
    performance: enhanced.performance,
    opportunities: enhanced.signals.map(s => {
      const distanceFromPrice = (s.optimalEntry && lastBar?.close) ? _round(Math.abs(s.optimalEntry - lastBar.close)) : null;
      const isStale = distanceFromPrice !== null && distanceFromPrice > (lastBar.close * 0.005);
      return {
        rank: s.rank,
        setup: s.setupType,
        direction: s.direction,
        confidence: s.confidence,
        confluenceScore: s.confluenceScore,
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
    tradePlan: enhanced.tradePlan,
    narrative: enhanced.narrative,
    validation: enhanced.validation,
    conformance: {
      hasValidStructure: enhanced.validation.passed,
      hasQualityTrend: trendState.quality !== 'low',
      tqiLevel: trendState.quality,
      agenticScore: enhanced.agenticScore,
    },
    schemaVersion: 'agent-ready-v2.0.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'adaptive-supertrend-quality',
    },
  };
}

// ── output formatting ─────────────────────────────────────────────
function printResults(result) {
  const { dashboard, signals, trendState, lines, meta, enhanced, lastBar } = result;
  AgentOutput.info('\n══════════════════════════════════════════════════════════════════════');
  AgentOutput.info('  SELF-AWARE TREND SYSTEM — ANALYSIS RESULTS');
  AgentOutput.info('══════════════════════════════════════════════════════════════════════');

  AgentOutput.info('\n📊 MARKET STATE');
  AgentOutput.info(`   Trend:      ${trendState.direction?.toUpperCase() || 'UNKNOWN'}`);
  AgentOutput.info(`   Quality:    ${trendState.quality} (TQI ${trendState.tqi ?? 'N/A'})`);
  AgentOutput.info(`   Regime:     ${trendState.regime}`);
  AgentOutput.info(`   Signal:     ${trendState.signal}`);
  if (lastBar?.close) AgentOutput.info(`   Last Price: ${lastBar.close.toFixed(2)}`);
  if (trendState.superTrendPrice) AgentOutput.info(`   SuperTrend: ${trendState.superTrendPrice.toFixed(2)}`);

  AgentOutput.info('\n📈 TQI BREAKDOWN');
  if (enhanced.tqiBreakdown.hasData) {
    Object.entries(enhanced.tqiBreakdown.components).forEach(([k, v]) => {
      AgentOutput.info(`   ${k}: ${v}`);
    });
    AgentOutput.info(`   Average: ${enhanced.tqiBreakdown.average?.toFixed(3) ?? 'N/A'}`);
  } else {
    AgentOutput.info('   No TQI breakdown available.');
  }

  AgentOutput.info('\n⚡ SIGNALS');
  if (signals.latestTrade) {
    const t = signals.latestTrade;
    AgentOutput.info(`   Latest: ${t.direction} ${t.score}/30`);
    if (t.tqi) AgentOutput.info(`   TQI: ${t.tqi} | ER: ${t.er} | RSI: ${t.rsi}`);
  } else {
    AgentOutput.info('   No active signals.');
  }

  AgentOutput.info('\n🎯 TRADE PLAN');
  if (enhanced.tradePlan.entry) {
    AgentOutput.info(`   Direction: ${enhanced.tradePlan.direction}`);
    AgentOutput.info(`   Entry:     ${enhanced.tradePlan.entry.toFixed(2)}`);
    AgentOutput.info(`   SL:        ${enhanced.tradePlan.sl?.toFixed(2) || 'N/A'}`);
    AgentOutput.info(`   TP1:       ${enhanced.tradePlan.tp1?.toFixed(2) || 'N/A'}`);
    AgentOutput.info(`   TP2:       ${enhanced.tradePlan.tp2?.toFixed(2) || 'N/A'}`);
    AgentOutput.info(`   TP3:       ${enhanced.tradePlan.tp3?.toFixed(2) || 'N/A'}`);
  } else {
    AgentOutput.info('   No active trade plan.');
  }

  AgentOutput.info('\n📊 PERFORMANCE');
  if (enhanced.performance.winRate !== undefined) {
    AgentOutput.info(`   Win Rate: ${(enhanced.performance.winRate * 100).toFixed(1)}%`);
    AgentOutput.info(`   Avg R:    ${enhanced.performance.avgR ?? 'N/A'}`);
    AgentOutput.info(`   Window DD: ${enhanced.performance.windowDrawdown ?? 'N/A'}`);
  } else {
    AgentOutput.info('   No performance data.');
  }

  if (enhanced.signals.length > 0) {
    AgentOutput.info('\n🎯 GENERATED SIGNALS');
    enhanced.signals.forEach(s => {
      const emoji = s.direction === 'long' ? '🟢' : '🔴';
      AgentOutput.info(`   ${emoji} #${s.rank} ${s.direction.toUpperCase()} | Confidence: ${s.confidence} | R/R: ${s.riskReward}`);
      AgentOutput.info(`      Entry: ${s.optimalEntry} | SL: ${s.stopLoss}`);
      AgentOutput.info(`      ${s.rationale}`);
    });
  }

  if (enhanced.narrative.warnings.length > 0) {
    AgentOutput.info('\n⚠️  WARNINGS');
    enhanced.narrative.warnings.forEach(w => AgentOutput.info(`   • ${w}`));
  }

  AgentOutput.info('\nℹ️  META');
  AgentOutput.info(`   pineId:      ${meta.pineId}`);
  AgentOutput.info(`   Duration:    ${meta.durationMs}ms`);
  AgentOutput.info(`   Agentic Score: ${enhanced.agenticScore}`);
  AgentOutput.info('══════════════════════════════════════════════════════════════════════\n');
}

// ── WebSocket runner ──────────────────────────────────────────────
async function runWebSocket(symbol, tf, bars, inputs, startTime) {
  const session = process.env.SESSION || '';
  const signature = process.env.SIGNATURE || '';
  if (!session || !signature) throw new Error('SESSION and SIGNATURE env vars required');

  const normalizedTf = normalizeTf(tf);

  for (let attempt = 1; attempt <= 3; attempt++) {
    let client = null;
    let chart = null;
    let study = null;

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

      const maxUpdates = 3;
      let updateCount = 0;
      let resolved = false;

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!resolved) {
            const periods = study.periods || [];
            if (periods.length > 0 || Object.keys(study.graphic || {}).length > 0) {
              resolved = true; resolve();
            } else {
              reject(new Error('Timeout (45s)'));
            }
          }
        }, 45000);

        study.onError((err) => {
          clearTimeout(timer);
          if (!resolved) { resolved = true; reject(new Error(`Study error: ${err?.message || JSON.stringify(err)}`)); }
        });

        study.onUpdate(() => {
          updateCount++;
          if (updateCount >= maxUpdates && !resolved) { resolved = true; clearTimeout(timer); resolve(); }
        });
      });

      const periods = (study.periods && study.periods[0]?.close != null)
        ? study.periods
        : (study.periods && chart.periods && chart.periods.length > 0)
          ? chart.periods
          : (study.periods || chart.periods || []);
      const rawData = { periods, graphic: study.graphic || {}, strategyReport: study.strategyReport || null, bars, raw: study };
      const parsed = parseOutput(rawData, tf);
      const duration = Date.now() - startTime;
      parsed.meta.durationMs = duration;

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
  if (args.silent || args.agent) enableSilentMode(true);

  if (args.help || (!args._symbol && process.argv.length <= 2)) {
    printUsage();
    process.exit(0);
  }

  const startTime = Date.now();

  console.log('\n======================================================================');
  console.log(`📊 Running: ${PINE_ID}`);
  console.log(`   Symbol: ${args.symbol} | Timeframe: ${args.tf} | Bars: ${args.bars}`);
  console.log('======================================================================');

  const inputs = loadPreset(args.preset);
  args.inputs = inputs;

  console.log(`📝 Input overrides (${args.preset} preset):`);
  console.log(JSON.stringify(inputs, null, 2));

  if (args.dryRun) {
    console.log('\n🏜️  DRY RUN — Skipping TradingView connection.');
    const dryOutput = { status: 'dry_run', symbol: args.symbol, timeframe: args.tf, bars: args.bars, inputs, timestamp: new Date().toISOString() };
    console.log(JSON.stringify(dryOutput, null, 2));
    process.exit(EXIT_CODES.SUCCESS);
  }

  try {
    const result = await runWebSocket(args.symbol, args.tf, args.bars, inputs, startTime);

    if (args.verbose) {
      console.log(`\n✓ Completed in ${result.meta.durationMs}ms`);
    }

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
