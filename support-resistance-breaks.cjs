#!/usr/bin/env node
/**
 * Support Resistance Breaks — Standalone Runner
 * Pine ID: PUB;NXS6SoOdr880Hrvh9vA36UcAjC14bOkc
 * Note: Encrypted/obfuscated source. Fields inferred from observed behavior.
 * Fields: resistance, support, break, break2, break3, break4, supportBroken, resistanceBroken
 */

const fs = require('fs');
const path = require('path');
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env') });
const tv = require('./tv-optimized.cjs');

const PINE_ID = 'PUB;NXS6SoOdr880Hrvh9vA36UcAjC14bOkc';
const SCRIPT_NAME = 'Support Resistance Breaks';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'pivotLookback', tvInputId: 'in_0', type: 'int', default: 5 },
  { variable: 'pivotStrength', tvInputId: 'in_1', type: 'int', default: 3 },
  { variable: 'showSupport', tvInputId: 'in_2', type: 'bool', default: true },
  { variable: 'showResistance', tvInputId: 'in_3', type: 'bool', default: true },
  { variable: 'showBreaks', tvInputId: 'in_4', type: 'bool', default: true },
  { variable: 'breakIntensity', tvInputId: 'in_5', type: 'int', default: 2 },
  { variable: 'alertOnBreak', tvInputId: 'in_6', type: 'bool', default: true },
  { variable: 'srColor', tvInputId: 'in_7', type: 'color', default: '#2196f3' },
  { variable: 'breakColor', tvInputId: 'in_8', type: 'color', default: '#ff5722' },
  { variable: 'lineWidth', tvInputId: 'in_9', type: 'int', default: 2 },
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
Support Resistance Breaks — Standalone Runner
Usage: node support-resistance-breaks.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --help
Inputs: pivotLookback, pivotStrength, showSupport, showResistance, showBreaks, breakIntensity, alertOnBreak, srColor, breakColor, lineWidth
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
      resistance: p.resistance ?? p.Resistance ?? null,
      support: p.support ?? p.Support ?? null,
      break: p.break ?? p.Break ?? null,
      break2: p.break2 ?? p.Break2 ?? null,
      break3: p.break3 ?? p.Break3 ?? null,
      break4: p.break4 ?? p.Break4 ?? null,
      supportBroken: p.supportBroken ?? p.SupportBroken ?? p['Support Broken'] ?? null,
      resistanceBroken: p.resistanceBroken ?? p.ResistanceBroken ?? p['Resistance Broken'] ?? null,
      open: o?.open ?? p.open, high: o?.high ?? p.high, low: o?.low ?? p.low, close: o?.close ?? p.close,
    };
    bars.push(entry);
  }

  // S/R levels extraction (non-null values)
  const resistanceLevels = [...new Set(bars.map(b => b.resistance).filter(Boolean))].sort((a, b) => b - a);
  const supportLevels = [...new Set(bars.map(b => b.support).filter(Boolean))].sort((a, b) => a - b);

  // Break detection
  const breakEvents = [];
  for (let i = 1; i < bars.length; i++) {
    const curr = bars[i], prev = bars[i - 1];
    const breakTypes = [];
    if (curr.break && (!prev.break || curr.break !== prev.break)) breakTypes.push({ level: curr.break, type: 'break1' });
    if (curr.break2 && (!prev.break2 || curr.break2 !== prev.break2)) breakTypes.push({ level: curr.break2, type: 'break2' });
    if (curr.break3 && (!prev.break3 || curr.break3 !== prev.break3)) breakTypes.push({ level: curr.break3, type: 'break3' });
    if (curr.break4 && (!prev.break4 || curr.break4 !== prev.break4)) breakTypes.push({ level: curr.break4, type: 'break4' });

    if (breakTypes.length > 0) {
      breakEvents.push({ time: curr.time, price: curr.close, breakTypes, supportBroken: curr.supportBroken, resistanceBroken: curr.resistanceBroken });
    }
  }
  const recentBreaks = breakEvents.slice(-10);

  // Break intensity (number of simultaneous break levels)
  const maxIntensity = breakEvents.length > 0 ? Math.max(...breakEvents.map(b => b.breakTypes.length)) : 0;
  const avgIntensity = breakEvents.length > 0 ? breakEvents.reduce((s, b) => s + b.breakTypes.length, 0) / breakEvents.length : 0;

  // Confluence: multiple breaks at similar prices
  const breakPrices = breakEvents.flatMap(b => b.breakTypes.map(t => t.level));
  const confluenceClusters = _findConfluence(breakPrices, 0.005);

  // Support/Resistance broken flags
  const srBrokenEvents = bars.filter(b => b.supportBroken || b.resistanceBroken).slice(-10);

  // Current price position relative to S/R
  // OHLC may not be available from indicator periods; use lastPrice injected by runWebSocket
  const closePrice = (rawData?.lastPrice ?? 0) > 0 ? rawData.lastPrice : (bars[bars.length - 1]?.close ?? bars[bars.length - 1]?.c ?? null);
  const nearestResistance = closePrice ? resistanceLevels.find(r => r > closePrice) : null;
  const nearestSupport = closePrice ? [...supportLevels].reverse().find(s => s < closePrice) : null;
  const positionToSR = nearestResistance && nearestSupport ? (closePrice - nearestSupport) / (nearestResistance - nearestSupport) : null;

  const summary = {
    totalBars: bars.length, resistanceLevels: resistanceLevels.length, supportLevels: supportLevels.length,
    breakEvents: breakEvents.length, recentBreaks: recentBreaks.length, maxIntensity, avgIntensity: _round(avgIntensity),
    confluenceClusters: confluenceClusters.length, srBrokenEvents: srBrokenEvents.length,
    nearestResistance, nearestSupport, positionToSR: positionToSR ? _round(positionToSR) : null
  };

  const latest = bars[bars.length - 1] || {};
  const signals = _generateSignals(recentBreaks, confluenceClusters, positionToSR, latest);
  const narrative = _generateNarrative(summary, signals);
  const agenticScore = _computeAgenticScore(bars.length, breakEvents.length, confluenceClusters.length);

  return { summary, bars: bars.slice(-20), resistanceLevels: resistanceLevels.slice(0, 5), supportLevels: supportLevels.slice(0, 5), recentBreaks, confluenceClusters, srBrokenEvents, signals, narrative, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: periods.length, dataSource: 'periods' }, enhanced: { signals, narrative, agenticScore } };
}

function _findConfluence(prices, thresholdPct) {
  if (prices.length < 2) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const avg = current.reduce((a, b) => a + b, 0) / current.length;
    if (Math.abs(sorted[i] - avg) / avg < thresholdPct) {
      current.push(sorted[i]);
    } else {
      if (current.length >= 2) clusters.push({ price: _round(avg), count: current.length });
      current = [sorted[i]];
    }
  }
  if (current.length >= 2) clusters.push({ price: _round(current.reduce((a, b) => a + b, 0) / current.length), count: current.length });
  return clusters;
}

function _generateSignals(recentBreaks, confluenceClusters, positionToSR, latest) {
  const generated = [];
  if (recentBreaks.length === 0) return generated;

  const lastBreak = recentBreaks[recentBreaks.length - 1];
  const hasSupportBreak = lastBreak.supportBroken;
  const hasResistanceBreak = lastBreak.resistanceBroken;

  const direction = hasResistanceBreak ? 'long' : hasSupportBreak ? 'short' : 'neutral';
  if (direction === 'neutral') return generated;

  const confluenceScore = _round((confluenceClusters.length > 0 ? 0.2 : 0) + (lastBreak.breakTypes.length > 1 ? 0.2 : 0) + (positionToSR !== null && positionToSR > 0.5 && direction === 'long' ? 0.15 : positionToSR !== null && positionToSR < 0.5 && direction === 'short' ? 0.15 : 0), 2);
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.50 ? 'HIGH' : confluenceScore >= 0.30 ? 'MED' : 'LOW';

  generated.push({ rank: 1, setupType: 'sr_break', direction, confluenceScore, confidence, referencePrice: lastBreak.price, rationale: `${direction.toUpperCase()} break detected. Types: ${lastBreak.breakTypes.map(t => t.type).join(', ')}. ${confluenceClusters.length > 0 ? `Confluence at ${_round(confluenceClusters[0].price)} (${confluenceClusters[0].count}x).` : 'No confluence clusters — caution advised.'}` });

  return generated;
}

function _generateNarrative(summary, signals) {
  const parts = [`S/R Breaks: ${summary.breakEvents} events, ${summary.recentBreaks} recent. Intensity: max=${summary.maxIntensity}, avg=${summary.avgIntensity}.`];
  parts.push(`Levels: ${summary.resistanceLevels} resistance, ${summary.supportLevels} support. Confluence clusters: ${summary.confluenceClusters}.`);
  if (summary.nearestResistance) parts.push(`Nearest R: ${_round(summary.nearestResistance)} | S: ${_round(summary.nearestSupport)} | Position: ${summary.positionToSR}.`);
  const warnings = [];
  if (summary.breakEvents === 0) warnings.push('No break events — price may be consolidating within S/R bounds.');
  if (summary.confluenceClusters === 0 && summary.breakEvents > 0) warnings.push('Breaks lack confluence — lower conviction.');
  const watchlist = ['Break + retest = highest probability continuation.', 'Confluence clusters act as strong magnets for price.', 'Monitor break intensity > 2 for momentum confirmation.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'Wait for confirmed S/R break with confluence.', warnings, watchlist };
}

function _computeAgenticScore(totalBars, breakEvents, confluenceClusters) {
  let score = 0.2;
  if (totalBars > 0) score += 0.2;
  if (breakEvents > 0) score += 0.15;
  if (confluenceClusters > 0) score += 0.15;
  if (breakEvents > 3) score += 0.15;
  if (confluenceClusters > 1) score += 0.15;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, bars, resistanceLevels, supportLevels, recentBreaks, confluenceClusters, srBrokenEvents, signals, narrative, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'support-resistance-breaks', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: null },
    levels: { resistance: resistanceLevels, support: supportLevels, nearestResistance: summary.nearestResistance, nearestSupport: summary.nearestSupport, positionToSR: summary.positionToSR },
    breaks: { totalEvents: summary.breakEvents, recentBreaks: recentBreaks.map(b => ({ time: b.time, price: b.price, types: b.breakTypes.map(t => t.type), supportBroken: b.supportBroken, resistanceBroken: b.resistanceBroken })), maxIntensity: summary.maxIntensity, avgIntensity: summary.avgIntensity },
    confluence: confluenceClusters,
    srBroken: srBrokenEvents.map(e => ({ time: e.time, supportBroken: e.supportBroken, resistanceBroken: e.resistanceBroken })),
    opportunities: signals.map(s => {
      const lastPrice = summary.lastPrice;
      const refPrice = s.referencePrice || lastPrice;
      const distanceFromPrice = (refPrice && lastPrice) ? _round(Math.abs(refPrice - lastPrice)) : null;
      const isStale = distanceFromPrice !== null && distanceFromPrice > (lastPrice * 0.005);
      return { rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice, isStale, rationale: s.rationale };
    }),
    narrative, conformance: { hasValidData: summary.totalBars > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

function printResults(result) {
  const { summary, bars, resistanceLevels, supportLevels, recentBreaks, confluenceClusters, signals, narrative, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  SUPPORT RESISTANCE BREAKS — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n📊 BREAKS (${summary.totalBars} bars)`);
  console.log(`   Events: ${summary.breakEvents} | Recent: ${summary.recentBreaks} | Max Intensity: ${summary.maxIntensity} | Avg: ${summary.avgIntensity}`);
  console.log(`   Levels: ${summary.resistanceLevels}R / ${summary.supportLevels}S | Confluence: ${summary.confluenceClusters}`);
  if (summary.nearestResistance) console.log(`   Nearest R: ${_round(summary.nearestResistance)} | S: ${_round(summary.nearestSupport)} | Position: ${summary.positionToSR}`);
  if (resistanceLevels.length > 0) { console.log('\n📈 RESISTANCE'); resistanceLevels.forEach(r => console.log(`   ${_round(r)}`)); }
  if (supportLevels.length > 0) { console.log('\n📉 SUPPORT'); supportLevels.forEach(s => console.log(`   ${_round(s)}`)); }
  if (recentBreaks.length > 0) { console.log('\n⚡ RECENT BREAKS'); recentBreaks.slice(-3).forEach(b => console.log(`   ${new Date(b.time).toISOString().slice(11,19)} | ${_round(b.price)} | ${b.breakTypes.map(t => t.type).join(', ')}`)); }
  if (confluenceClusters.length > 0) { console.log('\n🔗 CONFLUENCE'); confluenceClusters.forEach(c => console.log(`   ${_round(c.price)} (${c.count}x)`)); }
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
      // Get last price from chart periods (indicators may not include OHLC data in their own periods)
      const chartPeriods = chart.periods || [];
      const lastChartPeriod = chartPeriods[0] || chartPeriods[chartPeriods.length - 1] || {};
      const lastPrice = lastChartPeriod?.close ?? lastChartPeriod?.c ?? null;
      const rawData = { periods: study.periods || [], ohlcv: chartPeriods, bars, lastPrice };
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
