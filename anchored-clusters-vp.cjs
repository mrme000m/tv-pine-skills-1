#!/usr/bin/env node
/**
 * Anchored Clusters Volume Profile — Standalone Runner
 * Pine ID: PUB;92974e0a3cfb481eaf058cdab9f925a3
 * Note: Graphics-only indicator — data comes from study.graphic boxes/labels/lines, not periods.
 */

const fs = require('fs');
const path = require('path');
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env') });
const tv = require('./tv-optimized.cjs');

const PINE_ID = 'PUB;92974e0a3cfb481eaf058cdab9f925a3';
const SCRIPT_NAME = 'Anchored Clusters Volume Profile';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'startTime', tvInputId: 'in_0', type: 'time', default: 1704067200000 },
  { variable: 'endTime', tvInputId: 'in_1', type: 'time', default: 1735689600000 },
  { variable: 'rangeColor', tvInputId: 'in_2', type: 'color', default: 'color.new(#607d8b, 90)' },
  { variable: 'kInput', tvInputId: 'in_3', type: 'int', default: 5 },
  { variable: 'iters', tvInputId: 'in_4', type: 'int', default: 50 },
  { variable: 'rowsInput', tvInputId: 'in_5', type: 'int', default: 20 },
  { variable: 'vpWidth', tvInputId: 'in_6', type: 'int', default: 40 },
  { variable: 'vpOffset', tvInputId: 'in_7', type: 'int', default: 10 },
  { variable: 'showDots', tvInputId: 'in_8', type: 'bool', default: true },
  { variable: 'dotSizeInput', tvInputId: 'in_9', type: 'string', default: 'size.small' }
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
Anchored Clusters Volume Profile — Standalone Runner
Usage: node anchored-clusters-vp.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --help
Inputs: startTime, endTime, rangeColor, kInput, iters, rowsInput, vpWidth, vpOffset, showDots, dotSizeInput
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

function _tfToMs(tf) {
  const t = String(tf).trim().toLowerCase();
  const m = t.match(/^(\d+)m?$/); if (m) return parseInt(m[1]) * 60 * 1000;
  const h = t.match(/^(\d+)h$/); if (h) return parseInt(h[1]) * 60 * 60 * 1000;
  if (t === '1d' || t === 'd') return 24 * 60 * 60 * 1000;
  if (t === '1w' || t === 'w') return 7 * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000; // default 15m
}

function applyInputs(indicator, inputs) {
  if (!inputs || Object.keys(inputs).length === 0) return;
  console.log(`📝 Applying input overrides...`);
  for (const [key, value] of Object.entries(inputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) { console.warn(`   ⚠️  Unknown input: ${key}`); continue; }
    try { const tvInputDef = indicator.inputs[mapping.tvInputId]; if (!tvInputDef) { console.warn(`   ⚠️  Input ${key} not in indicator`); continue; } const typed = _coerce(value, mapping.type); indicator.setOption(mapping.tvInputId, typed); console.log(`   ✅ ${key} → ${mapping.tvInputId}: ${JSON.stringify(typed)} (${tvInputDef.type})`); } catch (e) { console.warn(`   ⚠️  ${key} failed: ${e.message}`); }
  }
}

function parseGraphicOutput(rawData, timeframe) {
  const graphic = rawData?.graphic || {};
  // tv.cjs stores graphic data as objects keyed by ID, not arrays
  const boxes = Object.values(graphic.dwgBoxes || graphic.boxes || graphic.dwgboxes || {});
  const labels = Object.values(graphic.dwgLabels || graphic.labels || graphic.dwglabels || {});
  const lines = Object.values(graphic.dwgLines || graphic.lines || graphic.dwglines || {});
  const tables = Object.values(graphic.dwgTables || graphic.tables || graphic.dwgtables || {});

  // Cluster boxes represent volume distribution bars
  // Raw field names from tv.cjs: x1, x2, y1, y2, c (color), bc (borderColor)
  // y1 is the upper price bound, y2 is the lower price bound
  const clusters = boxes.map(b => ({
    top: Math.max(b.y1 || 0, b.y2 || 0),
    bottom: Math.min(b.y1 || 0, b.y2 || 0),
    left: b.x1 || b.left || b.x0,
    right: b.x2 || b.right || b.x1,
    color: b.c || b.color,
    borderColor: b.bc || b.borderColor || b.border_color,
    width: (b.x2 || b.right || b.x1) - (b.x1 || b.left || b.x0),
  })).filter(b => b.top && b.bottom).sort((a, b) => b.left - a.left);

  // Labels contain POC volumes and total cluster volumes
  // Raw field names: t (text), y (price), x, ci (color), tci (textColor)
  // Match: explicit keywords OR numeric volume strings like "16.681K", "10.1K"
  const pocLabels = labels.filter(l => l.t && (/^(poc|volume|vpo|cluster|total)/i.test(String(l.t)) || /^[\d,.]+[kmb]$/i.test(String(l.t).trim()))).map(l => ({
    text: l.t, price: l.y || l.price, x: l.x, color: l.ci || l.color,
    volume: _extractVolume(l.t), isTotal: /total/i.test(String(l.t))
  }));

  // Lines represent POC levels (dashed lines from startBarIndex to vpStartX)
  // Raw field names: y1, y2, st (style), ci (color), w (width)
  const pocLevels = lines.filter(l => l.st === 'dsh' || l.st === 'dashed' || l.st === 2 || (l.y1 && l.y2 && Math.abs(l.y1 - l.y2) < 0.001)).map(l => ({
    price: l.y1 || l.y || l.price || l.level, color: l.ci || l.color, style: l.st || l.style, width: l.w || l.width
  })).filter(Boolean);

  // Dot labels (price highlight dots)
  const dotLabels = labels.filter(l => l.t && l.t === '•').map(l => ({
    price: l.y || l.price, x: l.x, color: l.ci || l.color || l.tci || l.textcolor
  }));

  const clusterPrices = clusters.map(c => ({ high: c.top, low: c.bottom, mid: (c.top + c.bottom) / 2 }));
  const totalClusters = clusters.length;
  const avgClusterHeight = totalClusters > 0 ? clusters.reduce((s, c) => s + (c.top - c.bottom), 0) / totalClusters : 0;
  const priceRange = totalClusters > 0 ? { high: Math.max(...clusters.map(c => c.top)), low: Math.min(...clusters.map(c => c.bottom)) } : null;
  const clusterDensity = totalClusters > 0 ? totalClusters / (priceRange ? (priceRange.high - priceRange.low) : 1) : 0;

  // Volume-weighted POC
  const totalVolume = pocLabels.filter(l => !l.isTotal).reduce((s, l) => s + (l.volume || 0), 0);
  const vwPOC = totalVolume > 0 ? pocLabels.filter(l => !l.isTotal).reduce((s, l) => s + ((l.volume || 0) * (l.price || 0)), 0) / totalVolume : null;

  const latestCluster = clusters[0] || null;
  const latestPOC = pocLabels.filter(l => !l.isTotal).sort((a, b) => b.x - a.x)[0] || null;
  const latestTotal = pocLabels.filter(l => l.isTotal).sort((a, b) => b.x - a.x)[0] || null;

  const summary = { totalClusters, totalLabels: labels.length, totalLines: lines.length, totalTables: tables.length, avgClusterHeight: _round(avgClusterHeight), priceRange, clusterDensity: _round(clusterDensity, 4), totalPOCVolumes: totalVolume, volumeWeightedPOC: vwPOC ? _round(vwPOC) : null, dotCount: dotLabels.length };

  const signals = _generateSignals(latestCluster, latestPOC, priceRange, totalClusters);
  const narrative = _generateNarrative(summary, latestCluster, signals);
  const agenticScore = _computeAgenticScore(totalClusters, pocLabels.length, latestCluster);

  return { summary, clusters: clusters.slice(0, 10), pocLabels: pocLabels.slice(0, 10), pocLevels: pocLevels.slice(0, 10), dotLabels: dotLabels.slice(0, 10), latestCluster, latestPOC, latestTotal, signals, narrative, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: 0, dataSource: 'graphic' }, enhanced: { signals, narrative, agenticScore } };
}

function _extractVolume(text) {
  const match = String(text).match(/[\d,.]+[kmb]?/i);
  if (!match) return null;
  const v = parseFloat(match[0].replace(/,/g, ''));
  const multiplier = /k/i.test(match[0]) ? 1e3 : /m/i.test(match[0]) ? 1e6 : /b/i.test(match[0]) ? 1e9 : 1;
  return v * multiplier;
}

function _generateSignals(latestCluster, latestPOC, priceRange, totalClusters) {
  const generated = [];
  if (!latestCluster || !priceRange || totalClusters < 3) return generated;
  const clusterMid = (latestCluster.top + latestCluster.bottom) / 2;
  const isAtHigh = clusterMid > priceRange.high * 0.95;
  const isAtLow = clusterMid < priceRange.low * 1.05;
  const direction = isAtHigh ? 'short' : isAtLow ? 'long' : 'neutral';
  if (direction === 'neutral') return generated;
  const confluenceScore = isAtHigh || isAtLow ? 0.75 : 0.5;
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.60 ? 'HIGH' : confluenceScore >= 0.40 ? 'MED' : 'LOW';
  generated.push({ rank: 1, setupType: 'volume_cluster_extreme', direction, confluenceScore, confidence, rationale: `Cluster at ${direction === 'long' ? 'range low' : 'range high'}: ${_round(clusterMid)}. POC: ${latestPOC ? _round(latestPOC.price) : 'N/A'}.` });
  return generated;
}

function _generateNarrative(summary, latestCluster, signals) {
  const parts = [`Volume Profile: ${summary.totalClusters} clusters across ${_round(summary.priceRange?.high - summary.priceRange?.low || 0)} range.`];
  if (latestCluster) parts.push(`Latest cluster: ${_round(latestCluster.bottom)}-${_round(latestCluster.top)}.`);
  if (summary.volumeWeightedPOC) parts.push(`VW-POC: ${summary.volumeWeightedPOC}.`);
  const warnings = [];
  if (summary.totalClusters < 3) warnings.push('Few clusters — limited volume profile data.');
  if (!summary.volumeWeightedPOC) warnings.push('No POC volume data — labels may use different format.');
  const watchlist = ['Watch for price rejection at cluster extremes.', 'POC level acts as magnetic price — monitor for reversion.', 'Check kInput and rowsInput for cluster granularity.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'No cluster extremes detected.', warnings, watchlist };
}

function _computeAgenticScore(totalClusters, pocLabelCount, latestCluster) {
  let score = 0.2;
  if (totalClusters > 5) score += 0.2;
  if (pocLabelCount > 0) score += 0.15;
  if (latestCluster) score += 0.15;
  if (totalClusters > 10) score += 0.15;
  if (pocLabelCount > 3) score += 0.15;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, clusters, pocLabels, pocLevels, dotLabels, latestCluster, latestPOC, latestTotal, signals, narrative, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'anchored-clusters-vp', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: null },
    profile: { totalClusters: summary.totalClusters, priceRange: summary.priceRange, clusterDensity: summary.clusterDensity, avgClusterHeight: summary.avgClusterHeight, volumeWeightedPOC: summary.volumeWeightedPOC },
    latest: { cluster: latestCluster, poc: latestPOC, totalVolumeLabel: latestTotal },
    clusters: clusters.slice(0, 5), pocLabels: pocLabels.slice(0, 5), pocLevels: pocLevels.slice(0, 5), dotLabels: dotLabels.slice(0, 5),
    opportunities: signals.map(s => ({ rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice: null, isStale: false, rationale: s.rationale })),
    narrative, conformance: { hasValidData: summary.totalClusters > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
    // Backward compatibility fields - ensure these are present for downstream parsers
    summary,
    currentBar: latestCluster || null,
    recentBars: clusters,
    signals,
  };
}

function printResults(result) {
  const { summary, clusters, pocLabels, pocLevels, dotLabels, latestCluster, latestPOC, latestTotal, signals, narrative, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  ANCHORED CLUSTERS VOLUME PROFILE — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n📊 PROFILE (${summary.totalClusters} clusters)`);
  console.log(`   Range: ${summary.priceRange ? _round(summary.priceRange.low) + ' - ' + _round(summary.priceRange.high) : 'N/A'}`);
  console.log(`   Avg Height: ${summary.avgClusterHeight} | Density: ${summary.clusterDensity}`);
  console.log(`   VW-POC: ${summary.volumeWeightedPOC || 'N/A'} | Dots: ${summary.dotCount}`);
  if (latestCluster) console.log(`   Latest Cluster: ${_round(latestCluster.bottom)}-${_round(latestCluster.top)}`);
  if (latestPOC) console.log(`   Latest POC: ${latestPOC.text} @ ${_round(latestPOC.price)}`);
  if (latestTotal) console.log(`   Latest Total: ${latestTotal.text}`);
  if (clusters.length > 0) { console.log('\n📦 CLUSTERS (first 5)'); clusters.slice(0, 5).forEach(c => console.log(`   ${_round(c.bottom)}-${_round(c.top)}`)); }
  if (pocLevels.length > 0) { console.log('\n📐 POC LEVELS'); pocLevels.slice(0, 5).forEach(l => console.log(`   ${_round(l.price)}`)); }
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
      
      // Auto-compute startTime/endTime if not provided by user
      if (!inputs.startTime || !inputs.endTime) {
        const chartPeriods = Object.values(chart._periods || {}).sort((a, b) => a.time - b.time);
        if (chartPeriods.length > 0) {
          const firstTime = chartPeriods[0].time * 1000;
          const lastTime = chartPeriods[chartPeriods.length - 1].time * 1000;
          if (!inputs.startTime) {
            indicator.setOption('in_0', firstTime);
            console.log(`   ⏰ Auto startTime: ${new Date(firstTime).toISOString()}`);
          }
          if (!inputs.endTime) {
            indicator.setOption('in_1', lastTime);
            console.log(`   ⏰ Auto endTime: ${new Date(lastTime).toISOString()}`);
          }
        } else {
          // Fallback: estimate from bars + tf
          const tfMs = _tfToMs(tf);
          const now = Date.now();
          const estimatedStart = now - (bars * tfMs);
          if (!inputs.startTime) {
            indicator.setOption('in_0', estimatedStart);
            console.log(`   ⏰ Auto startTime (estimated): ${new Date(estimatedStart).toISOString()}`);
          }
          if (!inputs.endTime) {
            indicator.setOption('in_1', now);
            console.log(`   ⏰ Auto endTime (estimated): ${new Date(now).toISOString()}`);
          }
        }
      }
      
      try { const existing = chart.getStudies ? chart.getStudies() : []; if (existing.length > 0 && chart.removeAllStudies) { await chart.removeAllStudies(); } } catch (e) {}
      study = chart.Study(indicator);
      let updateCount = 0, resolved = false;
      const hasGraphicData = () => {
        const g = study.graphic || {};
        return Object.keys(g).length > 0 && (
          Object.keys(g.dwgBoxes ?? g.dwgboxes ?? g.boxes ?? {}).length > 0 ||
          Object.keys(g.dwgLabels ?? g.dwglabels ?? g.labels ?? {}).length > 0 ||
          Object.keys(g.dwgLines ?? g.dwglines ?? g.lines ?? {}).length > 0
        );
      };
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!resolved) {
            const periods = study.periods || [];
            if (periods.length > 0 || hasGraphicData()) { resolved = true; resolve(); }
            else reject(new Error('Timeout — no graphic data received. The indicator default time range (startTime/endTime) may not overlap with current chart data. Try: --input startTime=' + (Date.now() - 30*24*60*60*1000) + ' --input endTime=' + Date.now()));
          }
        }, 60000);
        study.onError((err) => { clearTimeout(timer); if (!resolved) { resolved = true; reject(err); } });
        study.onUpdate(() => {
          updateCount++;
          if (!resolved && (updateCount >= 2 || hasGraphicData())) {
            resolved = true; clearTimeout(timer); resolve();
          }
        });
      });
      const graphic = study.graphic || {};
      const parsed = parseGraphicOutput({ graphic, bars }, tf);
      parsed.meta.durationMs = Date.now() - startTime;
      try { study.remove(); } catch {}
      try { chart.delete(); } catch {}
      try { client.end(); } catch {}
      return parsed;
    } catch (err) {
      if (/maximum number of studies/i.test(err.message)) {
        throw new Error(`${err.message} — indicator requires a higher TradingView subscription tier.`);
      }
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
