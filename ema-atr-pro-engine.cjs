#!/usr/bin/env node
/**
 * EMA + ATR PRO Ultimate Engine — Standalone Runner
 * Pine ID: PUB;7d5f8755ab67400899ef73a9898471e4
 */

const fs = require('fs');
const path = require('path');
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env') });
const tv = require('./tv-optimized.cjs');
const { AgentOutput, enableSilentMode, isSilent } = require('./agent-output.cjs');

const PINE_ID = 'PUB;7d5f8755ab67400899ef73a9898471e4';
const SCRIPT_NAME = 'EMA + ATR PRO Ultimate Engine';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'ema2Len', tvInputId: 'in_0', type: 'int', default: 20 },
  { variable: 'ema3Len', tvInputId: 'in_1', type: 'int', default: 50 },
  { variable: 'useEMA2', tvInputId: 'in_2', type: 'bool', default: true },
  { variable: 'useEMA3', tvInputId: 'in_3', type: 'bool', default: false },
  { variable: 'pivotLen', tvInputId: 'in_4', type: 'int', default: 1 },
  { variable: 'atrLen', tvInputId: 'in_5', type: 'int', default: 7 },
  { variable: 'atrMult', tvInputId: 'in_6', type: 'float', default: 1.4 },
  { variable: 'confirmClose', tvInputId: 'in_7', type: 'bool', default: true },
  { variable: 'fastMode', tvInputId: 'in_8', type: 'bool', default: false },
  { variable: 'enableReentry', tvInputId: 'in_9', type: 'bool', default: false },
  { variable: 'buyColor', tvInputId: 'in_10', type: 'color', default: 'color.rgb(5, 7, 12)' },
  { variable: 'sellColor', tvInputId: 'in_11', type: 'color', default: 'color.gray' },
  { variable: 'textColor', tvInputId: 'in_12', type: 'color', default: 'color.white' },
  { variable: 'bullTrailColor', tvInputId: 'in_13', type: 'color', default: 'color.rgb(94, 255, 0)' },
  { variable: 'bearTrailColor', tvInputId: 'in_14', type: 'color', default: 'color.red' }
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
EMA + ATR PRO Ultimate Engine — Standalone Runner
Usage: node ema-atr-pro-engine.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --help
Inputs: ema2Len, ema3Len, useEMA2, useEMA3, pivotLen, atrLen, atrMult, confirmClose, fastMode, enableReentry, buyColor, sellColor, textColor, bullTrailColor, bearTrailColor
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

function parseLabels(graphic) {
  const labels = Object.values(graphic.dwgLabels ?? graphic.labels ?? graphic.dwglabels ?? {});
  const buys = [], sells = [];
  labels.forEach(l => {
    const text = String(l.text || l.t || '').trim();
    if (text === 'BUY' || text === 'BUY+') buys.push({ text, x: l.x, y: l.y, reentry: text === 'BUY+' });
    else if (text === 'SELL' || text === 'SELL+') sells.push({ text, x: l.x, y: l.y, reentry: text === 'SELL+' });
  });
  return { buys, sells };
}

function parseOutput(rawData, timeframe) {
  const periods = rawData?.periods || [];
  const graphic = rawData?.graphic || {};
  const closeMap = rawData?.closeMap || new Map();
  const data = periods.map(p => {
    const ts = p.$time ?? p.time;
    const close = _getField(p, ['Close', 'close', 'c']) ?? closeMap.get(ts) ?? null;
    return {
      timestamp: p.$time, datetime: new Date(p.$time * 1000).toISOString(),
      trail: _getField(p, ['Trail', 'trail', 'ATRTrail', 'Plot', 'plot']),
      ema2: _getField(p, ['EMA2', 'ema2', 'EMA1', 'ema1', 'Plot_2', 'plot_2']),
      ema3: _getField(p, ['EMA3', 'ema3', 'EMA2_2', 'ema2_2', 'Plot_3', 'plot_3']),
      trailColor: _getField(p, ['Trail_colorer', 'trailColorer', 'TrailColor', 'Plot_colorer', 'plot_colorer']),
      buySignal: _getField(p, ['BuySignal', 'buySignal', 'BUY', 'BUYSignal', 'buySignal']) === 1 || _getField(p, ['BuySignal', 'buySignal', 'BUY', 'BUYSignal']) === true,
      sellSignal: _getField(p, ['SellSignal', 'sellSignal', 'SELL', 'SELLSignal', 'sellSignal']) === 1 || _getField(p, ['SellSignal', 'sellSignal', 'SELL', 'SELLSignal']) === true,
      buyReentry: _getField(p, ['BuyReentry', 'buyReentry', 'BUY+', 'BUYReentry', 'buyReentry']) === 1 || _getField(p, ['BuyReentry', 'buyReentry', 'BUY+', 'BUYReentry']) === true,
      sellReentry: _getField(p, ['SellReentry', 'sellReentry', 'SELL+', 'SELLReentry', 'sellReentry']) === 1 || _getField(p, ['SellReentry', 'sellReentry', 'SELL+', 'SELLReentry']) === true,
      close,
    };
  });
  if (data.length === 0) return { error: 'No data', meta: { pineId: PINE_ID, timeframe } };

  const last = data[0];
  const labels = parseLabels(graphic);

  const trailTrend = last.trail && last.close ? (last.close > last.trail ? 'BULLISH' : 'BEARISH') : 'UNKNOWN';
  const avgTrail = data.reduce((s, d) => s + (d.trail || 0), 0) / data.length;
  const avgEMA2 = data.reduce((s, d) => s + (d.ema2 || 0), 0) / data.length;
  const avgEMA3 = data.reduce((s, d) => s + (d.ema3 || 0), 0) / data.length;

  const buySignals = data.filter(d => d.buySignal).length;
  const sellSignals = data.filter(d => d.sellSignal).length;
  const buyReentries = data.filter(d => d.buyReentry).length;
  const sellReentries = data.filter(d => d.sellReentry).length;

  // Trend filter analysis: bullTrend = trendUp and (useEMA2 ? close > ema2 : true) and (useEMA3 ? close > ema3 : true)
  const ema2Bull = last.ema2 && last.close ? last.close > last.ema2 : null;
  const ema3Bull = last.ema3 && last.close ? last.close > last.ema3 : null;
  const combinedTrend = trailTrend === 'BULLISH' && (ema2Bull !== false) && (ema3Bull !== false) ? 'BULLISH' : trailTrend === 'BEARISH' && (ema2Bull !== true) && (ema3Bull !== true) ? 'BEARISH' : 'MIXED';

  const summary = { totalBars: data.length, buySignals, sellSignals, buyReentries, sellReentries, buyAll: buySignals + buyReentries, sellAll: sellSignals + sellReentries, trailTrend, combinedTrend, averageTrail: _round(avgTrail), averageEMA2: _round(avgEMA2), averageEMA3: _round(avgEMA3) };

  const currentBar = { timestamp: last.timestamp, datetime: last.datetime, trail: last.trail, ema2: last.ema2, ema3: last.ema3, trailColor: last.trailColor, buySignal: last.buySignal, sellSignal: last.sellSignal, buyReentry: last.buyReentry, sellReentry: last.sellReentry, ema2Bull, ema3Bull };

  const last10Bars = data.slice(0, 10).map(d => ({ datetime: d.datetime, trail: d.trail, ema2: d.ema2, trailTrend: d.trail && d.close ? (d.close > d.trail ? 'BULLISH' : 'BEARISH') : 'UNKNOWN', buySignal: d.buySignal, sellSignal: d.sellSignal }));

  const signals = _generateSignals(summary, currentBar, data, labels);
  const narrative = _generateNarrative(summary, currentBar, signals, labels);
  const agenticScore = _computeAgenticScore(summary, currentBar, data, labels);

  return { summary, currentBar, last10Bars, labels, signals, narrative, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: periods.length }, enhanced: { signals, narrative, agenticScore } };
}

function _generateSignals(summary, currentBar, data, labels) {
  const generated = [];
  const direction = summary.combinedTrend === 'BULLISH' && (currentBar.buySignal || labels.buys.length > 0) ? 'long' : summary.combinedTrend === 'BEARISH' && (currentBar.sellSignal || labels.sells.length > 0) ? 'short' : 'neutral';
  if (direction === 'neutral') return generated;

  const confluenceScore = direction === 'long'
    ? Math.min(0.95, 0.5 + (summary.buySignals / Math.max(summary.totalBars, 1)) * 5 + (currentBar.buySignal ? 0.3 : 0) + (currentBar.ema2Bull ? 0.1 : 0))
    : Math.min(0.95, 0.5 + (summary.sellSignals / Math.max(summary.totalBars, 1)) * 5 + (currentBar.sellSignal ? 0.3 : 0) + (!currentBar.ema2Bull ? 0.1 : 0));

  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.65 ? 'HIGH' : confluenceScore >= 0.50 ? 'MED' : 'LOW';
  const rationaleParts = [`${direction === 'long' ? 'Bullish' : 'Bearish'} ATR trail + structure break. Trail: ${currentBar.trail}. EMA2: ${currentBar.ema2}.`];
  if (currentBar.buyReentry || currentBar.sellReentry) rationaleParts.push('Re-entry signal active.');
  if (labels.buys.length > 0 || labels.sells.length > 0) rationaleParts.push(`Graphic labels: ${labels.buys.length} buy / ${labels.sells.length} sell.`);
  generated.push({ rank: 1, setupType: 'atr_structure_break', direction, confluenceScore: _round(confluenceScore, 2), confidence, rationale: rationaleParts.join(' ') });
  return generated;
}

function _generateNarrative(summary, currentBar, signals, labels) {
  const parts = [`EMA+ATR Engine shows ${summary.trailTrend} trail trend over ${summary.totalBars} bars. Combined trend: ${summary.combinedTrend}.`];
  parts.push(`Buy signals: ${summary.buySignals} | Sell signals: ${summary.sellSignals}.`);
  if (labels.buys.length > 0 || labels.sells.length > 0) parts.push(`Graphic labels: ${labels.buys.length} buy / ${labels.sells.length} sell.`);
  const warnings = [];
  if (summary.buySignals === 0 && summary.sellSignals === 0) warnings.push('No signals in lookback — market may be ranging.');
  if (currentBar.buyReentry || currentBar.sellReentry) warnings.push('Re-entry mode active — manage risk carefully.');
  if (summary.combinedTrend === 'MIXED') warnings.push('Mixed trend — EMA filter disagrees with trail.');
  const watchlist = ['Watch for trail flip as early reversal signal.', 'Confirm with structure break before entry.', 'Check EMA alignment for additional confirmation.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'No active signal.', warnings, watchlist };
}

function _computeAgenticScore(summary, currentBar, data, labels) {
  let score = 0.2;
  if (summary.buySignals > 0 || summary.sellSignals > 0) score += 0.2;
  if (currentBar.buySignal || currentBar.sellSignal) score += 0.25;
  if (summary.trailTrend !== 'UNKNOWN') score += 0.15;
  if (currentBar.trail && currentBar.ema2) score += 0.1;
  if (labels.buys.length > 0 || labels.sells.length > 0) score += 0.1;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, currentBar, last10Bars, labels, signals, narrative, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'ema-atr-structure', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: null },
    market: { trailTrend: summary.trailTrend, combinedTrend: summary.combinedTrend, currentTrail: currentBar.trail, currentEMA2: currentBar.ema2, currentEMA3: currentBar.ema3, lastPrice: currentBar.close ?? null },
    signals: { buy: summary.buySignals, sell: summary.sellSignals, buyReentry: summary.buyReentries, sellReentry: summary.sellReentries, currentBuy: currentBar.buySignal, currentSell: currentBar.sellSignal },
    labels: { buyLabels: labels.buys.length, sellLabels: labels.sells.length },
    opportunities: signals.map(s => ({ rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice: null, isStale: false, rationale: s.rationale })),
    narrative, conformance: { hasValidData: summary.totalBars > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
    _parserMeta: {
      schemaVersion: 'agent-ready-v2.1.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'ema-atr-structure',
    },
  };
}

function printResults(result) {
  const { summary, currentBar, last10Bars, labels, signals, narrative, meta, enhanced } = result;
  AgentOutput.info('\n══════════════════════════════════════════════════════════════════════');
  AgentOutput.info('  EMA + ATR PRO ENGINE — ANALYSIS RESULTS');
  AgentOutput.info('══════════════════════════════════════════════════════════════════════');
  AgentOutput.info(`\n📊 SUMMARY (${summary.totalBars} bars)`);
  AgentOutput.info(`   Trail Trend: ${summary.trailTrend} | Combined: ${summary.combinedTrend}`);
  AgentOutput.info(`   Buy Signals: ${summary.buySignals} | Sell Signals: ${summary.sellSignals}`);
  AgentOutput.info(`   Buy Reentries: ${summary.buyReentries} | Sell Reentries: ${summary.sellReentries}`);
  AgentOutput.info(`   Avg Trail: ${summary.averageTrail} | Avg EMA2: ${summary.averageEMA2} | Avg EMA3: ${summary.averageEMA3}`);
  AgentOutput.info(`\n📈 CURRENT BAR`);
  AgentOutput.info(`   Trail: ${currentBar.trail} | EMA2: ${currentBar.ema2} | EMA3: ${currentBar.ema3}`);
  AgentOutput.info(`   Buy: ${currentBar.buySignal} | Sell: ${currentBar.sellSignal} | Reentry: ${currentBar.buyReentry || currentBar.sellReentry}`);
  AgentOutput.info(`   EMA2 Bull: ${currentBar.ema2Bull} | EMA3 Bull: ${currentBar.ema3Bull}`);
  if (labels.buys.length > 0 || labels.sells.length > 0) AgentOutput.info(`   Labels: ${labels.buys.length} buy / ${labels.sells.length} sell`);
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
      const periods = (study.periods && study.periods.length > 0) ? study.periods : (chart.periods || []);
      const chartPeriods = chart.periods || [];
      const closeMap = new Map(chartPeriods.map(p => [p.$time ?? p.time, p.close ?? p.c]));
      const parsed = parseOutput({ periods, graphic: study.graphic || {}, bars, closeMap }, tf);
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
