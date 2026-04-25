#!/usr/bin/env node
/**
 * Ultra Sensitive SuperTrend — Standalone Runner
 * Pine ID: PUB;fc33f2d98699414a8585923116dbd959
 */

const fs = require('fs');
const path = require('path');
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env'), quiet: true });
const tv = require('./tv-optimized.cjs');

const PINE_ID = 'PUB;fc33f2d98699414a8585923116dbd959';
const SCRIPT_NAME = 'Ultra Sensitive SuperTrend';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'atrPeriod1', tvInputId: 'in_0', type: 'int', default: 10 },
  { variable: 'multiplier1', tvInputId: 'in_1', type: 'float', default: 1 },
  { variable: 'atrPeriod2', tvInputId: 'in_2', type: 'int', default: 5 },
  { variable: 'multiplier2', tvInputId: 'in_3', type: 'float', default: 0.5 },
  { variable: 'useHeikenAshi', tvInputId: 'in_4', type: 'bool', default: true },
  { variable: 'showLabels', tvInputId: 'in_5', type: 'bool', default: true },
  { variable: 'showBG', tvInputId: 'in_6', type: 'bool', default: true }
];

let STRICT_JSON_STDOUT = false;
function info(...args) { if (!STRICT_JSON_STDOUT) console.log(...args); }
function warn(...args) { if (!STRICT_JSON_STDOUT) console.warn(...args); }

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
Ultra Sensitive SuperTrend — Standalone Runner
Usage: node ultra-sensitive-supertrend.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --help
Inputs: atrPeriod1, multiplier1, atrPeriod2, multiplier2, useHeikenAshi, showLabels, showBG
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
  info(`📝 Applying input overrides...`);
  for (const [key, value] of Object.entries(inputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) { warn(`   ⚠️  Unknown input: ${key}`); continue; }
    try { const tvInputDef = indicator.inputs[mapping.tvInputId]; if (!tvInputDef) { warn(`   ⚠️  Input ${key} not in indicator`); continue; } const typed = _coerce(value, mapping.type); indicator.setOption(mapping.tvInputId, typed); info(`   ✅ ${key} → ${mapping.tvInputId}: ${JSON.stringify(typed)} (${tvInputDef.type})`); } catch (e) { warn(`   ⚠️  ${key} failed: ${e.message}`); }
  }
}

function _getField(p, names) { for (const n of names) { if (p[n] !== undefined && p[n] !== null) return p[n]; } return undefined; }

function parseOutput(rawData, timeframe) {
  const periods = rawData?.periods || [];
  const data = periods.map(p => ({
    timestamp: p.$time, datetime: new Date(p.$time * 1000).toISOString(),
    st1: _getField(p, ['ST1', 'st1', 'BaseSuperTrend', 'Supertrend1']),
    st2: _getField(p, ['ST2', 'st2', 'ST1SuperTrend', 'Supertrend2']),
    st1Color: _getField(p, ['ST1_colorer', 'st1Colorer', 'ST1Color']),
    st2Color: _getField(p, ['ST2_colorer', 'st2Colorer', 'ST2Color']),
    background: _getField(p, ['background', 'Background', 'background_colorer', 'Background_colorer', 'BackgroundColor', 'backgroundColor']),
    buySignal: _getField(p, ['BUY', 'Buy', 'buySignal', 'BuySignal']) === 1 || _getField(p, ['BUY', 'Buy', 'buySignal', 'BuySignal']) === true,
    sellSignal: _getField(p, ['SELL', 'Sell', 'sellSignal', 'SellSignal']) === 1 || _getField(p, ['SELL', 'Sell', 'sellSignal', 'SellSignal']) === true,
    ultraBuy: _getField(p, ['UltraBuy', 'ultraBuy', 'UltraBull', 'ultraBull']) === 1 || _getField(p, ['UltraBuy', 'ultraBuy', 'UltraBull', 'ultraBull']) === true,
    ultraSell: _getField(p, ['UltraSell', 'ultraSell', 'UltraBear', 'ultraBear']) === 1 || _getField(p, ['UltraSell', 'ultraSell', 'UltraBear', 'ultraBear']) === true,
    close: _getField(p, ['Close', 'close', 'c']),
  }));
  if (data.length === 0) return { error: 'No data', meta: { pineId: PINE_ID, timeframe } };

  const last = data[0];
  // ST1 color: trend1==1 is bullish (green), trend1==-1 is bearish (red)
  const st1Bullish = last.st1Color === 1 || last.st1Color === 'green' || last.st1Color === 'lime';
  const st2Bullish = last.st2Color === 2 || last.st2Color === 'green' || last.st2Color === 'lime';
  const aligned = st1Bullish === st2Bullish;
  const combinedTrend = st1Bullish && st2Bullish ? 'BULLISH' : !st1Bullish && !st2Bullish ? 'BEARISH' : 'MIXED';
  const backgroundBull = last.background === 4 || last.background === 'bull' || last.background === 'green';
  const backgroundBear = last.background === 5 || last.background === 'bear' || last.background === 'red';
  const backgroundTrend = backgroundBull ? 'BULLISH' : backgroundBear ? 'BEARISH' : 'NEUTRAL';

  // Track ST1 and ST2 values over time for cross detection
  const st1Crosses = [];
  for (let i = 0; i < data.length - 1; i++) {
    const prev = data[i + 1], curr = data[i];
    if (prev.st1 && curr.st1 && ((prev.close > prev.st1 && curr.close <= curr.st1) || (prev.close <= prev.st1 && curr.close > curr.st1))) {
      st1Crosses.push({ barsAgo: i, type: curr.close > curr.st1 ? 'BULLISH_CROSS' : 'BEARISH_CROSS', st1: curr.st1, close: curr.close });
    }
  }

  const buySignals = data.filter(d => d.buySignal).length;
  const sellSignals = data.filter(d => d.sellSignal).length;
  const ultraBuyCount = data.filter(d => d.ultraBuy).length;
  const ultraSellCount = data.filter(d => d.ultraSell).length;

  const lastBuy = data.findIndex(d => d.buySignal);
  const lastSell = data.findIndex(d => d.sellSignal);
  const lastUltraBuy = data.findIndex(d => d.ultraBuy);
  const lastUltraSell = data.findIndex(d => d.ultraSell);

  const summary = { totalBars: data.length, buySignals, sellSignals, ultraBuy: ultraBuyCount, ultraSell: ultraSellCount, aligned, combinedTrend };
  const currentBar = { timestamp: last.timestamp, datetime: last.datetime, st1: last.st1, st2: last.st2, st1Trend: st1Bullish ? 'BULL' : 'BEAR', st2Trend: st2Bullish ? 'BULL' : 'BEAR', backgroundTrend, buySignal: last.buySignal, sellSignal: last.sellSignal, ultraBuy: last.ultraBuy, ultraSell: last.ultraSell };

  const signals = _generateSignals(combinedTrend, aligned, last, { buySignals, sellSignals, ultraBuy: ultraBuyCount, ultraSell: ultraSellCount });
  const narrative = _generateNarrative(combinedTrend, aligned, summary, signals);
  const agenticScore = _computeAgenticScore(combinedTrend, aligned, summary, last);

  return { summary, currentBar, st1Crosses: st1Crosses.slice(0, 5), signalHistory: { lastBuy: lastBuy >= 0 ? lastBuy : null, lastSell: lastSell >= 0 ? lastSell : null, lastUltraBuy: lastUltraBuy >= 0 ? lastUltraBuy : null, lastUltraSell: lastUltraSell >= 0 ? lastUltraSell : null }, signals, narrative, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: periods.length }, enhanced: { signals, narrative, agenticScore } };
}

function _generateSignals(combinedTrend, aligned, last, counts) {
  const generated = [];
  const direction = aligned ? (combinedTrend === 'BULLISH' ? 'long' : combinedTrend === 'BEARISH' ? 'short' : 'neutral') : 'neutral';
  if (direction === 'neutral') return generated;
  const confluenceScore = aligned ? (last.ultraBuy || last.ultraSell ? 0.9 : 0.7) : 0.4;
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.65 ? 'HIGH' : 'MED';
  generated.push({ rank: 1, setupType: 'dual_supertrend', direction, confluenceScore: _round(confluenceScore, 2), confidence, rationale: `${direction === 'long' ? 'Bullish' : 'Bearish'} dual ST alignment. ST1=${direction === 'long' ? 'bull' : 'bear'}, ST2=${direction === 'long' ? 'bull' : 'bear'}. ${last.ultraBuy || last.ultraSell ? 'Ultra signal active.' : ''}` });
  return generated;
}

function _generateNarrative(combinedTrend, aligned, summary, signals) {
  const parts = [`Dual SuperTrend: ${combinedTrend}. Aligned: ${aligned}.`];
  const warnings = [];
  if (!aligned) warnings.push('ST1 and ST2 disagree — wait for alignment.');
  if (summary.buySignals === 0 && summary.sellSignals === 0) warnings.push('No signals in lookback — possible range.');
  const watchlist = ['Ultra signals indicate high-confidence reversal.', 'Watch for ST1 cross as early signal.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'Wait for dual alignment.', warnings, watchlist };
}

function _computeAgenticScore(combinedTrend, aligned, summary, last) {
  let score = 0.2;
  if (aligned) score += 0.25;
  if (combinedTrend !== 'MIXED') score += 0.15;
  if (last.ultraBuy || last.ultraSell) score += 0.2;
  if (summary.buySignals > 0 || summary.sellSignals > 0) score += 0.1;
  if (summary.ultraBuy > 0 || summary.ultraSell > 0) score += 0.1;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, currentBar, st1Crosses, signalHistory, signals, narrative, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'ultra-sensitive-supertrend', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: null },
    trend: { combined: summary.combinedTrend, aligned: summary.aligned, st1: currentBar.st1Trend, st2: currentBar.st2Trend, background: currentBar.backgroundTrend },
    signals: { buy: summary.buySignals, sell: summary.sellSignals, ultraBuy: summary.ultraBuy, ultraSell: summary.ultraSell, currentBuy: currentBar.buySignal, currentSell: currentBar.sellSignal },
    st1Crosses, signalHistory,
    opportunities: signals.map(s => ({ rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice: null, isStale: false, rationale: s.rationale })),
    narrative, conformance: { hasValidData: summary.totalBars > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

function printResults(result) {
  const { summary, currentBar, st1Crosses, signalHistory, signals, narrative, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  ULTRA SENSITIVE SUPERTREND — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n📊 TREND (${summary.totalBars} bars)`);
  console.log(`   Combined: ${summary.combinedTrend} | Aligned: ${summary.aligned}`);
  console.log(`   Signals: Buy=${summary.buySignals} Sell=${summary.sellSignals} UltraBuy=${summary.ultraBuy} UltraSell=${summary.ultraSell}`);
  if (st1Crosses.length > 0) console.log(`   Last ST1 Cross: ${st1Crosses[0].type} (${st1Crosses[0].barsAgo} bars ago)`);
  console.log(`\n📈 CURRENT BAR`);
  console.log(`   ST1: ${currentBar.st1} (${currentBar.st1Trend}) | ST2: ${currentBar.st2} (${currentBar.st2Trend})`);
  console.log(`   Buy: ${currentBar.buySignal} | Sell: ${currentBar.sellSignal} | UltraBuy: ${currentBar.ultraBuy} | UltraSell: ${currentBar.ultraSell}`);
  console.log(`   Background: ${currentBar.backgroundTrend}`);
  console.log(`   Last signal: Buy=${signalHistory.lastBuy} Sell=${signalHistory.lastSell} UltraBuy=${signalHistory.lastUltraBuy} UltraSell=${signalHistory.lastUltraSell}`);
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
      if (/maximum number of studies/i.test(err.message) && attempt < 3) { info(`⚠️ Retry ${attempt}/3...`); try { chart.delete(); } catch {} try { client.end(); } catch {} await new Promise(r => setTimeout(r, attempt * 3000)); continue; }
      throw err;
    } finally { try { study.remove(); } catch {} try { chart.delete(); } catch {} try { client.end(); } catch {} }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  STRICT_JSON_STDOUT = args.json === true;
  if (args.help || (!args._symbol && process.argv.length <= 2)) { printUsage(); process.exit(0); }
  const startTime = Date.now();
  info(`\n📊 Running: ${PINE_ID} | ${args.symbol} | ${args.tf} | ${args.bars} bars`);
  if (args.dryRun) {
    const dry = JSON.stringify({ status: 'dry_run', ...args, timestamp: new Date().toISOString() }, null, 2);
    if (args.json) console.log(dry);
    else { info('\n🏜️ DRY RUN'); info(dry); }
    process.exit(EXIT_CODES.SUCCESS);
  }
  try {
    const result = await runWebSocket(args.symbol, args.tf, args.bars, startTime, args.inputs);
    if (args.verbose) info(`\n✓ Completed in ${result.meta.durationMs}ms`);
    if (args.json) { const output = args.agent ? transformForAgentMode(result, args) : result; const json = JSON.stringify(output, null, 2); if (args.out) { fs.writeFileSync(args.out, json); info(`✅ Saved to ${args.out}`); } else console.log(json); }
    else printResults(result);
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) { const isCritical = /SESSION|SIGNATURE|connection/i.test(err.message); console.error(`\n❌ Error: ${err.message}`); process.exit(isCritical ? EXIT_CODES.CRITICAL : EXIT_CODES.VALIDATION); }
}
main().catch(err => { console.error(`\n❌ Unexpected: ${err.message}`); process.exit(1); });
