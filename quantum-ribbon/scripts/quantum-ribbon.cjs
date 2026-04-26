#!/usr/bin/env node
/**
 * Quantum Ribbon Lite — Standalone Runner
 * Pine ID: PUB;91e003af510345f299e5846773538206
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

const PINE_ID = 'PUB;91e003af510345f299e5846773538206';
const SCRIPT_NAME = 'Quantum Ribbon Lite';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'i_sensitivity', tvInputId: 'in_0', type: 'int', default: 5 },
  { variable: 'i_stop_distance', tvInputId: 'in_1', type: 'string', default: 'Normal' },
  { variable: 'i_target_rr', tvInputId: 'in_2', type: 'string', default: '2R' },
  { variable: 'i_show_table', tvInputId: 'in_3', type: 'bool', default: true },
  { variable: 'i_table_size', tvInputId: 'in_4', type: 'string', default: 'Small' },
  { variable: 'i_show_ribbon_state', tvInputId: 'in_5', type: 'bool', default: true },
  { variable: 'i_show_lines', tvInputId: 'in_6', type: 'bool', default: true },
  { variable: 'i_entry_line_color', tvInputId: 'in_7', type: 'color', default: 'color.white' },
  { variable: 'i_entry_line_opacity', tvInputId: 'in_8', type: 'int', default: 100 },
  { variable: 'i_entry_line_width', tvInputId: 'in_9', type: 'int', default: 2 },
  { variable: 'i_stop_line_color', tvInputId: 'in_10', type: 'color', default: 'color.red' },
  { variable: 'i_stop_line_opacity', tvInputId: 'in_11', type: 'int', default: 100 },
  { variable: 'i_stop_line_width', tvInputId: 'in_12', type: 'int', default: 2 },
  { variable: 'i_tp_line_color', tvInputId: 'in_13', type: 'color', default: 'color.green' },
  { variable: 'i_tp_line_opacity', tvInputId: 'in_14', type: 'int', default: 100 },
  { variable: 'i_tp_line_width', tvInputId: 'in_15', type: 'int', default: 2 },
  { variable: 'i_table_bg_color', tvInputId: 'in_16', type: 'color', default: 'color.white' },
  { variable: 'i_table_bg_opacity', tvInputId: 'in_17', type: 'int', default: 100 },
  { variable: 'i_table_text_color', tvInputId: 'in_18', type: 'color', default: 'color.black' },
  { variable: 'i_table_border_color', tvInputId: 'in_19', type: 'color', default: 'color.gray' },
  { variable: 'i_table_border_width', tvInputId: 'in_20', type: 'int', default: 1 }
];

function parseArgs(argv) {
  const args = { _symbol: argv[0]?.toUpperCase() || null, symbol: 'BTCUSDT', tf: '15m', bars: 500, json: false, out: null, agent: false, verbose: false, dryRun: false, inputs: {} };
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
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printUsage() {
  console.log(`
Quantum Ribbon Lite — Standalone Runner
Usage: node quantum-ribbon.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --help
Inputs: i_sensitivity, i_stop_distance, i_target_rr, i_show_table, i_table_size, i_show_ribbon_state, i_show_lines, i_entry_line_color, i_entry_line_opacity, i_entry_line_width, i_stop_line_color, i_stop_line_opacity, i_stop_line_width, i_tp_line_color, i_tp_line_opacity, i_tp_line_width, i_table_bg_color, i_table_bg_opacity, i_table_text_color, i_table_border_color, i_table_border_width
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

function applyInputs(indicator, inputs) {
  if (!inputs || Object.keys(inputs).length === 0) return;
  console.log(`📝 Applying input overrides...`);
  for (const [key, value] of Object.entries(inputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) { console.warn(`   ⚠️  Unknown input: ${key}`); continue; }
    try { const tvInputDef = indicator.inputs[mapping.tvInputId]; if (!tvInputDef) { console.warn(`   ⚠️  Input ${key} not in indicator`); continue; } const typed = _coerce(value, mapping.type); indicator.setOption(mapping.tvInputId, typed); console.log(`   ✅ ${key} → ${mapping.tvInputId}: ${JSON.stringify(typed)} (${tvInputDef.type})`); } catch (e) { console.warn(`   ⚠️  ${key} failed: ${e.message}`); }
  }
}

function _getField(p, names) { for (const n of names) { if (p[n] !== undefined && p[n] !== null) return p[n]; } return undefined; }
const NA_VALUE = 1e100;
const isNA = (v) => v === NA_VALUE || v === null || v === undefined || !isFinite(v);

function parseTable(graphic) {
  const tables = graphic.dwgTables || graphic.tables || graphic.dwgtables || {};
  const cells = graphic.dwgTableCells || graphic.tableCells || graphic.dwgtablecells || {};
  const tableId = Object.keys(tables).find(id => tables[id]?.pos === 'top_right');
  if (!tableId) return null;
  const tableCells = Object.values(cells).filter(c => String(c?.tid) === String(tableId));
  const fields = {};
  tableCells.forEach(cell => {
    const row = cell?.row, col = cell?.col, text = cell?.t ?? '';
    if (row !== undefined && col !== undefined) {
      const key = `${row}_${col}`;
      fields[key] = text;
    }
  });
  // Extract known fields from table structure
  const result = {};
  // Row 0: Ribbon state
  const ribbonText = fields['0_1'] || '';
  if (ribbonText.includes('Strong Bull')) result.ribbonState = 'strong_bull';
  else if (ribbonText.includes('Bullish')) result.ribbonState = 'bull';
  else if (ribbonText.includes('Strong Bear')) result.ribbonState = 'strong_bear';
  else if (ribbonText.includes('Bearish')) result.ribbonState = 'bear';
  else if (ribbonText.includes('Neutral')) result.ribbonState = 'neutral';
  // Row 1+: Status, Entry, Stop, Target, Performance, Win Rate, P&L
  const statusText = fields['1_1'] || '';
  result.status = statusText.includes('LONG') ? 'LONG' : statusText.includes('SHORT') ? 'SHORT' : statusText.includes('Waiting') ? 'WAITING' : 'UNKNOWN';
  result.entry = parseFloat(fields['2_1']) || null;
  result.stop = parseFloat(fields['3_1']) || null;
  result.target = parseFloat(fields['4_1']) || null;
  const perfText = fields['5_1'] || '';
  const perfMatch = perfText.match(/(\d+)W\/(\d+)L/);
  if (perfMatch) { result.wins = parseInt(perfMatch[1]); result.losses = parseInt(perfMatch[2]); }
  const wrText = fields['6_1'] || '';
  const wrMatch = wrText.match(/(\d+)/);
  if (wrMatch) result.winRate = parseInt(wrMatch[1]);
  const pnlText = fields['7_1'] || '';
  const pnlMatch = pnlText.match(/([+-]?[\d.]+)%/);
  if (pnlMatch) result.pnl = parseFloat(pnlMatch[1]);
  return result;
}

function parseOutput(rawData, timeframe) {
  const periods = rawData?.periods || [];
  const graphic = rawData?.graphic || {};
  const data = periods.map(p => ({
    timestamp: p.$time, datetime: new Date(p.$time * 1000).toISOString(),
    Plot: p.Plot, Plot_2: p.Plot_2, Plot_3: p.Plot_3, Plot_4: p.Plot_4, Plot_5: p.Plot_5,
    Plot_6: p.Plot_6, Plot_7: p.Plot_7, Plot_8: p.Plot_8, Plot_9: p.Plot_9, Plot_10: p.Plot_10,
    fill_0: p.fill_0_colorer, fill_1: p.fill_1_colorer, fill_2: p.fill_2_colorer, fill_3: p.fill_3_colorer, fill_4: p.fill_4_colorer,
    buySignal: p.BuySignal === 1 || p.buySignal === 1, sellSignal: p.SellSignal === 1 || p.sellSignal === 1,
    stopHit: p.StopHit === 1 || p.stopHit === 1, targetHit: p.TargetHit === 1 || p.targetHit === 1,
    confidence: _getField(p, ['Confidence', 'confidence', 'SignalConfidence']),
    health: _getField(p, ['Health', 'health', 'MarketHealth']),
    regime: _getField(p, ['Regime', 'regime', 'MarketRegime']),
  }));
  if (data.length === 0) return { error: 'No data', meta: { pineId: PINE_ID, timeframe } };

  const last = data[0];
  // Table parsing for rich metadata
  const table = parseTable(graphic);

  // Layer analysis
  const layerPairs = [['Plot', 'Plot_2'], ['Plot_3', 'Plot_4'], ['Plot_5', 'Plot_6'], ['Plot_7', 'Plot_8'], ['Plot_9', 'Plot_10']];
  const layers = []; let bullish = 0, bearish = 0;
  for (const [fast, slow] of layerPairs) {
    const fastVal = data[0]?.[fast]; const slowVal = data[0]?.[slow];
    if (!isNA(fastVal) && !isNA(slowVal)) {
      const isBull = fastVal >= slowVal;
      layers.push({ layer: layers.length + 1, fast: fastVal, slow: slowVal, bullish: isBull });
      if (isBull) bullish++; else bearish++;
    }
  }
  const total = layers.length;
  let state = 'neutral';
  if (bullish === total && total > 0) state = 'strong_bull';
  else if (bearish === total && total > 0) state = 'strong_bear';
  else if (bullish > bearish) state = 'bull';
  else if (bearish > bullish) state = 'bear';

  // Use table ribbon state if available (more accurate)
  const ribbonState = table?.ribbonState || state;

  // Crossovers
  const crossovers = [];
  for (let i = 0; i < data.length - 1; i++) {
    const prev = data[i + 1], curr = data[i];
    if (isNA(prev.Plot_9) || isNA(prev.Plot_10) || isNA(curr.Plot_9) || isNA(curr.Plot_10)) continue;
    const prevDiff = prev.Plot_9 - prev.Plot_10, currDiff = curr.Plot_9 - curr.Plot_10;
    if (prevDiff <= 0 && currDiff > 0) crossovers.push({ type: 'bullish', barsAgo: i, fast: curr.Plot_9, slow: curr.Plot_10 });
    else if (prevDiff >= 0 && currDiff < 0) crossovers.push({ type: 'bearish', barsAgo: i, fast: curr.Plot_9, slow: curr.Plot_10 });
  }
  const lastCross = crossovers[0] || null;

  const buyCount = data.filter(d => d.buySignal).length;
  const sellCount = data.filter(d => d.sellSignal).length;

  // Confidence and health from periods or table
  const confidences = data.map(d => d.confidence).filter(v => v !== undefined && v !== null && !isNaN(v));
  const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : (table ? 0 : null);
  const healths = data.map(d => d.health).filter(v => v !== undefined && v !== null && !isNaN(v));
  const avgHealth = healths.length > 0 ? healths.reduce((a, b) => a + b, 0) / healths.length : (table ? 0 : null);

  const spread = (!isNA(last.Plot_9) && !isNA(last.Plot_10)) ? Math.abs(last.Plot_9 - last.Plot_10) : null;
  const spreadPct = spread && !isNA(last.Plot_10) && last.Plot_10 !== 0 ? (spread / last.Plot_10) * 100 : null;

  let recommendation = 'HOLD';
  if (ribbonState === 'strong_bull') recommendation = 'BULLISH — all layers aligned bullish';
  else if (ribbonState === 'strong_bear') recommendation = 'BEARISH — all layers aligned bearish';
  else if (lastCross && lastCross.barsAgo <= 3) recommendation = lastCross.type === 'bullish' ? 'RECENT BULLISH CROSS' : 'RECENT BEARISH CROSS';
  else if (ribbonState === 'bull') recommendation = 'WEAK BULLISH';
  else if (ribbonState === 'bear') recommendation = 'WEAK BEARISH';

  const summary = { totalBars: data.length, buySignals: buyCount, sellSignals: sellCount, ribbonState, crossovers: crossovers.length, avgConfidence: avgConfidence ? _round(avgConfidence) : null, avgHealth: avgHealth ? _round(avgHealth) : null };
  const currentBar = { timestamp: last.timestamp, datetime: last.datetime, spread: spread ? _round(spread) : null, spreadPercent: spreadPct ? _round(spreadPct, 3) : null, buySignal: last.buySignal, sellSignal: last.sellSignal, stopHit: last.stopHit, targetHit: last.targetHit, confidence: last.confidence, health: last.health };

  const signals = _generateSignals(ribbonState, lastCross, avgConfidence, currentBar, table);
  const narrative = _generateNarrative(ribbonState, lastCross, currentBar, table, signals);
  const agenticScore = _computeAgenticScore(ribbonState, lastCross, currentBar, table);

  return { summary, ribbon: { state: ribbonState, bullishLayers: bullish, bearishLayers: bearish, totalLayers: total, layers }, currentBar, table, crossovers: { count: crossovers.length, lastCross: lastCross ? { type: lastCross.type, barsAgo: lastCross.barsAgo } : null, recent: crossovers.slice(0, 5) }, signals, narrative, recommendation, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: periods.length }, enhanced: { signals, narrative, agenticScore } };
}

function _generateSignals(ribbonState, lastCross, avgConfidence, currentBar, table) {
  const generated = [];
  let direction = 'neutral';
  if (ribbonState === 'strong_bull') direction = 'long';
  else if (ribbonState === 'strong_bear') direction = 'short';
  else if (ribbonState === 'bull' && (!table || table.status !== 'SHORT')) direction = 'long';
  else if (ribbonState === 'bear' && (!table || table.status !== 'LONG')) direction = 'short';
  if (direction === 'neutral') return generated;

  const confluenceScore = _round(ribbonState.startsWith('strong') ? (avgConfidence && avgConfidence >= 3 ? 0.9 : 0.85) : (avgConfidence && avgConfidence >= 3 ? 0.75 : 0.65), 2);
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.65 ? 'HIGH' : confluenceScore >= 0.50 ? 'MED' : 'LOW';
  const rationaleParts = [`${direction === 'long' ? 'Bullish' : 'Bearish'} ribbon: ${_getRibbonLayerDesc(ribbonState)}.`];
  if (lastCross) rationaleParts.push(`Last cross: ${lastCross.type} (${lastCross.barsAgo} bars ago).`);
  if (table && table.winRate) rationaleParts.push(`Table win rate: ${table.winRate}%.`);
  generated.push({ rank: 1, setupType: 'ribbon_alignment', direction, confluenceScore: _round(confluenceScore, 2), confidence, rationale: rationaleParts.join(' ') });
  return generated;
}

function _getRibbonLayerDesc(state) {
  if (state === 'strong_bull') return '5/5 layers bullish';
  if (state === 'strong_bear') return '5/5 layers bearish';
  if (state === 'bull') return 'majority bullish';
  if (state === 'bear') return 'majority bearish';
  return 'mixed';
}

function _generateNarrative(ribbonState, lastCross, currentBar, table, signals) {
  const parts = [`Quantum Ribbon: ${ribbonState.replace(/_/g, ' ')}.`];
  if (table) {
    parts.push(`Status: ${table.status}.`);
    if (table.wins !== undefined && table.losses !== undefined) parts.push(`Performance: ${table.wins}W/${table.losses}L (${table.winRate || 0}% win rate).`);
    if (table.pnl !== undefined) parts.push(`Current P&L: ${table.pnl > 0 ? '+' : ''}${table.pnl}%.`);
    if (table.entry && table.stop && table.target) parts.push(`Active trade: Entry=${table.entry}, SL=${table.stop}, TP=${table.target}.`);
  }
  const warnings = [];
  if (ribbonState === 'neutral') warnings.push('No ribbon alignment — wait for direction.');
  if (currentBar.stopHit) warnings.push('Stop loss hit recently — reassess.');
  if (table && table.status === 'WAITING' && (ribbonState === 'strong_bull' || ribbonState === 'strong_bear')) warnings.push('Strong ribbon but no active position — signal cooldown may be active.');
  const watchlist = ['Watch for layer 5 (slowest) cross as major trend shift.', 'Confirm with Buy/Sell signal before entry.', 'Check table for active trade levels.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'Wait for ribbon alignment.', warnings, watchlist };
}

function _computeAgenticScore(ribbonState, lastCross, currentBar, table) {
  let score = 0.2;
  if (ribbonState.startsWith('strong')) score += 0.3;
  else if (ribbonState !== 'neutral') score += 0.15;
  if (lastCross && lastCross.barsAgo <= 5) score += 0.2;
  if (currentBar.buySignal || currentBar.sellSignal) score += 0.15;
  if (!currentBar.stopHit) score += 0.1;
  if (table && table.winRate && table.winRate >= 60) score += 0.1;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, ribbon, currentBar, table, crossovers, signals, narrative, recommendation, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'quantum-ribbon', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: null },
    ribbon: { state: ribbon.state, bullishLayers: ribbon.bullishLayers, bearishLayers: ribbon.bearishLayers, totalLayers: ribbon.totalLayers, layers: ribbon.layers },
    table, crossovers,
    market: { recommendation, currentBuy: currentBar.buySignal, currentSell: currentBar.sellSignal, spread: currentBar.spread, confidence: currentBar.confidence, health: currentBar.health },
    opportunities: signals.map(s => ({ rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice: null, isStale: false, rationale: s.rationale })),
    narrative, conformance: { hasValidData: summary.totalBars > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

function printResults(result) {
  const { summary, ribbon, currentBar, table, crossovers, signals, narrative, recommendation, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  QUANTUM RIBBON LITE — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n📊 RIBBON (${ribbon.totalLayers} layers)`);
  console.log(`   State: ${ribbon.state} | Bull: ${ribbon.bullishLayers} | Bear: ${ribbon.bearishLayers}`);
  ribbon.layers.forEach(l => console.log(`   L${l.layer}: fast=${_round(l.fast)} slow=${_round(l.slow)} ${l.bullish ? '🟢' : '🔴'}`));
  console.log(`\n📈 CURRENT`);
  console.log(`   Spread: ${currentBar.spread} (${currentBar.spreadPercent}%)`);
  console.log(`   Buy: ${currentBar.buySignal} | Sell: ${currentBar.sellSignal} | Stop: ${currentBar.stopHit}`);
  if (table) {
    console.log(`\n📊 TABLE`);
    console.log(`   Status: ${table.status} | Ribbon: ${table.ribbonState || 'N/A'}`);
    if (table.entry) console.log(`   Entry: ${table.entry} | Stop: ${table.stop} | Target: ${table.target}`);
    if (table.wins !== undefined) console.log(`   Performance: ${table.wins}W/${table.losses}L | WinRate: ${table.winRate}%`);
    if (table.pnl !== undefined) console.log(`   P&L: ${table.pnl > 0 ? '+' : ''}${table.pnl}%`);
  }
  if (crossovers.lastCross) console.log(`   Last Cross: ${crossovers.lastCross.type} (${crossovers.lastCross.barsAgo} bars ago)`);
  if (signals.length > 0) { console.log('\n🎯 SIGNALS'); signals.forEach(s => console.log(`   ${s.direction.toUpperCase()} | ${s.confidence} | ${s.rationale}`)); }
  if (narrative.warnings.length > 0) { console.log('\n⚠️ WARNINGS'); narrative.warnings.forEach(w => console.log(`   • ${w}`)); }
  console.log(`\nℹ️ META | Duration: ${meta.durationMs}ms | Score: ${enhanced.agenticScore}`);
  console.log('══════════════════════════════════════════════════════════════════════\n');
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
      const periods = (study.periods && study.periods.length > 0) ? study.periods : (chart.periods || []);
      const parsed = parseOutput({ periods, graphic: study.graphic || {}, bars }, tf);
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
  const startTime = Date.now();
  console.log(`\n📊 Running: ${PINE_ID} | ${args.symbol} | ${args.tf} | ${args.bars} bars`);
  if (args.dryRun) { console.log('\n🏜️ DRY RUN'); console.log(JSON.stringify({ status: 'dry_run', ...args, timestamp: new Date().toISOString() }, null, 2)); process.exit(EXIT_CODES.SUCCESS); }
  try {
    const result = await runWebSocket(args.symbol, args.tf, args.bars, startTime, args.inputs);
    if (args.verbose) console.log(`\n✓ Completed in ${result.meta.durationMs}ms`);
    if (args.json) { const output = args.agent ? transformForAgentMode(result, args) : result; const json = JSON.stringify(output, null, 2); if (args.out) { fs.writeFileSync(args.out, json); console.log(`✅ Saved to ${args.out}`); } else console.log(json); }
    else printResults(result);
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) { const isCritical = /SESSION|SIGNATURE|connection/i.test(err.message); console.error(`\n❌ Error: ${err.message}`); process.exit(isCritical ? EXIT_CODES.CRITICAL : EXIT_CODES.VALIDATION); }
}
main().catch(err => { console.error(`\n❌ Unexpected: ${err.message}`); process.exit(1); });
