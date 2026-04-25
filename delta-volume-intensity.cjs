#!/usr/bin/env node
/**
 * Delta Volume Intensity — Standalone Runner
 * Pine ID: PUB;bdd3bc54cf9f4dc6b42e6b2879b4eed2
 * Fields: support, resistance, atr, roc, trend, backgroundTrend, uptrendAlert, downtrendAlert, sidewaysAlert
 * Trend states: UPTREND, DOWNTREND, SIDEWAYS
 */

const fs = require('fs');
const path = require('path');
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env'), quiet: true });
const tv = require('./tv-optimized.cjs');

const PINE_ID = 'PUB;bdd3bc54cf9f4dc6b42e6b2879b4eed2';
const SCRIPT_NAME = 'Delta Volume Intensity';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'length_volatility', tvInputId: 'in_0', type: 'int', default: 14 },
  { variable: 'length_momentum', tvInputId: 'in_1', type: 'int', default: 14 },
  { variable: 'lookback_sr', tvInputId: 'in_2', type: 'int', default: 7 }
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
Delta Volume Intensity — Standalone Runner
Usage: node delta-volume-intensity.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --help
Inputs: length_volatility, length_momentum, lookback_sr
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

function _resolveTrend(code) {
  const n = typeof code === 'number' ? code : parseInt(code, 10);
  if (isNaN(n)) return 'sideways';
  if (n === 0) return 'uptrend';
  if (n === 1) return 'downtrend';
  return 'sideways';
}

function _resolveBackground(code) {
  const n = typeof code === 'number' ? code : parseInt(code, 10);
  if (isNaN(n)) return 'unknown';
  if (n === 0) return 'bull';
  if (n === 1) return 'bear';
  return 'neutral';
}

function parseOutput(rawData, timeframe) {
  const periods = rawData?.periods || [];
  const ohlcv = rawData?.ohlcv || [];
  
  // Create a map from timestamp to OHLCV data
  const ohlcvMap = new Map();
  for (const o of ohlcv) {
    const time = o.time ?? o.Time ?? o.timestamp ?? o.Timestamp;
    if (time != null) {
      ohlcvMap.set(String(time), o);
    }
  }
  
  const bars = [];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const timeValue = p.time ?? p.Time ?? p.timestamp ?? p.Timestamp;
    const timeStr = String(timeValue);
    const o = ohlcvMap.get(timeStr) || {};
    
    // Extract OHLCV - try multiple possible field names
    const open = p.open ?? p.Open ?? o.open ?? o.Open ?? null;
    const high = p.high ?? p.High ?? o.high ?? o.High ?? null;
    const low = p.low ?? p.Low ?? o.low ?? o.Low ?? null;
    const close = p.close ?? p.Close ?? o.close ?? o.Close ?? null;
    
    const entry = {
      time: timeValue, barIndex: p.index,
      support: p.support ?? p.Support ?? null,
      resistance: p.resistance ?? p.Resistance ?? null,
      atr: p.atr ?? p.ATR ?? p.VolatilityATR ?? p.volatilityATR ?? null,
      roc: p.roc ?? p.RoC ?? p.ROC ?? p.MomentumROC ?? p.momentumROC ?? null,
      trend: p.trend ?? p.Trend ?? p['Background Trend'] ?? p.BackgroundColor ?? p.backgroundColor ?? null,
      backgroundTrend: p.backgroundTrend ?? p.BackgroundTrend ?? p['Background Trend'] ?? p.BackgroundColor ?? p.backgroundColor ?? null,
      uptrendAlert: p.uptrendAlert ?? p.UptrendAlert ?? p['Uptrend Alert'] ?? null,
      downtrendAlert: p.downtrendAlert ?? p.DowntrendAlert ?? p['Downtrend Alert'] ?? null,
      sidewaysAlert: p.sidewaysAlert ?? p.SidewaysAlert ?? p['Sideways Alert'] ?? null,
      open,
      high,
      low,
      close,
    };
    bars.push(entry);
  }

  // Trend state analysis
  const lastBars = bars.slice(-20);
  const resolvedTrends = lastBars.map(b => _resolveTrend(b.trend));
  const resolvedBg = lastBars.map(b => _resolveBackground(b.backgroundTrend));
  const uptrendBars = resolvedTrends.filter(t => t === 'uptrend').length;
  const downtrendBars = resolvedTrends.filter(t => t === 'downtrend').length;
  const sidewaysBars = resolvedTrends.filter(t => t === 'sideways').length;
  const trendConsensus = uptrendBars > downtrendBars * 1.5 ? 'UPTREND' : downtrendBars > uptrendBars * 1.5 ? 'DOWNTREND' : 'SIDEWAYS';

  const bgTrends = resolvedBg.filter(Boolean);
  const bgConsensus = bgTrends.length > 0 ? _mode(bgTrends) : 'unknown';

  // S/R breaks
  const srBreaks = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1], curr = bars[i];
    if (prev.resistance && curr.high > prev.resistance) srBreaks.push({ time: curr.time, type: 'RESISTANCE_BREAK', price: curr.high, level: prev.resistance });
    if (prev.support && curr.low < prev.support) srBreaks.push({ time: curr.time, type: 'SUPPORT_BREAK', price: curr.low, level: prev.support });
  }
  const recentBreaks = srBreaks.slice(-5);

  // Volatility regime
  const atrs = bars.map(b => b.atr).filter(Boolean);
  const avgATR = atrs.length > 0 ? atrs.reduce((a, b) => a + b, 0) / atrs.length : 0;
  const latestATR = atrs[atrs.length - 1] || 0;
  const volatilityRegime = latestATR > avgATR * 1.3 ? 'EXPANDING' : latestATR < avgATR * 0.7 ? 'CONTRACTING' : 'NORMAL';

  // Momentum ROC
  const rocs = bars.map(b => b.roc).filter(v => v !== null && v !== undefined);
  const latestROC = rocs[rocs.length - 1] || 0;
  const momentum = latestROC > 0.5 ? 'STRONG_BULL' : latestROC > 0 ? 'BULL' : latestROC < -0.5 ? 'STRONG_BEAR' : latestROC < 0 ? 'BEAR' : 'NEUTRAL';

  // Alert triggers
  const alerts = bars.filter(b => b.uptrendAlert || b.downtrendAlert || b.sidewaysAlert).slice(-5);

  const lastPrice = bars.length > 0 ? (bars[bars.length - 1].close ?? bars[bars.length - 1].open) : null;
  
  const summary = { 
    totalBars: bars.length, uptrendBars, downtrendBars, sidewaysBars, 
    trendConsensus, bgConsensus, srBreaks: srBreaks.length, recentBreaks: recentBreaks.length, 
    avgATR: _round(avgATR), latestATR: _round(latestATR), volatilityRegime, 
    latestROC: _round(latestROC), momentum, alerts: alerts.length,
    lastPrice
  };

  const signals = _generateSignals(trendConsensus, momentum, volatilityRegime, recentBreaks, latestATR, avgATR);
  const narrative = _generateNarrative(summary, signals);
  const agenticScore = _computeAgenticScore(bars.length, srBreaks.length, alerts.length);

  return { summary, bars: bars.slice(-20), recentBreaks, alerts, signals, narrative, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: periods.length, dataSource: 'periods' }, enhanced: { signals, narrative, agenticScore } };
}

function _mode(arr) {
  const counts = {};
  arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

function _generateSignals(trendConsensus, momentum, volatilityRegime, recentBreaks, latestATR, avgATR) {
  const generated = [];
  const direction = trendConsensus === 'UPTREND' ? 'long' : trendConsensus === 'DOWNTREND' ? 'short' : 'neutral';
  if (direction === 'neutral' || volatilityRegime === 'EXPANDING') return generated;

  const lastBreak = recentBreaks[recentBreaks.length - 1];
  const confluenceScore = _round((trendConsensus === 'UPTREND' && momentum.startsWith('BULL')) || (trendConsensus === 'DOWNTREND' && momentum.startsWith('BEAR')) ? 0.75 : 0.55, 2);
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.60 ? 'HIGH' : confluenceScore >= 0.40 ? 'MED' : 'LOW';

  generated.push({ rank: 1, setupType: 'trend_momentum_sr', direction, confluenceScore, confidence, rationale: `${direction.toUpperCase()} trend confirmed. Momentum: ${momentum}. Volatility: ${volatilityRegime}. ${lastBreak ? `Last break: ${lastBreak.type} at ${_round(lastBreak.price)}.` : ''}` });

  return generated;
}

function _generateNarrative(summary, signals) {
  const parts = [`Trend: ${summary.trendConsensus} (${summary.uptrendBars} up, ${summary.downtrendBars} down, ${summary.sidewaysBars} sideways bars).`];
  parts.push(`Volatility: ${summary.volatilityRegime} (ATR: ${summary.latestATR}, avg: ${summary.avgATR}). Momentum: ${summary.momentum}.`);
  if (summary.srBreaks > 0) parts.push(`${summary.srBreaks} S/R breaks detected (${summary.recentBreaks} recent).`);
  const warnings = [];
  if (summary.volatilityRegime === 'EXPANDING') warnings.push('Expanding volatility — wait for consolidation before entry.');
  if (summary.momentum === 'NEUTRAL' && summary.trendConsensus !== 'SIDEWAYS') warnings.push('Momentum neutral despite trend bias — weak conviction.');
  if (summary.alerts === 0) warnings.push('No alerts triggered — indicator may be in neutral zone.');
  const watchlist = ['S/R break with trend alignment is highest-probability setup.', 'Contracting volatility + ROC divergence = potential expansion.', 'Background trend should align with primary trend for confluence.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'Wait for trend + momentum alignment.', warnings, watchlist };
}

function _computeAgenticScore(totalBars, srBreaks, alerts) {
  let score = 0.2;
  if (totalBars > 0) score += 0.2;
  if (srBreaks > 0) score += 0.15;
  if (alerts > 0) score += 0.15;
  if (srBreaks > 2) score += 0.15;
  if (alerts > 2) score += 0.15;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, bars, recentBreaks, alerts, signals, narrative, meta } = result;
  const now = new Date().toISOString();

  return {
    status: 'ok',
    exitCode: EXIT_CODES.SUCCESS,
    timestamp: now,
    execution: {
      durationMs: meta.durationMs,
      attempts: 1,
    },
    agentContext: {
      workflow: 'trend-following-sr-break',
      modelVersion: 'agent-ready-v2',
      symbol: args?.symbol || meta.symbol || 'unknown',
      timeframe: meta.timeframe || '15m',
    },
    market: {
      lastPrice: summary.lastPrice,
      bias: summary.trendConsensus,
      dominantFlow: summary.momentum,
      regime: summary.volatilityRegime,
    },
    structure: {
      trend: {
        consensus: summary.trendConsensus,
        uptrendBars: summary.uptrendBars,
        downtrendBars: summary.downtrendBars,
        sidewaysBars: summary.sidewaysBars,
        backgroundConsensus: summary.bgConsensus,
      },
      volatility: {
        regime: summary.volatilityRegime,
        latestATR: summary.latestATR,
        avgATR: summary.avgATR,
      },
      momentum: {
        latestROC: summary.latestROC,
        state: summary.momentum,
      },
      srBreaks: {
        total: summary.srBreaks,
        recent: summary.recentBreaks,
        lastBreaks: recentBreaks.map(b => ({
          time: b.time,
          type: b.type,
          price: b.price,
          level: b.level,
        })),
      },
    },
    signals: signals.map(s => ({
      rank: s.rank,
      setupType: s.setupType,
      direction: s.direction,
      confidence: s.confidence,
      confluenceScore: s.confluenceScore,
      rationale: s.rationale,
    })),
    narrative: {
      marketStructure: narrative.marketStructure,
      primaryOpportunity: narrative.primaryOpportunity,
      warnings: narrative.warnings,
      watchlist: narrative.watchlist,
    },
    validation: {
      checks: [
        { name: 'valid_bars', passed: summary.totalBars > 0, message: `Total bars: ${summary.totalBars}` },
        { name: 'valid_trend', passed: summary.trendConsensus !== 'SIDEWAYS', message: `Trend: ${summary.trendConsensus}` },
        { name: 'valid_momentum', passed: summary.momentum !== 'NEUTRAL', message: `Momentum: ${summary.momentum}` },
        { name: 'sr_breaks', passed: summary.srBreaks > 0, message: `S/R breaks: ${summary.srBreaks}` },
      ],
    },
    conformance: {
      hasValidStructure: summary.totalBars > 0,
      hasDirectionalImpulse: summary.momentum !== 'NEUTRAL',
      agenticScore: result.enhanced?.agenticScore || 0.5,
    },
    schemaVersion: 'agent-ready-v2.0.0',
    // Backward compatibility fields
    summary,
    currentBar: bars.length > 0 ? bars[bars.length - 1] : null,
    recentBars: bars,
    signals,
  };
}

function printResults(result) {
  const { summary, bars, recentBreaks, alerts, signals, narrative, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  DELTA VOLUME INTENSITY — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n📊 TREND (${summary.totalBars} bars)`);
  console.log(`   Consensus: ${summary.trendConsensus} | BG: ${summary.bgConsensus}`);
  console.log(`   Up: ${summary.uptrendBars} | Down: ${summary.downtrendBars} | Sideways: ${summary.sidewaysBars}`);
  console.log(`\n📈 VOLATILITY | Regime: ${summary.volatilityRegime} | ATR: ${summary.latestATR} (avg: ${summary.avgATR})`);
  console.log(`   Momentum: ${summary.momentum} | ROC: ${summary.latestROC}`);
  console.log(`\n📐 S/R BREAKS | Total: ${summary.srBreaks} | Recent: ${summary.recentBreaks}`);
  if (recentBreaks.length > 0) { recentBreaks.forEach(b => console.log(`   ${b.type} at ${_round(b.price)} (level: ${_round(b.level)})`)); }
  if (alerts.length > 0) { console.log('\n🔔 ALERTS'); alerts.forEach(a => console.log(`   ${new Date(a.time).toISOString().slice(11,19)} | Up: ${a.uptrendAlert} | Down: ${a.downtrendAlert}`)); }
  if (bars.length > 0) { console.log('\n📊 LAST BARS'); bars.slice(-3).forEach(b => console.log(`   ${new Date(b.time).toISOString().slice(11,19)} | S: ${_round(b.support)} R: ${_round(b.resistance)} ATR: ${_round(b.atr)} Trend: ${b.trend}`)); }
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
