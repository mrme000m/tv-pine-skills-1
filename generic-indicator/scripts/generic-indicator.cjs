#!/usr/bin/env node
/**
 * Generic Pine Script Indicator — Standalone Runner
 *
 * Usage:
 *   node generic-indicator.cjs --pine PUB;xxxx --symbol BTCUSDT
 *   node generic-indicator.cjs --pine PUB;xxxx --symbol BTCUSDT --tf 1h --bars 500 --json
 *   node generic-indicator.cjs --pine PUB;xxxx --symbol BTCUSDT --agent
 *   node generic-indicator.cjs --pine PUB;xxxx --symbol BTCUSDT --dry-run
 *
 * This runner works with ANY public Pine Script indicator that outputs
 * numerical plots, graphics (labels, lines, boxes, tables), and/or strategy reports.
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

const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

// ─────────────────────────────────────────────────────────────────────────────
// BUILTINS.JSON LOADING
// ─────────────────────────────────────────────────────────────────────────────
let _builtinsCache = null;

function loadBuiltins() {
  if (_builtinsCache) return _builtinsCache;
  const builtinsPath = path.join(PROJECT_ROOT, 'builtins.json');
  if (!fs.existsSync(builtinsPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(builtinsPath, 'utf8');
    _builtinsCache = JSON.parse(raw);
    return _builtinsCache;
  } catch (e) {
    console.warn(`⚠️  Failed to load builtins.json: ${e.message}`);
    return [];
  }
}

function searchBuiltins(term, limit = 20) {
  const builtins = loadBuiltins();
  const t = String(term || '').toLowerCase();
  if (!t) return builtins.slice(0, limit);
  return builtins.filter(b => {
    const name = String(b.name || '').toLowerCase();
    const desc = String(b.description || '').toLowerCase();
    const shortDesc = String(b.shortDescription || '').toLowerCase();
    const id = String(b.id || '').toLowerCase();
    return name.includes(t) || desc.includes(t) || shortDesc.includes(t) || id.includes(t);
  }).slice(0, limit);
}

function findBuiltinByName(name) {
  const builtins = loadBuiltins();
  const n = String(name || '').toLowerCase();
  // Exact name match first
  let match = builtins.find(b => String(b.name || '').toLowerCase() === n);
  if (match) return match;
  // Short description match
  match = builtins.find(b => String(b.shortDescription || '').toLowerCase() === n);
  if (match) return match;
  // Partial name match
  match = builtins.find(b => String(b.name || '').toLowerCase().includes(n));
  if (match) return match;
  // STD ID match
  match = builtins.find(b => String(b.id || '').toLowerCase() === n || String(b.id || '').toLowerCase().endsWith(n));
  return match || null;
}

function parseArgs(argv) {
  const args = {
    pineId: null,
    pineVersion: 'last',
    symbol: 'BTCUSDT',
    tf: '15m',
    bars: 500,
    json: false,
    out: null,
    agent: false,
    verbose: false,
    dryRun: false,
    listBuiltins: false,
    listBuiltinsTerm: null,
    builtin: null,
    inputs: {},
  };

  // Detect bare pine ID as first positional arg (e.g. "PUB;abc123" without --pine flag)
  // Also handles shell-split fragments like ["PUB", "abc123"] when unquoted
  const pinePattern = /^(PUB|USER|STD|INV);/i;
  if (argv.length > 0 && pinePattern.test(argv[0])) {
    args.pineId = argv[0];
  } else if (argv.length > 1 && (argv[0] === 'PUB' || argv[0] === 'USER' || argv[0] === 'STD' || argv[0] === 'INV') && /;/.test(argv[1])) {
    // Shell split "PUB;abc" into ["PUB", "abc"] — reconstruct
    args.pineId = argv[0] + ';' + argv[1].split(';')[0];
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pine' && argv[i + 1]) {
      let pineVal = argv[++i];
      // Handle shell splitting: if value is just "PUB" or "USER" and next arg starts with hash
      if ((pineVal === 'PUB' || pineVal === 'USER' || pineVal === 'STD' || pineVal === 'INV') && argv[i + 1] && !argv[i + 1].startsWith('-')) {
        pineVal = pineVal + ';' + argv[++i];
      }
      args.pineId = pineVal;
    }
    else if (a === '--pine-version' && argv[i + 1]) { args.pineVersion = argv[++i]; }
    else if (a === '--symbol' && argv[i + 1]) { args.symbol = argv[++i].toUpperCase(); }
    else if (a === '--tf' && argv[i + 1]) { args.tf = argv[++i]; }
    else if (a === '--bars' && argv[i + 1]) { args.bars = parseInt(argv[++i]); }
    else if (a === '--input' && argv[i + 1]) {
      const [k, v] = argv[++i].split('=');
      if (k && v !== undefined) args.inputs[k.trim()] = v.trim();
    }
    else if (a === '--json') { args.json = true; }
    else if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; }
    else if (a === '--agent') { args.json = true; args.agent = true; }
    else if (a === '--verbose' || a === '-v') { args.verbose = true; }
    else if (a === '--dry-run') { args.dryRun = true; }
    else if (a === '--list-builtins') {
      args.listBuiltins = true;
      // If next arg exists and doesn't start with -, treat it as search term
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        args.listBuiltinsTerm = argv[++i];
      }
    }
    else if (a === '--builtin' && argv[i + 1]) { args.builtin = argv[++i]; }
    else if (a === '--help' || a === '-h') { args.help = true; }
  }

  return args;
}

function printUsage() {
  console.log(`
Generic Pine Script Indicator — Standalone Runner
=================================================

Usage:
  node generic-indicator.cjs --pine <PINE_ID> --symbol <SYMBOL> [options]
  node generic-indicator.cjs --builtin <NAME> --symbol <SYMBOL> [options]

Indicator Sources:
  --pine <id>               Public Pine script (PUB;xxx, USER;xxx, INV;xxx)
  --builtin <name>          Built-in TradingView indicator by name or STD ID
  --list-builtins [term]    List/search available built-in indicators

Options:
  --pine-version <ver>      Version: "last" or specific version (default: last)
  --symbol <sym>            Trading pair (default: BTCUSDT)
  --tf <timeframe>          Timeframe (default: 15m)
  --bars <n>                Number of chart bars (default: 500)
  --input <key=value>       Set an indicator input (can repeat)
  --json                    Output JSON
  --agent                   Agent mode
  --out <file>              Write JSON to file
  --verbose, -v             Verbose output
  --dry-run                 Skip connection
  --help, -h                Show this help

Examples:
  # Public Pine script
  node generic-indicator.cjs --pine PUB;ff1a0136336340f38e908eeb12ea33aa --symbol BTCUSDT

  # Built-in indicator by name
  node generic-indicator.cjs --builtin RSI --symbol BTCUSDT --tf 1h

  # Built-in indicator by STD ID
  node generic-indicator.cjs --pine STD;RSI --symbol BTCUSDT

  # Search built-ins
  node generic-indicator.cjs --list-builtins Bollinger
`);
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

function _coerce(val, type) {
  const s = String(val);
  if (type === 'bool') return s.toLowerCase() === 'true' || s === '1';
  if (type === 'int') return parseInt(s, 10);
  if (type === 'float') return parseFloat(s);
  return val;
}

function _inferType(def) {
  const t = (def.type || '').toLowerCase();
  if (t === 'integer') return 'int';
  if (t === 'float' || t === 'price') return 'float';
  if (t === 'bool' || t === 'boolean') return 'bool';
  return 'string';
}

function applyInputs(indicator, inputs) {
  if (!inputs || Object.keys(inputs).length === 0) return;
  console.log(`📝 Applying input overrides...`);

  // BuiltInIndicator: options are simple key-value, use force=true
  if (indicator instanceof tv.BuiltInIndicator) {
    for (const [key, value] of Object.entries(inputs)) {
      try {
        indicator.setOption(key, _coerce(value, 'string'), true);
        console.log(`   ✅ ${key} → ${JSON.stringify(value)} (forced)`);
      } catch (e) {
        console.warn(`   ⚠️  ${key} failed: ${e.message}`);
      }
    }
    return;
  }

  // PineIndicator: inputs have metadata
  const availableInputs = indicator.inputs || {};
  for (const [key, value] of Object.entries(inputs)) {
    // Try direct tvInputId match first
    if (availableInputs[key]) {
      try {
        const def = availableInputs[key];
        const typed = _coerce(value, _inferType(def));
        indicator.setOption(key, typed);
        console.log(`   ✅ ${key} (${def.name}): ${JSON.stringify(value)} → ${JSON.stringify(typed)} (${def.type})`);
        continue;
      } catch (e) {
        console.warn(`   ⚠️  ${key} failed: ${e.message}`);
        continue;
      }
    }
    // Try matching by name
    const match = Object.entries(availableInputs).find(([, def]) => def.name === key);
    if (match) {
      try {
        const [tvId, def] = match;
        const typed = _coerce(value, _inferType(def));
        indicator.setOption(tvId, typed);
        console.log(`   ✅ ${key} → ${tvId} (${def.name}): ${JSON.stringify(value)} → ${JSON.stringify(typed)} (${def.type})`);
      } catch (e) {
        console.warn(`   ⚠️  ${key} failed: ${e.message}`);
      }
    } else {
      console.warn(`   ⚠️  Unknown input: ${key}`);
    }
  }
}

function _round(val, decimals = 2) {
  return typeof val === 'number' ? Math.round(val * 10 ** decimals) / 10 ** decimals : val;
}

function isTvNan(v) {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'number') return true;
  if (Number.isNaN(v)) return true;
  if (!Number.isFinite(v)) return true;
  if (Math.abs(v) >= 1e+99) return true;
  return false;
}

function cleanValue(v) {
  if (isTvNan(v)) return null;
  return Math.round(v * 1e8) / 1e8;
}

function safeName(title) {
  if (!title) return '';
  return title.replace(/[^a-zA-Z0-9_]/g, '').replace(/ /g, '_');
}

function categorizeByStyle(style) {
  const s = String(style || '').toLowerCase();
  if (s.includes('line')) return 'line';
  if (s.includes('area')) return 'area';
  if (s.includes('histogram') || s.includes('columns')) return 'histogram';
  if (s.includes('shape') || s.includes('arrow')) return 'signal';
  if (s.includes('color') || s.includes('colour')) return 'colorer';
  if (s.includes('candle') || s.includes('bar')) return 'price';
  return 'unknown';
}

function inferFieldCategory(fieldName, values) {
  const lower = String(fieldName).toLowerCase();
  const unique = new Set(values.filter(v => v !== null));

  if (lower.includes('color') || lower.includes('colour') || lower.endsWith('_colorer')) return 'colorer';

  const signalKeywords = ['signal', 'direction', 'trend', 'bos', 'choch', 'breakout', 'fvg', 'alert', 'buy', 'sell', 'long', 'short', 'cross'];
  if (signalKeywords.some(k => lower.includes(k))) {
    return unique.size <= 3 ? 'signal' : 'indicator';
  }

  if (lower.includes('open') || lower.includes('high') || lower.includes('low') || lower.includes('close') || lower.includes('price')) return 'price';
  if (lower.includes('volume') || lower.includes('vol')) return 'volume';

  if (unique.size <= 2 && values.every(v => v === null || v === 0 || v === 1 || v === -1)) return 'signal';

  const nonNull = values.filter(v => v !== null);
  if (nonNull.length > 0) {
    const min = Math.min(...nonNull);
    const max = Math.max(...nonNull);
    const range = max - min;
    if ((range <= 100 && min >= 0 && max <= 100) || (range <= 200 && min >= -100 && max <= 100)) return 'oscillator';
  }
  if (nonNull.length > 0 && Math.abs(Math.max(...nonNull)) > 1000) return 'price';
  return 'continuous';
}

// ── parser ────────────────────────────────────────────────────────
function parseOutput(rawData, indicatorMeta, timeframe) {
  const periods = rawData?.periods || [];
  const graphic = rawData?.graphic || {};
  const strategyReport = rawData?.strategyReport || null;

  // Build field semantics
  const semantics = {};
  if (indicatorMeta) {
    const styles = indicatorMeta._options?.styles || {};
    const plotMap = indicatorMeta._options?.plots || {};
    for (const [pid, style] of Object.entries(styles)) {
      const name = safeName(style.title || pid);
      semantics[name] = { displayName: style.title || pid, style: style.style, category: categorizeByStyle(style.style) };
    }
    for (const [pid, plotName] of Object.entries(plotMap)) {
      const name = safeName(plotName || pid);
      if (!semantics[name]) semantics[name] = { displayName: plotName || pid, category: 'unknown' };
    }
  }

  // Extract numerical data
  const numericalData = _extractNumericalData(periods, semantics);

  // Extract strategy metrics
  const strategyMetrics = _extractStrategyMetrics(strategyReport);

  // Extract graphic intelligence
  const graphicIntel = _extractGraphicIntelligence(graphic);

  // Extract dashboard
  const dashboard = _extractDashboard(graphic);

  // Build intelligence report
  const intelligence = _buildIntelligence(numericalData, strategyMetrics, graphicIntel);

  const meta = _extractMeta(rawData, graphic, timeframe, indicatorMeta);
  const lastBar = _extractLastBar(rawData);

  const enhanced = {
    signals: _generateSignals(intelligence, numericalData, graphicIntel, dashboard),
    narrative: _generateNarrative(intelligence, numericalData, graphicIntel, dashboard),
    validation: _validateOutput(numericalData, graphicIntel),
    agenticScore: _computeAgenticScore(intelligence, numericalData, graphicIntel),
  };

  return {
    intelligence,
    numericalData: {
      count: numericalData.count,
      fields: numericalData.fields,
      fieldMeta: numericalData.fieldMeta,
      lastBar: numericalData.lastBar,
      firstBar: numericalData.firstBar,
      data: numericalData.data,
    },
    strategyMetrics,
    graphicData: graphicIntel,
    dashboard,
    meta,
    lastBar,
    enhanced,
  };
}

function _extractNumericalData(periods, semantics = {}) {
  if (!periods || periods.length === 0) {
    return { count: 0, fields: [], fieldCount: 0, data: [], lastBar: null, firstBar: null, fieldMeta: {} };
  }

  const samplePeriod = periods[0];
  const numericalFields = Object.keys(samplePeriod).filter(key => {
    if (key === '$time') return false;
    return typeof samplePeriod[key] === 'number';
  });

  const cleanData = periods.map(period => {
    const clean = { timestamp: period.$time, datetime: new Date(period.$time * 1000).toISOString() };
    numericalFields.forEach(field => { clean[field] = cleanValue(period[field]); });
    return clean;
  });

  const fieldMeta = {};
  numericalFields.forEach(field => {
    const values = cleanData.map(d => d[field]);
    const nonNull = values.filter(v => v !== null);
    fieldMeta[field] = {
      category: inferFieldCategory(field, values),
      semanticName: semantics[field]?.displayName || field,
      style: semantics[field]?.style || null,
      uniqueCount: new Set(nonNull).size,
      nullCount: values.length - nonNull.length,
      min: nonNull.length ? Math.min(...nonNull) : null,
      max: nonNull.length ? Math.max(...nonNull) : null,
      avg: nonNull.length ? nonNull.reduce((a, b) => a + b, 0) / nonNull.length : null,
      current: values[0] ?? null,
    };
  });

  return {
    count: cleanData.length,
    fields: numericalFields,
    fieldCount: numericalFields.length,
    data: cleanData,
    lastBar: cleanData[0] || null,
    firstBar: cleanData[cleanData.length - 1] || null,
    fieldMeta,
  };
}

function _extractStrategyMetrics(strategyReport) {
  if (!strategyReport || !strategyReport.performance) return null;
  const perf = strategyReport.performance.all || {};
  const trades = strategyReport.trades || [];
  return {
    netProfit: perf.netProfit ?? null,
    netProfitPercent: perf.netProfitPercent ?? null,
    totalTrades: perf.totalTrades ?? trades.length,
    winRate: perf.percentProfitable ?? null,
    profitFactor: perf.profitFactor ?? null,
    maxDrawdown: perf.maxDrawdown ?? null,
    maxDrawdownPercent: perf.maxDrawdownPercent ?? null,
    avgTrade: perf.avgTrade ?? null,
    sharpeRatio: perf.sharpeRatio ?? null,
    sortinoRatio: perf.sortinoRatio ?? null,
    recoveryFactor: perf.recoveryFactor ?? null,
    winningTrades: perf.numberOfWiningTrades ?? 0,
    losingTrades: perf.numberOfLosingTrades ?? 0,
    openTrades: perf.totalOpenTrades ?? 0,
    currency: strategyReport.currency || null,
  };
}

function _extractGraphicIntelligence(graphic) {
  const summary = {};
  const extracted = [];
  if (!graphic) return { summary, itemCount: 0, items: [] };

  for (const [drawType, items] of Object.entries(graphic)) {
    const itemList = items ? Object.values(items) : [];
    summary[drawType] = itemList.length;

    for (const item of itemList) {
      if (!item) continue;
      const text = item.t || item.text || item.tooltip || item.tt || null;
      const intel = {
        type: drawType, text, tooltip: item.tt || item.tooltip || null,
        price: item.y ?? item.price ?? null, barIndex: item.x ?? item.time ?? null,
        color: item.c ?? item.color ?? null, bgColor: item.bc ?? item.backgroundColor ?? null,
        style: item.st ?? item.style ?? null, size: item.sz ?? item.size ?? null,
      };

      if (drawType === 'dwgtables' && (item.table || item.rows)) {
        const rows = item.table || item.rows || [];
        intel.rows = rows.map(row => row.map(cell => ({ text: cell.t ?? cell.text ?? null, color: cell.tc ?? cell.tci ?? cell.textColor ?? cell.color ?? null })));
      }
      if (drawType.startsWith('dwgbox')) {
        intel.x1 = item.x1 ?? null; intel.x2 = item.x2 ?? null; intel.y1 = item.y1 ?? null; intel.y2 = item.y2 ?? null; intel.bgColor = item.bc ?? null;
      }
      if (drawType.startsWith('dwgline')) {
        intel.x1 = item.x1 ?? null; intel.x2 = item.x2 ?? null; intel.y1 = item.y1 ?? null; intel.y2 = item.y2 ?? null; intel.width = item.w ?? null;
      }
      if (drawType.startsWith('dwglabel')) {
        intel.text = text; intel.style = item.st ?? null; intel.size = item.sz ?? null;
        intel.textAlign = item.ta ?? null; intel.textValign = item.tva ?? null; intel.yLoc = item.yl ?? null;
      }

      if (intel.text || intel.rows || (intel.y1 !== null && intel.y2 !== null) || intel.price !== null) {
        extracted.push(intel);
      }
    }
  }

  return { summary, itemCount: extracted.length, items: extracted.slice(0, 100) };
}

function _extractDashboard(graphic) {
  const tables = graphic?.dwgtables ?? graphic?.dwgTables ?? graphic?.tables ?? {};
  const cells = graphic?.dwgtablecells ?? graphic?.dwgTableCells ?? graphic?.tablecells ?? {};
  const targetTableId = Object.keys(tables).find(key => tables[key]?.pos === 'top_right');
  if (!targetTableId) return { fields: {}, rawRows: [] };

  const grid = {};
  Object.values(cells).forEach(cell => {
    if (String(cell?.tid) === String(targetTableId)) {
      const row = cell?.row, col = cell?.col;
      if (row !== undefined && col !== undefined) {
        if (!grid[row]) grid[row] = {};
        grid[row][col] = cell?.t ?? '';
      }
    }
  });

  const fields = {};
  const rawRows = [];
  Object.entries(grid).sort(([a], [b]) => Number(a) - Number(b)).forEach(([rowIdx, rowData]) => {
    const key = rowData[0];
    const value = rowData[1] ?? null;
    if (key !== undefined) { fields[key] = value; rawRows.push({ key, value, row: Number(rowIdx) }); }
  });
  return { fields, rawRows };
}

function _extractMeta(rawData, graphic, timeframe, indicatorMeta) {
  return {
    pineId: indicatorMeta?.pineId || 'unknown',
    scriptName: indicatorMeta?.scriptName || 'Generic Indicator',
    timeframe: timeframe || '15m',
    labelCount: Object.keys(graphic?.dwglabels ?? graphic?.dwgLabels ?? graphic?.labels ?? {}).length,
    tableCount: Object.keys(graphic?.dwgtables ?? graphic?.dwgTables ?? graphic?.tables ?? {}).length,
    boxCount: Object.keys(graphic?.dwgboxes ?? graphic?.dwgBoxes ?? graphic?.boxes ?? {}).length,
    lineCount: Object.keys(graphic?.dwglines ?? graphic?.dwgLines ?? graphic?.lines ?? {}).length,
    shapeCount: Object.keys(graphic?.dwgshapes ?? graphic?.dwgShapes ?? graphic?.shapes ?? {}).length,
    periodCount: rawData?.periods?.length ?? 0,
    hasStrategyMetrics: !!rawData?.strategyReport?.performance,
  };
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

function _buildIntelligence(numericalData, strategyMetrics, graphicIntel) {
  const { data, fieldMeta, lastBar } = numericalData;
  if (!data || data.length === 0) return { summary: 'No data available' };

  const signalEvents = _extractSignalEvents(data, fieldMeta);
  const trends = _computeTrends(data, fieldMeta);
  const crossovers = _detectCrossovers(data, fieldMeta);

  const categories = {};
  Object.entries(fieldMeta).forEach(([field, meta]) => {
    if (!categories[meta.category]) categories[meta.category] = [];
    categories[meta.category].push({ field, ...meta });
  });

  const parts = [];
  parts.push(`Script produced ${numericalData.fieldCount} numerical fields across ${data.length} bars.`);
  if (categories.price?.length) parts.push(`Price fields: ${categories.price.map(f => f.semanticName).join(', ')}.`);
  if (categories.oscillator?.length) parts.push(`Oscillators: ${categories.oscillator.map(f => f.semanticName).join(', ')}.`);
  if (categories.signal?.length) parts.push(`Signal fields: ${categories.signal.map(f => f.semanticName).join(', ')}.`);
  if (graphicIntel?.itemCount) parts.push(`Graphics extracted: ${graphicIntel.itemCount} meaningful items.`);
  if (strategyMetrics) parts.push(`Strategy backtest: ${strategyMetrics.totalTrades} trades, ${strategyMetrics.winRate !== null ? strategyMetrics.winRate.toFixed(1) : 'N/A'}% win rate.`);

  const currentState = {
    latestBar: lastBar,
    activeSignals: signalEvents.filter(e => e.barsAgo === 0).map(e => ({ field: e.field, name: e.semanticName, value: e.value })),
    recentSignals: signalEvents.filter(e => e.barsAgo <= 5 && e.barsAgo > 0).map(e => ({ field: e.field, name: e.semanticName, value: e.value, barsAgo: e.barsAgo })),
    trendSummary: Object.entries(trends).slice(0, 6).map(([field, t]) => ({ field, name: t.semanticName, direction: t.direction, momentum: t.momentum, current: t.current })),
  };

  let recommendation = 'neutral';
  let confidence = 0;
  const bullishCount = signalEvents.filter(e => e.barsAgo <= 3 && /bull|buy|long|breakout/i.test(e.field)).length;
  const bearishCount = signalEvents.filter(e => e.barsAgo <= 3 && /bear|sell|short|breakdown/i.test(e.field)).length;
  if (bullishCount > bearishCount) { recommendation = 'bullish'; confidence = Math.min(90, bullishCount * 25); }
  else if (bearishCount > bullishCount) { recommendation = 'bearish'; confidence = Math.min(90, bearishCount * 25); }
  else if (signalEvents.some(e => e.barsAgo <= 2)) { recommendation = 'mixed'; confidence = 30; }

  return {
    summary: parts.join(' '),
    categories,
    currentState,
    events: { signalEvents: signalEvents.slice(0, 10), crossovers: crossovers.slice(0, 5) },
    trends,
    recommendation,
    confidence,
    graphicItems: graphicIntel?.items || [],
  };
}

function _extractSignalEvents(data, fieldMeta) {
  const events = [];
  const signalFields = Object.entries(fieldMeta).filter(([, m]) => m.category === 'signal');
  signalFields.forEach(([field, meta]) => {
    let prev = null;
    for (let i = 0; i < data.length; i++) {
      const val = data[i][field];
      if (val === null) continue;
      const fired = prev !== null && prev === 0 && val !== 0;
      const fresh = prev === null && val !== 0;
      if (fired || fresh) {
        events.push({ field, semanticName: meta.semanticName, timestamp: data[i].timestamp, datetime: data[i].datetime, value: val, barsAgo: i });
      }
      prev = val;
    }
  });
  return events.sort((a, b) => a.barsAgo - b.barsAgo).slice(0, 20);
}

function _computeTrends(data, fieldMeta) {
  const trends = {};
  const interestingFields = Object.entries(fieldMeta).filter(([, m]) => ['continuous', 'price', 'oscillator', 'indicator'].includes(m.category));
  interestingFields.forEach(([field, meta]) => {
    const values = data.map(d => d[field]).filter(v => v !== null);
    if (values.length < 3) return;
    const current = values[0];
    const prev = values[1];
    const older = values[values.length - 1];
    const change = current !== null && older !== null ? current - older : null;
    const pctChange = older !== 0 && older !== null && change !== null ? (change / Math.abs(older)) * 100 : null;
    trends[field] = {
      semanticName: meta.semanticName, category: meta.category, current, previous: prev,
      direction: current > prev ? 'up' : current < prev ? 'down' : 'flat',
      changeOverPeriod: cleanValue(change),
      percentChange: pctChange !== null ? cleanValue(pctChange) : null,
      momentum: values.slice(0, 5).filter((v, i, arr) => i > 0 && v > arr[i - 1]).length >= 3 ? 'rising' :
        values.slice(0, 5).filter((v, i, arr) => i > 0 && v < arr[i - 1]).length >= 3 ? 'falling' : 'mixed',
    };
  });
  return trends;
}

function _detectCrossovers(data, fieldMeta) {
  const crossovers = [];
  const numericFields = Object.keys(fieldMeta).filter(f => ['continuous', 'price', 'oscillator', 'indicator'].includes(fieldMeta[f].category));
  for (let i = 0; i < numericFields.length; i++) {
    for (let j = i + 1; j < numericFields.length; j++) {
      const f1 = numericFields[i], f2 = numericFields[j];
      let prevDiff = null;
      for (let b = 0; b < Math.min(data.length, 20); b++) {
        const v1 = data[b][f1], v2 = data[b][f2];
        if (v1 === null || v2 === null) continue;
        const diff = v1 - v2;
        if (prevDiff !== null && ((prevDiff < 0 && diff >= 0) || (prevDiff > 0 && diff <= 0))) {
          crossovers.push({ type: diff >= 0 ? 'bullish' : 'bearish', fieldA: f1, fieldB: f2, semanticA: fieldMeta[f1].semanticName, semanticB: fieldMeta[f2].semanticName, timestamp: data[b].timestamp, datetime: data[b].datetime, barsAgo: b });
          break;
        }
        prevDiff = diff;
      }
    }
  }
  return crossovers.sort((a, b) => a.barsAgo - b.barsAgo).slice(0, 10);
}

function _generateSignals(intelligence, numericalData, graphicIntel, dashboard) {
  const generated = [];
  const rec = intelligence.recommendation;
  const conf = intelligence.confidence;
  const lastBar = numericalData.lastBar;

  if (rec === 'neutral' || conf < 30) return generated;

  const direction = rec === 'bullish' ? 'long' : 'short';
  const lastPrice = lastBar?.close;
  if (!lastPrice) return generated;

  // Use ATR proxy from price range if available
  const atr = lastBar?.high && lastBar?.low ? lastBar.high - lastBar.low : lastPrice * 0.01;
  const entry = lastPrice;
  const sl = direction === 'long' ? entry - atr * 1.5 : entry + atr * 1.5;
  const tp1 = direction === 'long' ? entry + atr * 1.5 : entry - atr * 1.5;
  const tp2 = direction === 'long' ? entry + atr * 3.0 : entry - atr * 3.0;

  const risk = Math.abs(entry - sl);
  const rr = risk > 0 ? _round(Math.abs(tp1 - entry) / risk, 2) : 0;

  generated.push({
    rank: 1,
    setupType: 'generic_signal_confluence',
    direction,
    entryZone: { min: _round(Math.min(entry, sl)), max: _round(Math.max(entry, sl)) },
    optimalEntry: _round(entry),
    stopLoss: _round(sl),
    takeProfits: [{ method: '1:1_rr', price: _round(tp1) }, { method: '2:1_rr', price: _round(tp2) }],
    riskReward: rr,
    confluenceScore: _round(conf / 100, 2),
    confidence: conf >= 70 ? 'HIGH' : conf >= 50 ? 'MED' : 'LOW',
    rationale: `Generated from ${graphicIntel.itemCount} graphics + ${intelligence.events.signalEvents.length} signal events. Recommendation: ${rec} (${conf}% confidence).`,
  });

  return generated;
}

function _generateNarrative(intelligence, numericalData, graphicIntel, dashboard) {
  const parts = [];
  parts.push(intelligence.summary);

  const warnings = [];
  if (intelligence.confidence < 50) warnings.push('Low confidence — avoid directional bets.');
  if (intelligence.events.signalEvents.length === 0) warnings.push('No signal events detected in recent bars.');
  if (numericalData.fieldCount === 0) warnings.push('No numerical fields — script may be graphics-only.');

  const watchlist = [];
  if (intelligence.currentState.activeSignals.length > 0) watchlist.push('Active signals firing now — monitor for continuation.');
  if (intelligence.events.crossovers.length > 0) watchlist.push(`Recent crossovers: ${intelligence.events.crossovers.length}.`);

  return { marketStructure: parts.join(' '), primaryOpportunity: intelligence.recommendation !== 'neutral' ? `${intelligence.recommendation.toUpperCase()} bias at ${intelligence.confidence}% confidence.` : 'No clear directional bias.', warnings, watchlist };
}

function _validateOutput(numericalData, graphicIntel) {
  const checks = [];
  const warnings = [];
  checks.push({ name: 'has_data', passed: numericalData.count > 0 || graphicIntel.itemCount > 0, detail: `${numericalData.count} periods, ${graphicIntel.itemCount} graphics` });
  if (numericalData.count === 0 && graphicIntel.itemCount === 0) warnings.push('No data returned — check pine ID and symbol.');
  const passed = checks.every(c => c.passed);
  return { passed, checks, warnings };
}

function _computeAgenticScore(intelligence, numericalData, graphicIntel) {
  let score = 0.2;
  if (numericalData.count > 0) score += 0.2;
  if (graphicIntel.itemCount > 0) score += 0.15;
  if (intelligence.events.signalEvents.length > 0) score += 0.15;
  if (intelligence.confidence > 50) score += 0.15;
  if (intelligence.recommendation !== 'neutral') score += 0.15;
  return _round(Math.min(score, 0.99), 2);
}

// ── agent mode ────────────────────────────────────────────────────
function transformForAgentMode(result, args) {
  const { intelligence, numericalData, strategyMetrics, graphicData, dashboard, meta, enhanced, lastBar } = result;
  const now = new Date().toISOString();

  return {
    status: 'ok',
    exitCode: EXIT_CODES.SUCCESS,
    timestamp: now,
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: {
      workflow: 'generic-indicator-analysis',
      modelVersion: 'agent-ready-v2',
      symbol: args?.symbol || 'unknown',
      timeframe: meta.timeframe || '15m',
      pineId: meta.pineId,
    },
    market: {
      lastPrice: lastBar?.close,
      bias: intelligence.recommendation,
      confidence: intelligence.confidence,
    },
    structure: {
      fieldCount: numericalData.fieldCount,
      fieldCategories: Object.keys(intelligence.categories || {}).reduce((acc, k) => { acc[k] = intelligence.categories[k].length; return acc; }, {}),
      graphics: graphicData?.summary || {},
      dashboardFields: dashboard?.fields || {},
    },
    signals: {
      active: intelligence.currentState.activeSignals,
      recent: intelligence.currentState.recentSignals,
      crossovers: intelligence.events.crossovers,
    },
    trends: Object.entries(intelligence.trends || {}).slice(0, 6).map(([field, t]) => ({ field, name: t.semanticName, direction: t.direction, momentum: t.momentum, current: t.current })),
    opportunities: enhanced.signals.map(s => ({
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
      rationale: s.rationale,
    })),
    strategyMetrics,
    narrative: enhanced.narrative,
    validation: enhanced.validation,
    conformance: {
      hasValidStructure: enhanced.validation.passed,
      hasData: numericalData.count > 0 || (graphicData?.itemCount || 0) > 0,
      agenticScore: enhanced.agenticScore,
    },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

// ── output formatting ─────────────────────────────────────────────
function printResults(result) {
  const { intelligence, numericalData, strategyMetrics, graphicData, dashboard, meta, enhanced, lastBar } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  GENERIC INDICATOR — ${meta.scriptName}`);
  console.log('══════════════════════════════════════════════════════════════════════');

  console.log('\n📊 SUMMARY');
  console.log(`   ${intelligence.summary}`);
  console.log(`   Recommendation: ${intelligence.recommendation.toUpperCase()} (${intelligence.confidence}% confidence)`);
  if (lastBar?.close) console.log(`   Last Price: ${lastBar.close.toFixed(2)}`);

  console.log('\n📈 NUMERICAL FIELDS');
  console.log(`   Total: ${numericalData.fieldCount} fields across ${numericalData.count} bars`);
  Object.entries(numericalData.fieldMeta).slice(0, 10).forEach(([field, meta]) => {
    console.log(`   ${field}: ${meta.category} | current=${meta.current} | min=${_round(meta.min)} | max=${_round(meta.max)}`);
  });

  if (intelligence.currentState.activeSignals.length > 0) {
    console.log('\n⚡ ACTIVE SIGNALS');
    intelligence.currentState.activeSignals.forEach(s => {
      console.log(`   ${s.name} = ${s.value}`);
    });
  }

  if (intelligence.events.crossovers.length > 0) {
    console.log('\n↔️  RECENT CROSSOVERS');
    intelligence.events.crossovers.slice(0, 3).forEach(c => {
      console.log(`   ${c.semanticA} × ${c.semanticB}: ${c.type} (${c.barsAgo} bars ago)`);
    });
  }

  if (graphicData?.itemCount > 0) {
    console.log('\n🎨 GRAPHICS');
    Object.entries(graphicData.summary).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
  }

  if (dashboard?.fields && Object.keys(dashboard.fields).length > 0) {
    console.log('\n📋 DASHBOARD');
    Object.entries(dashboard.fields).slice(0, 10).forEach(([k, v]) => {
      console.log(`   ${k}: ${v}`);
    });
  }

  if (strategyMetrics) {
    console.log('\n📊 STRATEGY METRICS');
    console.log(`   Trades: ${strategyMetrics.totalTrades} | Win Rate: ${strategyMetrics.winRate !== null ? (strategyMetrics.winRate * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`   Profit Factor: ${strategyMetrics.profitFactor ?? 'N/A'} | Max DD: ${strategyMetrics.maxDrawdown ?? 'N/A'}`);
  }

  if (enhanced.signals.length > 0) {
    console.log('\n🎯 GENERATED SIGNALS');
    enhanced.signals.forEach(s => {
      const emoji = s.direction === 'long' ? '🟢' : '🔴';
      console.log(`   ${emoji} #${s.rank} ${s.direction.toUpperCase()} | Confidence: ${s.confidence} | R/R: ${s.riskReward}`);
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

// ── indicator resolution ──────────────────────────────────────────
function isBuiltinType(id) {
  if (!id) return false;
  return /^STD;/i.test(id) || /@tv-/.test(id);
}

async function resolveIndicator(args) {
  const session = process.env.SESSION || '';
  const signature = process.env.SIGNATURE || '';
  if (!session || !signature) throw new Error('SESSION and SIGNATURE env vars required');

  // Determine the target ID
  let targetId = args.pineId;
  let targetName = args.pineId;

  // Case 1: --builtin flag provided — lookup in builtins.json
  if (args.builtin) {
    const builtin = findBuiltinByName(args.builtin);
    if (builtin) {
      targetId = builtin.id;
      targetName = builtin.name;
    } else {
      // Try exact STD ID match
      const builtins = loadBuiltins();
      const exact = builtins.find(b => b.id === args.builtin);
      if (exact) {
        targetId = exact.id;
        targetName = exact.name;
      } else {
        throw new Error(`Built-in indicator "${args.builtin}" not found. Use --list-builtins to search.`);
      }
    }
  }

  // Case 2: Direct @tv- type string — use BuiltInIndicator
  if (targetId && /@tv-/.test(targetId)) {
    console.log(`🔍 Built-in type: ${targetId}`);
    const indicator = new tv.BuiltInIndicator(targetId);
    return { indicator, meta: { pineId: targetId, scriptName: targetName, isBuiltin: true } };
  }

  // Case 3: STD; IDs and public Pine scripts — use pine-facade translate API
  // The pine-facade handles both public (PUB;/USER;/INV;) and built-in (STD;) IDs
  console.log(`🔍 Loading indicator: ${targetId} (version: ${args.pineVersion})`);
  const indicator = await tv.getIndicator(targetId, args.pineVersion, session, signature);
  const scriptName = indicator?.scriptName || indicator?.metaInfo?.description || targetName || 'Unknown Indicator';
  console.log(`   Loaded: ${scriptName}`);
  return { indicator, meta: { pineId: targetId, scriptName, isBuiltin: /^STD;/i.test(targetId) } };
}

// ── builtins listing ──────────────────────────────────────────────
function printBuiltins(term) {
  const results = searchBuiltins(term);
  console.log(`\n📚 TradingView Built-in Indicators${term ? ` (search: "${term}")` : ''}`);
  console.log(`   Found: ${results.length} indicators\n`);

  const maxNameLen = Math.max(...results.map(r => (r.name || '').length), 4);
  const maxShortLen = Math.max(...results.map(r => (r.shortDescription || '').length), 5);

  console.log(`   ${'Name'.padEnd(maxNameLen)} | ${'Short'.padEnd(maxShortLen)} | Type | Inputs | Plots | ID`);
  console.log(`   ${'-'.repeat(maxNameLen)}-+-${'-'.repeat(maxShortLen)}-+-${'----'.padEnd(4)}-+-${'------'.padEnd(6)}-+-${'-----'.padEnd(5)}-+-${'--'}`);

  results.forEach(b => {
    const name = (b.name || '').slice(0, maxNameLen).padEnd(maxNameLen);
    const short = (b.shortDescription || '').slice(0, maxShortLen).padEnd(maxShortLen);
    const type = (b.type || '').slice(0, 4).padEnd(4);
    const inputs = String(b.inputsCount || 0).padStart(6);
    const plots = String(b.plotsCount || 0).padStart(5);
    console.log(`   ${name} | ${short} | ${type} | ${inputs} | ${plots} | ${b.id}`);
  });

  console.log(`\n💡 Usage: node generic-indicator.cjs --builtin "${results[0]?.name || 'RSI'}" --symbol BTCUSDT`);
  console.log(`   Or:    node generic-indicator.cjs --pine "${results[0]?.id || 'STD;RSI'}" --symbol BTCUSDT\n`);
}

// ── WebSocket runner ──────────────────────────────────────────────
async function runWebSocket(indicator, indicatorMeta, symbol, tf, bars, inputs, startTime) {
  const session = process.env.SESSION || '';
  const signature = process.env.SIGNATURE || '';
  if (!session || !signature) throw new Error('SESSION and SIGNATURE env vars required');

  const normalizedTf = normalizeTf(tf);

  for (let attempt = 1; attempt <= 3; attempt++) {
    let client = null, chart = null, study = null;
    try {
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

      const periods = (study.periods && study.periods.length > 0) ? study.periods : (chart.periods || []);
      const rawData = { periods, graphic: study.graphic || {}, strategyReport: study.strategyReport || null, bars, raw: study };
      const parsed = parseOutput(rawData, indicatorMeta, tf);
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

  // List built-ins mode
  if (args.listBuiltins) {
    printBuiltins(args.listBuiltinsTerm);
    process.exit(EXIT_CODES.SUCCESS);
  }

  if (args.help || (!args.pineId && !args.builtin)) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const startTime = Date.now();
  console.log('\n======================================================================');
  console.log(`📊 Generic Runner: ${args.builtin || args.pineId}`);
  console.log(`   Symbol: ${args.symbol} | Timeframe: ${args.tf} | Bars: ${args.bars}`);
  console.log('======================================================================');

  if (Object.keys(args.inputs).length > 0) {
    console.log(`📝 Custom inputs:`);
    console.log(JSON.stringify(args.inputs, null, 2));
  }

  if (args.dryRun) {
    console.log('\n🏜️  DRY RUN — Skipping TradingView connection.');
    console.log(JSON.stringify({ status: 'dry_run', pineId: args.pineId, builtin: args.builtin, symbol: args.symbol, timeframe: args.tf, bars: args.bars, inputs: args.inputs, timestamp: new Date().toISOString() }, null, 2));
    process.exit(EXIT_CODES.SUCCESS);
  }

  try {
    const { indicator, meta: indMeta } = await resolveIndicator(args);
    const result = await runWebSocket(indicator, indMeta, args.symbol, args.tf, args.bars, args.inputs, startTime);
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
