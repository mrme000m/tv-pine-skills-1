#!/usr/bin/env node
/**
 * Buying-Selling Volume — Standalone Runner
 * Pine ID: PUB;28a4da159ce246dab2cb6524c25f950f
 * Fields: BuyVolume, SellVolume, MABuy, MASell, BarColor, BackgroundColor
 * BarColor: 0=both above MAs, 1=both below, 2=mixed, 3=neutral
 * BackgroundColor: 4=bull, 5=bear, 6=mixed, 7=neutral
 */

const fs = require('fs');
const path = require('path');
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env'), quiet: true });
const tv = require('./tv-optimized.cjs');

const PINE_ID = 'PUB;28a4da159ce246dab2cb6524c25f950f';
const SCRIPT_NAME = 'Buying Selling Volume';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'lengthMA1', tvInputId: 'in_0', type: 'int', default: 10 },
  { variable: 'lengthMA2', tvInputId: 'in_1', type: 'int', default: 10 },
  { variable: 'maType', tvInputId: 'in_2', type: 'string', default: 'SMA' }
];

const PRESETS = {
  scalping: { lengthMA1: 9, lengthMA2: 21, maType: 'EMA' },
  default: { lengthMA1: 10, lengthMA2: 10, maType: 'SMA' },
  swing: { lengthMA1: 50, lengthMA2: 200, maType: 'SMA' },
};

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
    else if (a === '--preset' && argv[i + 1]) args.preset = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--agent') { args.json = true; args.agent = true; }
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  if (args.preset && PRESETS[args.preset]) { args.inputs = { ...args.inputs, ...PRESETS[args.preset] }; }
  return args;
}

function printUsage() {
  console.log(`
Buying Selling Volume — Standalone Runner
Usage: node buying-selling-volume.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --preset (scalping|default|swing), --json, --agent, --out, --verbose, --dry-run, --help
Inputs: lengthMA1, lengthMA2, maType
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

function _toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _field(obj, names) {
  if (!obj) return null;
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return null;
}

function _priceOrNull(v) {
  const n = _toNumber(v);
  return n != null && n > 0 ? n : null;
}

function parseOutput(rawData, timeframe) {
  const periods = rawData?.periods || [];
  const ohlcv = rawData?.ohlcv || [];
  const bars = [];
  const ohlcvByTime = new Map();
  for (const c of ohlcv) {
    const t = _toNumber(_field(c, ['$time', 'time', 'timestamp']));
    if (t != null) ohlcvByTime.set(t, c);
  }

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const pTime = _toNumber(_field(p, ['$time', 'time', 'timestamp']));
    const o = (pTime != null && ohlcvByTime.has(pTime)) ? ohlcvByTime.get(pTime) : ohlcv[i];
    const buyRaw = _toNumber(_field(p, ['BuyVolume', 'buyVolume', 'Buy Volume']));
    const sellRaw = _toNumber(_field(p, ['SellVolume', 'sellVolume', 'Sell Volume']));
    const maBuyRaw = _toNumber(_field(p, ['MABuy', 'maBuy', 'MA Buy']));
    const maSellRaw = _toNumber(_field(p, ['MASell', 'maSell', 'MA Sell']));
    const buyVolume = buyRaw == null ? null : Math.abs(buyRaw);
    const sellVolume = sellRaw == null ? null : Math.abs(sellRaw);
    const entry = {
      time: pTime ?? _toNumber(_field(o, ['$time', 'time', 'timestamp'])),
      barIndex: _toNumber(_field(p, ['index', '$i'])) ?? i,
      buyVolume,
      sellVolume,
      buyVolumeRaw: buyRaw,
      sellVolumeRaw: sellRaw,
      maBuy: maBuyRaw,
      maSell: maSellRaw,
      barColor: _toNumber(_field(p, ['BarColor', 'barColor', 'Bar Color'])),
      backgroundColor: _toNumber(_field(p, ['BackgroundColor', 'backgroundColor', 'Background Color'])),
      open: _priceOrNull(_field(o, ['open', 'o'])) ?? _priceOrNull(_field(p, ['open', 'o'])),
      high: _priceOrNull(_field(o, ['high', 'h'])) ?? _priceOrNull(_field(p, ['high', 'h'])),
      low: _priceOrNull(_field(o, ['low', 'l'])) ?? _priceOrNull(_field(p, ['low', 'l'])),
      close: _priceOrNull(_field(o, ['close', 'c'])) ?? _priceOrNull(_field(p, ['close', 'c'])),
    };

    // Resolve bar color state
    entry.barColorState = _resolveBarColor(entry.barColor);
    entry.backgroundState = _resolveBackgroundColor(entry.backgroundColor);

    // Pressure ratio
    const totalVolume = (entry.buyVolume ?? 0) + (entry.sellVolume ?? 0);
    entry.volumeDominance = totalVolume > 0 ? ((entry.buyVolume ?? 0) - (entry.sellVolume ?? 0)) / totalVolume : 0;

    // MA cross detection
    entry.maCross = _detectMACross(periods, i);

    bars.push(entry);
  }

  // Compute pressure timeline
  const lastBars = bars.slice(-20);
  const buyDominant = lastBars.filter(b => b.volumeDominance > 0.1).length;
  const sellDominant = lastBars.filter(b => b.volumeDominance < -0.1).length;
  const neutral = lastBars.length - buyDominant - sellDominant;
  const dominanceRatio = lastBars.length > 0 ? (buyDominant - sellDominant) / lastBars.length : 0;

  // Background trend consistency
  const bgStates = lastBars.map(b => b.backgroundState);
  const bgConsensus = bgStates.length > 0 ? _mode(bgStates) : 'neutral';

  // Cross summary
  const crossSignals = bars.filter(b => b.maCross).slice(-5);
  const currentBar = bars[bars.length - 1] || null;

  const summary = { totalBars: bars.length, buyDominant, sellDominant, neutral, dominanceRatio: _round(dominanceRatio), bgConsensus, recentCrosses: crossSignals.length };

  const signals = _generateSignals(bars, dominanceRatio, bgConsensus, crossSignals);
  const narrative = _generateNarrative(summary, signals);
  const agenticScore = _computeAgenticScore(bars.length, dominanceRatio, crossSignals.length);

  return { summary, currentBar, bars: bars.slice(-20), recentCrosses: crossSignals, signals, narrative, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: periods.length, dataSource: 'periods' }, enhanced: { signals, narrative, agenticScore } };
}

function _resolveBarColor(code) {
  const map = { 0: 'both_above_mas', 1: 'both_below_mas', 2: 'mixed', 3: 'neutral' };
  return map[code] || 'unknown';
}

function _resolveBackgroundColor(code) {
  const map = { 4: 'bull', 5: 'bear', 6: 'mixed', 7: 'neutral' };
  return map[code] || 'unknown';
}

function _detectMACross(periods, idx) {
  if (idx < 1) return null;
  const curr = periods[idx], prev = periods[idx - 1];

  const currBg = _toNumber(_field(curr, ['BackgroundColor', 'backgroundColor', 'Background Color']));
  const prevBg = _toNumber(_field(prev, ['BackgroundColor', 'backgroundColor', 'Background Color']));
  if (currBg === 4 && prevBg !== 4) return 'BULLISH_CROSS';
  if (currBg === 5 && prevBg !== 5) return 'BEARISH_CROSS';

  const currMA1 = curr.MABuy ?? curr.maBuy ?? curr['MA Buy'] ?? null;
  const currMA2 = curr.MASell ?? curr.maSell ?? curr['MA Sell'] ?? null;
  const prevMA1 = prev.MABuy ?? prev.maBuy ?? prev['MA Buy'] ?? null;
  const prevMA2 = prev.MASell ?? prev.maSell ?? prev['MA Sell'] ?? null;
  if (currMA1 === null || currMA2 === null || prevMA1 === null || prevMA2 === null) return null;
  const c1 = Math.abs(currMA1), c2 = Math.abs(currMA2), p1 = Math.abs(prevMA1), p2 = Math.abs(prevMA2);
  if (p1 <= p2 && c1 > c2) return 'BULLISH_CROSS';
  if (p1 >= p2 && c1 < c2) return 'BEARISH_CROSS';
  return null;
}

function _mode(arr) {
  const counts = {};
  arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
}

function _generateSignals(bars, dominanceRatio, bgConsensus, crossSignals) {
  const generated = [];
  const lastBar = bars[bars.length - 1];
  if (!lastBar) return generated;
  const direction = dominanceRatio > 0.3 && bgConsensus === 'bull' ? 'long' : dominanceRatio < -0.3 && bgConsensus === 'bear' ? 'short' : 'neutral';
  if (direction === 'neutral') return generated;
  const crossType = crossSignals[0]?.maCross;
  const confluenceScore = _round((Math.abs(dominanceRatio) > 0.4 && bgConsensus !== 'neutral') ? 0.85 : 0.60, 2);
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.60 ? 'HIGH' : confluenceScore >= 0.40 ? 'MED' : 'LOW';
  generated.push({ rank: 1, setupType: 'volume_pressure_with_ma', direction, confluenceScore, confidence, rationale: `${direction === 'long' ? 'Buy' : 'Sell'} pressure dominant (${_round(dominanceRatio)}). Background: ${bgConsensus}. MA cross: ${crossType || 'none'}.` });
  return generated;
}

function _generateNarrative(summary, signals) {
  const parts = [`Volume Analysis: ${summary.buyDominant} buy bars, ${summary.sellDominant} sell bars, ${summary.neutral} neutral.`];
  parts.push(`Dominance ratio: ${summary.dominanceRatio}. Background consensus: ${summary.bgConsensus}.`);
  if (summary.recentCrosses > 0) parts.push(`${summary.recentCrosses} MA cross${summary.recentCrosses > 1 ? 'es' : ''} in last 20 bars.`);
  const warnings = [];
  if (Math.abs(summary.dominanceRatio) < 0.2) warnings.push('Low volume dominance — wait for clearer pressure.');
  if (summary.neutral > 10) warnings.push('High neutral bar count — market indecision.');
  const watchlist = ['Watch for MA crosses to confirm volume pressure.', 'Background color should align with volume bias for best entries.', 'High neutral periods suggest consolidation.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'Wait for dominant volume pressure.', warnings, watchlist };
}

function _computeAgenticScore(totalBars, dominanceRatio, recentCrosses) {
  let score = 0.2;
  if (totalBars > 0) score += 0.2;
  if (Math.abs(dominanceRatio) > 0.2) score += 0.15;
  if (Math.abs(dominanceRatio) > 0.5) score += 0.15;
  if (recentCrosses > 0) score += 0.15;
  if (recentCrosses > 2) score += 0.15;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, currentBar, bars, recentCrosses, signals, narrative, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'buying-selling-volume', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: null },
    volume: { buyDominant: summary.buyDominant, sellDominant: summary.sellDominant, neutral: summary.neutral, dominanceRatio: summary.dominanceRatio, bgConsensus: summary.bgConsensus, recentCrosses: summary.recentCrosses },
    latestBars: bars.slice(-5).map(b => ({ time: b.time, close: b.close, buyVolume: b.buyVolume, sellVolume: b.sellVolume, barState: b.barColorState, bgState: b.backgroundState, dominance: b.volumeDominance })),
    recentCrosses: recentCrosses.map(c => ({ time: c.time, type: c.maCross, price: c.close })),
    opportunities: signals.map(s => ({ rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice: null, isStale: false, rationale: s.rationale })),
    summary,
    currentBar,
    recentBars: bars,
    signals,
    narrative, conformance: { hasValidData: summary.totalBars > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

function printResults(result) {
  const { summary, bars, recentCrosses, signals, narrative, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  BUYING SELLING VOLUME — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n📊 VOLUME (${summary.totalBars} bars)`);
  console.log(`   Buy Dominant: ${summary.buyDominant} | Sell Dominant: ${summary.sellDominant} | Neutral: ${summary.neutral}`);
  console.log(`   Dominance Ratio: ${summary.dominanceRatio} | BG Consensus: ${summary.bgConsensus}`);
  console.log(`   Recent MA Crosses: ${summary.recentCrosses}`);
  if (bars.length > 0) { console.log('\n📈 LAST BARS'); bars.slice(-5).forEach(b => console.log(`   ${new Date(b.time).toISOString().slice(11,19)} | Buy: ${_round(b.buyVolume)} | Sell: ${_round(b.sellVolume)} | ${b.barColorState} | BG: ${b.backgroundState}`)); }
  if (recentCrosses.length > 0) { console.log('\n↔️ MA CROSSES'); recentCrosses.forEach(c => console.log(`   ${new Date(c.time).toISOString().slice(11,19)} | ${c.maCross}`)); }
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
      const rawData = { periods: study.periods || [], ohlcv: chart.periods || [], bars };
      const parsed = parseOutput(rawData, tf);
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
