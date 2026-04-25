#!/usr/bin/env node
/**
 * Shemar SMC Confidence — Standalone Runner
 * Pine ID: PUB;70f6e4e05f9c439c9d1f8fe26019357e
 * Fields: hma, supertrend, kernel, buy, sell, closeBuy, closeSell, filteredBuy, filteredSell
 * Features: HMA + Supertrend + Kernel + Squeeze Momentum + BOS tracking + HTF filter + Confidence score
 */

const fs = require('fs');
const path = require('path');
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env') });
const tv = require('./tv-optimized.cjs');

const PINE_ID = 'PUB;70f6e4e05f9c439c9d1f8fe26019357e';
const SCRIPT_NAME = 'Shemar SMC Confidence';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'hmaLength', tvInputId: 'in_0', type: 'int', default: 50 },
  { variable: 'atrPeriod', tvInputId: 'in_1', type: 'int', default: 10 },
  { variable: 'factor', tvInputId: 'in_2', type: 'float', default: 3 },
  { variable: 'enableShorts', tvInputId: 'in_3', type: 'bool', default: true },
  { variable: 'useStopEntry', tvInputId: 'in_4', type: 'bool', default: true },
  { variable: 'stopEntryOffset', tvInputId: 'in_5', type: 'float', default: 1 },
  { variable: 'htfPeriod', tvInputId: 'in_6', type: 'int', default: 50 },
  { variable: 'sqzLength', tvInputId: 'in_7', type: 'int', default: 20 },
  { variable: 'sqzMult', tvInputId: 'in_8', type: 'int', default: 2 },
  { variable: 'sqzKCLength', tvInputId: 'in_9', type: 'int', default: 20 },
  { variable: 'sqzKCMult', tvInputId: 'in_10', type: 'float', default: 1.5 },
  { variable: 'sqzThreshold', tvInputId: 'in_11', type: 'float', default: 0.8 },
  { variable: 'sqzTF', tvInputId: 'in_12', type: 'string', default: '5' },
  { variable: 'kernelPeriod', tvInputId: 'in_13', type: 'int', default: 30 },
  { variable: 'confidenceThresh', tvInputId: 'in_14', type: 'int', default: 30 },
  { variable: 'showScore', tvInputId: 'in_15', type: 'bool', default: true }
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
Shemar SMC Confidence — Standalone Runner
Usage: node shemar-smc-confidence.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --help
Inputs: hmaLength, atrPeriod, factor, enableShorts, useStopEntry, stopEntryOffset, htfPeriod, sqzLength, sqzMult, sqzKCLength, sqzKCMult, sqzThreshold, sqzTF, kernelPeriod, confidenceThresh, showScore
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

function parseOutput(rawData, timeframe) {
  const periods = rawData?.periods || [];
  const ohlcv = rawData?.ohlcv || [];
  const bars = [];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const o = ohlcv[i];
    const entry = {
      time: p.time, barIndex: p.index,
      hma: p.hma ?? p.HMA ?? null,
      supertrend: p.supertrend ?? p.Supertrend ?? p.SuperTrend ?? null,
      kernel: p.kernel ?? p.Kernel ?? null,
      buy: p.buy ?? p.Buy ?? null,
      sell: p.sell ?? p.Sell ?? null,
      closeBuy: p.closeBuy ?? p.CloseBuy ?? p['Close Buy'] ?? null,
      closeSell: p.closeSell ?? p.CloseSell ?? p['Close Sell'] ?? null,
      filteredBuy: p.filteredBuy ?? p.FilteredBuy ?? p['Filtered Buy'] ?? null,
      filteredSell: p.filteredSell ?? p.FilteredSell ?? p['Filtered Sell'] ?? null,
      open: o?.open ?? p.open, high: o?.high ?? p.high, low: o?.low ?? p.low, close: o?.close ?? p.close,
    };
    bars.push(entry);
  }

  // Squeeze state detection (HMA converges with Supertrend bands = squeeze)
  const squeezeStates = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const prev = bars[i - 1];
    const hmaDist = b.hma && b.supertrend ? Math.abs(b.hma - b.supertrend) : null;
    const prevDist = prev.hma && prev.supertrend ? Math.abs(prev.hma - prev.supertrend) : null;
    let state = 'unknown';
    if (hmaDist !== null && prevDist !== null) {
      if (hmaDist < prevDist * 0.7) state = 'SQUEEZE_ON';
      else if (hmaDist > prevDist * 1.3) state = 'SQUEEZE_RELEASE';
      else state = 'SQUEEZE_OFF';
    }
    squeezeStates.push({ time: b.time, state, hmaDist: hmaDist ? _round(hmaDist) : null });
  }
  const latestSqueeze = squeezeStates[squeezeStates.length - 1];

  // BOS tracking: when HMA crosses Supertrend
  const bosEvents = [];
  for (let i = 1; i < bars.length; i++) {
    const curr = bars[i], prev = bars[i - 1];
    if (curr.hma && curr.supertrend && prev.hma && prev.supertrend) {
      if (prev.hma <= prev.supertrend && curr.hma > curr.supertrend) {
        bosEvents.push({ time: curr.time, type: 'BOS_BULLISH', price: curr.close, hma: curr.hma, st: curr.supertrend });
      } else if (prev.hma >= prev.supertrend && curr.hma < curr.supertrend) {
        bosEvents.push({ time: curr.time, type: 'BOS_BEARISH', price: curr.close, hma: curr.hma, st: curr.supertrend });
      }
    }
  }
  const recentBOS = bosEvents.slice(-5);

  // Filtered signal quality
  const filteredBuys = bars.filter(b => b.filteredBuy && b.filteredBuy !== 0 && b.filteredBuy !== false && b.filteredBuy !== null);
  const filteredSells = bars.filter(b => b.filteredSell && b.filteredSell !== 0 && b.filteredSell !== false && b.filteredSell !== null);
  const rawBuys = bars.filter(b => b.buy && b.buy !== 0 && b.buy !== false && b.buy !== null);
  const rawSells = bars.filter(b => b.sell && b.sell !== 0 && b.sell !== false && b.sell !== null);

  const filterRatio = (filteredBuys.length + filteredSells.length) / Math.max(rawBuys.length + rawSells.length, 1);

  // Kernel regime
  const kernels = bars.map(b => b.kernel).filter(k => k !== null && k !== undefined);
  const latestKernel = kernels[kernels.length - 1] || 0;
  const kernelTrend = latestKernel > 0.5 ? 'BULL' : latestKernel < -0.5 ? 'BEAR' : 'NEUTRAL';

  // Signal state timeline
  const signalTimeline = bars.slice(-20).map(b => ({
    time: b.time,
    rawSignal: b.buy ? 'BUY' : b.sell ? 'SELL' : 'NONE',
    filteredSignal: b.filteredBuy ? 'FILTERED_BUY' : b.filteredSell ? 'FILTERED_SELL' : 'NONE',
    closeSignal: b.closeBuy ? 'CLOSE_BUY' : b.closeSell ? 'CLOSE_SELL' : 'NONE',
  }));

  // HTF alignment (inferred from kernel + BOS consistency)
  const htfAligned = recentBOS.length > 0 && ((recentBOS[recentBOS.length - 1].type === 'BOS_BULLISH' && kernelTrend === 'BULL') || (recentBOS[recentBOS.length - 1].type === 'BOS_BEARISH' && kernelTrend === 'BEAR'));

  // Confidence score calculation
  const confidenceScore = _calculateConfidence(filterRatio, htfAligned, latestSqueeze, kernelTrend, recentBOS.length);

  const summary = {
    totalBars: bars.length, rawBuySignals: rawBuys.length, rawSellSignals: rawSells.length,
    filteredBuySignals: filteredBuys.length, filteredSellSignals: filteredSells.length,
    filterRatio: _round(filterRatio), bosEvents: bosEvents.length, recentBOS: recentBOS.length,
    latestSqueeze: latestSqueeze?.state, kernelTrend, htfAligned, confidenceScore
  };

  const signals = _generateSignals(kernelTrend, latestSqueeze, htfAligned, confidenceScore, filteredBuys, filteredSells);
  const narrative = _generateNarrative(summary, signals);
  const agenticScore = _computeAgenticScore(bars.length, confidenceScore, bosEvents.length);

  return { summary, bars: bars.slice(-20), squeezeStates: squeezeStates.slice(-10), bosEvents: recentBOS, signalTimeline, signals, narrative, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: periods.length, dataSource: 'periods' }, enhanced: { signals, narrative, agenticScore } };
}

function _calculateConfidence(filterRatio, htfAligned, latestSqueeze, kernelTrend, bosCount) {
  let score = 0.3;
  score += filterRatio * 0.2;
  if (htfAligned) score += 0.2;
  if (latestSqueeze?.state === 'SQUEEZE_RELEASE') score += 0.15;
  if (kernelTrend !== 'NEUTRAL') score += 0.1;
  if (bosCount > 0) score += 0.05;
  return _round(Math.min(score, 0.99), 2);
}

function _generateSignals(kernelTrend, latestSqueeze, htfAligned, confidenceScore, filteredBuys, filteredSells) {
  const generated = [];
  const lastBuy = filteredBuys[filteredBuys.length - 1];
  const lastSell = filteredSells[filteredSells.length - 1];

  const direction = kernelTrend === 'BULL' && lastBuy ? 'long' : kernelTrend === 'BEAR' && lastSell ? 'short' : 'neutral';
  if (direction === 'neutral') return generated;

  const confluenceScore = _round(confidenceScore >= 0.7 ? 0.85 : confidenceScore >= 0.5 ? 0.65 : 0.45, 2);
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.60 ? 'HIGH' : confluenceScore >= 0.40 ? 'MED' : 'LOW';

  generated.push({ rank: 1, setupType: 'hma_kernel_squeeze', direction, confluenceScore, confidence, rationale: `${direction.toUpperCase()} signal. Kernel: ${kernelTrend}. Squeeze: ${latestSqueeze?.state || 'unknown'}. HTF aligned: ${htfAligned}. Confidence: ${confidenceScore}.` });

  return generated;
}

function _generateNarrative(summary, signals) {
  const parts = [`Shemar SMC: ${summary.rawBuySignals} raw buys, ${summary.rawSellSignals} raw sells. Filtered: ${summary.filteredBuySignals}/${summary.filteredSellSignals} (ratio: ${summary.filterRatio}).`];
  parts.push(`BOS events: ${summary.bosEvents}. Kernel: ${summary.kernelTrend}. Squeeze: ${summary.latestSqueeze}. HTF aligned: ${summary.htfAligned}.`);
  const warnings = [];
  if (summary.confidenceScore < 0.5) warnings.push('Low confidence — wait for squeeze release or HTF alignment.');
  if (summary.latestSqueeze === 'SQUEEZE_ON') warnings.push('Squeeze building — volatility expansion imminent.');
  if (summary.filterRatio < 0.3) warnings.push('High filter rejection — signals may be noisy.');
  const watchlist = ['Squeeze release + BOS = highest probability entry.', 'HTF alignment filters out counter-trend signals.', 'Kernel regime must match signal direction for confidence.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'Wait for filtered signal with HTF alignment.', warnings, watchlist };
}

function _computeAgenticScore(totalBars, confidenceScore, bosEvents) {
  let score = 0.2;
  if (totalBars > 0) score += 0.2;
  if (confidenceScore > 0.5) score += 0.15;
  if (confidenceScore > 0.7) score += 0.15;
  if (bosEvents > 0) score += 0.15;
  if (bosEvents > 2) score += 0.15;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, bars, squeezeStates, bosEvents, signalTimeline, signals, narrative, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'shemar-smc-confidence', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: 'inferred-same-tf' },
    signals: { rawBuys: summary.rawBuySignals, rawSells: summary.rawSellSignals, filteredBuys: summary.filteredBuySignals, filteredSells: summary.filteredSellSignals, filterRatio: summary.filterRatio },
    structure: { bosEvents: summary.bosEvents, recentBOS: bosEvents.map(b => ({ time: b.time, type: b.type, price: b.price })), latestSqueeze: summary.latestSqueeze },
    regime: { kernelTrend: summary.kernelTrend, htfAligned: summary.htfAligned, confidenceScore: summary.confidenceScore },
    timeline: signalTimeline.slice(-5),
    latestBars: bars.slice(-5).map(b => ({ time: b.time, close: b.close, hma: b.hma, supertrend: b.supertrend, kernel: b.kernel, filteredBuy: b.filteredBuy, filteredSell: b.filteredSell })),
    opportunities: signals.map(s => ({ rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice: null, isStale: false, rationale: s.rationale })),
    narrative, conformance: { hasValidData: summary.totalBars > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

function printResults(result) {
  const { summary, bars, squeezeStates, bosEvents, signalTimeline, signals, narrative, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  SHEMAR SMC CONFIDENCE — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n📊 SIGNALS (${summary.totalBars} bars)`);
  console.log(`   Raw: ${summary.rawBuySignals} buy, ${summary.rawSellSignals} sell`);
  console.log(`   Filtered: ${summary.filteredBuySignals} buy, ${summary.filteredSellSignals} sell | Ratio: ${summary.filterRatio}`);
  console.log(`\n📈 REGIME | Kernel: ${summary.kernelTrend} | HTF Aligned: ${summary.htfAligned}`);
  console.log(`   Confidence: ${summary.confidenceScore} | Squeeze: ${summary.latestSqueeze}`);
  console.log(`\n📉 BOS | Total: ${summary.bosEvents} | Recent: ${summary.recentBOS}`);
  if (bosEvents.length > 0) { bosEvents.forEach(b => console.log(`   ${new Date(b.time).toISOString().slice(11,19)} | ${b.type} @ ${_round(b.price)}`)); }
  if (squeezeStates.length > 0) { console.log('\n🌀 SQUEEZE'); squeezeStates.slice(-3).forEach(s => console.log(`   ${new Date(s.time).toISOString().slice(11,19)} | ${s.state} | Dist: ${s.hmaDist}`)); }
  if (signalTimeline.length > 0) { console.log('\n📊 TIMELINE'); signalTimeline.slice(-3).forEach(t => console.log(`   ${t.rawSignal} → ${t.filteredSignal} | ${t.closeSignal}`)); }
  if (bars.length > 0) { console.log('\n📊 LAST BARS'); bars.slice(-3).forEach(b => console.log(`   ${new Date(b.time).toISOString().slice(11,19)} | HMA: ${_round(b.hma)} | ST: ${_round(b.supertrend)} | K: ${_round(b.kernel)}`)); }
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
