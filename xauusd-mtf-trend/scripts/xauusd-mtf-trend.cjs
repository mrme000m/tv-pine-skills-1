#!/usr/bin/env node
/**
 * XAUUSD MTF Trend Dashboard — Standalone Runner
 * Pine ID: PUB;d1ad30c0261f49f297357f8aa2a7854a
 * Note: Graphics-only indicator — data comes from study.graphic, not periods.
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

const PINE_ID = 'PUB;d1ad30c0261f49f297357f8aa2a7854a';
const SCRIPT_NAME = 'XAUUSD MTF Trend Dashboard';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

const INPUT_MAP = [
  { variable: 'show_M15', tvInputId: 'in_0', type: 'bool', default: true },
  { variable: 'show_M30', tvInputId: 'in_1', type: 'bool', default: true },
  { variable: 'show_H1', tvInputId: 'in_2', type: 'bool', default: true },
  { variable: 'show_H4', tvInputId: 'in_3', type: 'bool', default: true },
  { variable: 'show_D1', tvInputId: 'in_4', type: 'bool', default: true },
  { variable: 'fastLength', tvInputId: 'in_5', type: 'int', default: 10 },
  { variable: 'slowLength', tvInputId: 'in_6', type: 'int', default: 20 },
  { variable: 'rsiLength', tvInputId: 'in_7', type: 'int', default: 14 },
  { variable: 'rsiOverbought', tvInputId: 'in_8', type: 'float', default: 70 },
  { variable: 'rsiOversold', tvInputId: 'in_9', type: 'float', default: 30 },
  { variable: 'macdFastLength', tvInputId: 'in_10', type: 'int', default: 12 },
  { variable: 'macdSlowLength', tvInputId: 'in_11', type: 'int', default: 26 },
  { variable: 'macdSignalLength', tvInputId: 'in_12', type: 'int', default: 9 },
  { variable: 'bbLength', tvInputId: 'in_13', type: 'int', default: 20 },
  { variable: 'bbMultiplier', tvInputId: 'in_14', type: 'float', default: 2 },
  { variable: 'dmiLength', tvInputId: 'in_15', type: 'int', default: 14 },
  { variable: 'dmiSmoothing', tvInputId: 'in_16', type: 'int', default: 14 },
  { variable: 'sarStartValue', tvInputId: 'in_17', type: 'float', default: 0.02 },
  { variable: 'sarIncrement', tvInputId: 'in_18', type: 'float', default: 0.02 },
  { variable: 'sarMaxValue', tvInputId: 'in_19', type: 'float', default: 0.2 }
];

function parseArgs(argv) {
  const args = { _symbol: argv[0]?.toUpperCase() || null, symbol: 'XAUUSD', tf: '15m', bars: 500, json: false, out: null, agent: false, verbose: false, dryRun: false, inputs: {} };
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
XAUUSD MTF Trend Dashboard — Standalone Runner
Usage: node xauusd-mtf-trend.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --help
Inputs: show_M15, show_M30, show_H1, show_H4, show_D1, fastLength, slowLength, rsiLength, rsiOverbought, rsiOversold, macdFastLength, macdSlowLength, macdSignalLength, bbLength, bbMultiplier, dmiLength, dmiSmoothing, sarStartValue, sarIncrement, sarMaxValue
        macdFastLength, macdSlowLength, macdSignalLength, bbLength, bbMultiplier, dmiLength, dmiSmoothing,
        sarStartValue, sarIncrement, sarMaxValue
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

function parseGraphicOutput(rawData, timeframe) {
  const graphic = rawData?.graphic || {};
  const tables = graphic.dwgTables || graphic.tables || graphic.dwgtables || {};
  const cells = graphic.dwgTableCells || graphic.tableCells || graphic.dwgtablecells || {};
  const labels = graphic.dwgLabels || graphic.labels || graphic.dwglabels || [];
  const lines = graphic.dwgLines || graphic.lines || graphic.dwglines || [];
  const boxes = graphic.dwgBoxes || graphic.boxes || graphic.dwgboxes || [];

  // Find the trend table (top_right position)
  const tableId = Object.keys(tables).find(id => tables[id]?.pos === 'top_right');
  const mtfData = [];
  if (tableId) {
    const tableCells = Object.values(cells).filter(c => String(c?.tid) === String(tableId));
    // The table has columns: Timeframe | Trend | Strength
    // Row 0 is header, rows 1+ are data
    const grid = {};
    tableCells.forEach(c => {
      if (c.row !== undefined && c.col !== undefined) {
        if (!grid[c.row]) grid[c.row] = {};
        grid[c.row][c.col] = c.t ?? '';
      }
    });
    Object.entries(grid).forEach(([row, cols]) => {
      if (row === '0') return; // skip header
      const tf = cols[0];
      const trend = cols[1];
      const strength = cols[2];
      if (tf && trend) {
        const strengthNum = parseInt(strength) || 0;
        const trendLower = String(trend).toLowerCase();
        mtfData.push({ text: `${tf}: ${trend}`, timeframe: tf, trend: trendLower, strength: strengthNum, isBullish: trendLower.includes('uptrend'), isBearish: trendLower.includes('downtrend'), isNeutral: trendLower.includes('neutral') });
      }
    });
  }

  // Also try parsing from labels if table didn't work
  if (mtfData.length === 0) {
    labels.filter(l => l.t && /(M15|M30|H1|H4|D1|uptrend|downtrend|neutral)/i.test(l.t)).forEach(l => {
      const text = String(l.t).trim();
      const tfMatch = text.match(/(M15|M30|H1|H4|D1)/i);
      const trendMatch = text.match(/(strong uptrend|weak uptrend|strong downtrend|weak downtrend|neutral)/i);
      if (tfMatch) {
        mtfData.push({ text, timeframe: tfMatch[1], trend: trendMatch ? trendMatch[1].toLowerCase() : 'unknown', strength: null });
      }
    });
  }

  // Trend labels for annotations
  const trendLabels = labels.filter(l => l.t && /(bull|bear|buy|sell|up|down)/i.test(l.t)).map(l => ({
    text: l.t, x: l.x, y: l.y, color: l.ci,
    trend: /bull|buy|up/i.test(l.t) ? 'bullish' : /bear|sell|down/i.test(l.t) ? 'bearish' : 'neutral'
  }));

  // Extract horizontal lines as S/R levels
  const levels = lines.filter(l => l.type === 'hline' || (l.y1 && l.y2 && Math.abs(l.y1 - l.y2) < 0.001)).map(l => ({
    price: l.y1 || l.price || l.level, color: l.ci, style: l.st, width: l.w
  })).filter(Boolean);

  // Summarize trends by timeframe
  const trendCounts = {};
  for (const item of mtfData) {
    if (item.trend) {
      const category = item.isBullish ? 'bullish' : item.isBearish ? 'bearish' : 'neutral';
      trendCounts[category] = (trendCounts[category] || 0) + 1;
    }
  }

  const bullishCount = trendCounts.bullish || 0;
  const bearishCount = trendCounts.bearish || 0;
  const neutralCount = trendCounts.neutral || 0;

  // Calculate weighted strength
  const totalStrength = mtfData.reduce((s, d) => s + Math.abs(d.strength || 0), 0);
  const avgStrength = mtfData.length > 0 ? totalStrength / mtfData.length : 0;
  const netStrength = mtfData.reduce((s, d) => s + (d.isBullish ? (d.strength || 0) : d.isBearish ? -(d.strength || 0) : 0), 0);

  const overallBias = bullishCount > bearishCount * 1.5 ? 'STRONGLY_BULLISH' : bearishCount > bullishCount * 1.5 ? 'STRONGLY_BEARISH' : bullishCount > bearishCount ? 'BULLISH' : bearishCount > bullishCount ? 'BEARISH' : 'NEUTRAL';

  const summary = { totalTables: Object.keys(tables).length, totalLabels: labels.length, totalLines: lines.length, totalBoxes: boxes.length, mtfEntries: mtfData.length, trendCounts, bullishCount, bearishCount, neutralCount, overallBias, avgStrength: _round(avgStrength, 2), netStrength };

  const signals = _generateSignals(overallBias, bullishCount, bearishCount, netStrength);
  const narrative = _generateNarrative(overallBias, summary, signals);
  const agenticScore = _computeAgenticScore(overallBias, mtfData.length, netStrength);

  return { summary, mtfData, trendLabels, levels, signals, narrative, meta: { pineId: PINE_ID, scriptName: SCRIPT_NAME, timeframe, periodCount: 0, dataSource: 'graphic' }, enhanced: { signals, narrative, agenticScore } };
}

function _generateSignals(overallBias, bullishCount, bearishCount, netStrength) {
  const generated = [];
  const direction = overallBias.startsWith('BULL') ? 'long' : overallBias.startsWith('BEAR') ? 'short' : 'neutral';
  if (direction === 'neutral') return generated;
  const confluenceScore = _round(overallBias.startsWith('STRONGLY') ? 0.85 : 0.65, 2);
  const confidence = confluenceScore >= 0.80 ? 'STRONG' : confluenceScore >= 0.60 ? 'HIGH' : confluenceScore >= 0.40 ? 'MED' : 'LOW';
  generated.push({ rank: 1, setupType: 'mtf_trend_alignment', direction, confluenceScore, confidence, rationale: `MTF trend alignment: ${overallBias}. Bullish TF: ${bullishCount}, Bearish TF: ${bearishCount}, Net strength: ${netStrength}.` });
  return generated;
}

function _generateNarrative(overallBias, summary, signals) {
  const parts = [`MTF Dashboard: ${summary.mtfEntries} entries across timeframes.`];
  parts.push(`Bias: ${overallBias}. Bull: ${summary.bullishCount}, Bear: ${summary.bearishCount}, Neutral: ${summary.neutralCount}.`);
  parts.push(`Avg strength: ${summary.avgStrength}, Net strength: ${summary.netStrength}.`);
  const warnings = [];
  if (overallBias === 'NEUTRAL') warnings.push('No clear MTF bias — conflicting signals across timeframes.');
  if (summary.mtfEntries === 0) warnings.push('No MTF data parsed from graphics — indicator may have different format.');
  const watchlist = ['Confirm MTF alignment before entry.', 'Check highest timeframe bias for macro direction.', 'Watch for strength > 4 as strong consensus.'];
  return { marketStructure: parts.join(' '), primaryOpportunity: signals[0]?.rationale || 'Wait for MTF alignment.', warnings, watchlist };
}

function _computeAgenticScore(overallBias, mtfEntries, netStrength) {
  let score = 0.2;
  if (overallBias.startsWith('STRONGLY')) score += 0.3;
  else if (overallBias !== 'NEUTRAL') score += 0.15;
  if (mtfEntries > 3) score += 0.15;
  if (Math.abs(netStrength) >= 4) score += 0.2;
  if (mtfEntries > 0) score += 0.1;
  return _round(Math.min(score, 0.99), 2);
}

function transformForAgentMode(result, args) {
  const { summary, mtfData, trendLabels, levels, signals, narrative, meta, enhanced } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta.durationMs, attempts: 1 },
    agentContext: { workflow: 'xauusd-mtf-trend', modelVersion: 'agent-ready-v2', symbol: args?.symbol || 'unknown', timeframe: meta.timeframe, htfTimeframe: 'M15,M30,H1,H4,D1' },
    mtf: { overallBias: summary.overallBias, entries: mtfData.slice(0, 10), trendLabels: trendLabels.slice(0, 5), levels: levels.slice(0, 5), avgStrength: summary.avgStrength, netStrength: summary.netStrength },
    counts: { bullish: summary.bullishCount, bearish: summary.bearishCount, neutral: summary.neutralCount },
    opportunities: signals.map(s => ({ rank: s.rank, setup: s.setupType, direction: s.direction, confidence: s.confidence, confluenceScore: s.confluenceScore, distanceFromPrice: null, isStale: false, rationale: s.rationale })),
    narrative, conformance: { hasValidData: summary.mtfEntries > 0, agenticScore: enhanced.agenticScore },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

function printResults(result) {
  const { summary, mtfData, trendLabels, levels, signals, narrative, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  XAUUSD MTF TREND DASHBOARD — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n📊 MTF DATA (${summary.mtfEntries} entries)`);
  console.log(`   Overall Bias: ${summary.overallBias}`);
  console.log(`   Bull: ${summary.bullishCount} | Bear: ${summary.bearishCount} | Neutral: ${summary.neutralCount}`);
  console.log(`   Avg Strength: ${summary.avgStrength} | Net Strength: ${summary.netStrength}`);
  if (mtfData.length > 0) { console.log('\n📈 MTF ENTRIES'); mtfData.forEach(e => console.log(`   ${e.timeframe}: ${e.trend} (strength=${e.strength})`)); }
  if (trendLabels.length > 0) { console.log('\n🏷️ TREND LABELS'); trendLabels.slice(0, 5).forEach(l => console.log(`   ${l.trend}: ${l.text}`)); }
  if (levels.length > 0) { console.log('\n📐 LEVELS'); levels.slice(0, 5).forEach(l => console.log(`   ${_round(l.price)}`)); }
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
      const hasGraphicData = () => {
        const g = study.graphic || {};
        return Object.keys(g).length > 0 && (
          Object.keys(g.dwgLabels ?? g.dwglabels ?? g.labels ?? {}).length > 0 ||
          Object.keys(g.dwgTables ?? g.dwgtables ?? g.tables ?? {}).length > 0
        );
      };
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { if (!resolved) { if (hasGraphicData()) { resolved = true; resolve(); } else { const periods = study.periods || []; if (periods.length > 0) { resolved = true; resolve(); } else reject(new Error('Timeout')); } } }, 45000);
        study.onError((err) => { clearTimeout(timer); if (!resolved) { resolved = true; reject(err); } });
        study.onUpdate(() => { updateCount++; if (updateCount >= 2 && !resolved) { resolved = true; clearTimeout(timer); resolve(); } });
      });
      const graphic = study.graphic || {};
      const parsed = parseGraphicOutput({ graphic, bars }, tf);
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
