#!/usr/bin/env node
/**
 * SwingArm ATR Trend Indicator — Standalone Runner
 * Pine ID: PUB;GdkmXaTINI8knwuCrctQD1pB5dFaRnyr
 * ATR-based trend indicator with background colors (green/red)
 */

const fs = require('fs');
const path = require('path');

// Project Root Resolution
function findProjectRoot() {
  let dir = path.resolve(__dirname);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'tv-optimized.cjs'))) return dir;
    dir = path.dirname(dir);
  }
  return __dirname;
}
const PROJECT_ROOT = findProjectRoot();
const SCRIPT_DIR = path.dirname(__filename);
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });
const tv = require(path.join(PROJECT_ROOT, 'tv-optimized.cjs'));

const PINE_ID = 'PUB;GdkmXaTINI8knwuCrctQD1pB5dFaRnyr';
const SCRIPT_NAME = 'SwingArm ATR Trend Indicator';
const EXIT_CODES = { SUCCESS: 0, CRITICAL: 1, NO_DATA: 2, TIMEOUT: 3, VALIDATION: 4 };

// Inputs from /tmp/indicator-inputs.json
const INPUT_MAP = [
  { variable: 'indicatorTimeframe', tvInputId: 'in_4', type: 'resolution', default: '' },
  { variable: 'trailType', tvInputId: 'in_0', type: 'text', default: 'modified', options: ['modified', 'unmodified'] },
  { variable: 'atrPeriod', tvInputId: 'in_1', type: 'integer', default: 28, min: 1, max: 100 },
  { variable: 'atrFactor', tvInputId: 'in_2', type: 'integer', default: 5 },
  { variable: 'plotBackground', tvInputId: 'in_5', type: 'bool', default: true }
];

function parseArgs(argv) {
  const args = { 
    _symbol: argv[0]?.toUpperCase() || null, symbol: 'BTCUSDT', tf: '15m', bars: 500,
    json: false, out: null, agent: false, verbose: false, dryRun: false, silent: false, inputs: {} 
  };
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
SwingArm ATR Trend Indicator — Standalone Runner
Usage: node swingarm-atr-trend-indicator.cjs <SYMBOL> [options]
Options: --tf, --bars, --input key=value, --json, --agent, --out, --verbose, --dry-run, --silent, --help
Inputs: indicatorTimeframe, trailType, atrPeriod, atrFactor, plotBackground
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

function applyInputs(indicator, inputs) {
  const userInputs = inputs || {};
  if (Object.keys(userInputs).length === 0) return;
  console.log('📝 Applying input configuration...');
  for (const [key, value] of Object.entries(userInputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) { console.warn(`   ⚠️  Unknown input: ${key}`); continue; }
    try {
      const tvInputDef = indicator.inputs[mapping.tvInputId];
      if (!tvInputDef) { console.warn(`   ⚠️  Input ${key} not in indicator`); continue; }
      let typed = value;
      if (mapping.type === 'bool') typed = value === 'true' || value === '1';
      else if (mapping.type === 'int' || mapping.type === 'integer') typed = parseInt(value, 10);
      indicator.setOption(mapping.tvInputId, typed);
      console.log(`   ✅ ${key} → ${mapping.tvInputId}: ${JSON.stringify(typed)} (${tvInputDef.type})`);
    } catch (e) { console.warn(`   ⚠️  ${key} failed: ${e.message}`); }
  }
}

function parseGraphicOutput(rawData, timeframe, chartPeriods) {
  const graphic = rawData?.graphic || {};
  const boxes = Object.values(graphic.dwgBoxes ?? graphic.boxes ?? graphic.dwgboxes ?? {});
  const labels = Object.values(graphic.dwgLabels ?? graphic.labels ?? graphic.dwglabels ?? {});
  const lines = Object.values(graphic.dwgLines ?? graphic.lines ?? graphic.dwglines ?? {});

  // Parse background fills (green = bullish, red = bearish)
  const bgFills = boxes.filter(b => {
    if (!b) return false;
    const hasBackground = b.t === '' || b.t === undefined || /green|red/i.test(b.c || '');
    return hasBackground;
  }).map(b => ({
    left: b.x1, right: b.x2,
    top: Math.max(b.y1||0, b.y2||0), bottom: Math.min(b.y1||0, b.y2||0),
    color: b.c, isBackground: true
  }));

  // Parse trend lines
  const trendLines = lines.filter(l => {
    if (!l) return false;
    return l.st !== 'dashed' && l.st !== 'dotted';
  }).map(l => ({
    x1: l.x1, x2: l.x2, y1: l.y1, y2: l.y2, color: l.c, style: l.st
  }));

  // Parse trailing stop lines (dashed)
  const trailingLines = lines.filter(l => {
    if (!l) return false;
    return /trail|stop/i.test(l.t || '') || l.st === 'dashed';
  }).map(l => ({
    price: (l.y1 || l.y2), color: l.c, style: l.st
  }));

  // Parse labels
  const labelObjects = labels.filter(l => l).map(l => ({
    text: l.t, x: l.x, y: l.y, color: l.ci
  }));

  // Extract plot values from periods (plot_* keys OR actual plot names)
  const periods = rawData?.periods || [];
  const plotValues = [];
  const plotMap = {};  // Map plot names to values
  
  if (periods.length > 0) {
    const lastPeriod = periods[periods.length - 1];
    if (lastPeriod && typeof lastPeriod === 'object') {
      Object.keys(lastPeriod).forEach(k => {
        if (k.startsWith('plot_')) {
          plotValues.push({ key: k, value: lastPeriod[k] });
        }
        // Also capture actual plot names (e.g., 'Trailingstop', 'Trailingstop_colorer')
        if (k !== '$time' && typeof lastPeriod[k] === 'number') {
          plotMap[k] = lastPeriod[k];
        }
      });
    }
  }

  // Latest price
  let latestClose = null;
  const allPeriods = chartPeriods || periods;
  if (Array.isArray(allPeriods) && allPeriods.length > 0) {
    const last = allPeriods[allPeriods.length - 1];
    latestClose = last?.close ?? last?.[4] ?? null;
  }

  // Current trend from plot values (PRIMARY for ATR Trend Indicator)
  let currentTrend = 'unknown', trendConfidence = 0;
  let trailingStop = null, extremum = null, fibs = {}, trailingStopColorer = null;
  
  // Extract ATR Trend Indicator specific plot values
  if (plotValues.length > 0 || Object.keys(plotMap).length > 0) {
    // ATR Trend Indicator plot mapping:
    // Trailingstop = trailing stop value, Trailingstop_colorer = color (trend)
    // Extremum = extreme value, Extremum_colorer = color
    // Fib1, Fib2, Fib3 = Fibonacci levels
    trailingStop = plotMap['Trailingstop'] !== undefined ? plotMap['Trailingstop'] : plotMap['plot_0'];
    trailingStopColorer = plotMap['Trailingstop_colorer'] !== undefined ? plotMap['Trailingstop_colorer'] : plotMap['plot_1'];
    extremum = plotMap['Extremum'] !== undefined ? plotMap['Extremum'] : plotMap['plot_2'];
    fibs = { 
      fib1: plotMap['Fib1'] !== undefined ? plotMap['Fib1'] : plotMap['plot_4'], 
      fib2: plotMap['Fib2'] !== undefined ? plotMap['Fib2'] : plotMap['plot_5'], 
      fib3: plotMap['Fib3'] !== undefined ? plotMap['Fib3'] : plotMap['plot_6'] 
    };
    
    // Determine trend from Trailingstop_colorer (color value)
    if (trailingStopColorer !== undefined) {
      if (typeof trailingStopColorer === 'number') {
        // Numeric color code: positive = uptrend (green), negative = downtrend (red)
        if (trailingStopColorer > 0) {
          currentTrend = 'bullish';
          trendConfidence = 90;
        } else if (trailingStopColorer < 0) {
          currentTrend = 'bearish';
          trendConfidence = 90;
        } else {
          currentTrend = 'neutral';
          trendConfidence = 50;
        }
      } else {
        // String color: check for green/red keywords or color codes
        const colorStr = String(trailingStopColorer).toLowerCase();
        if (colorStr.includes('green') || colorStr.includes('#26a69a') || colorStr === '1') {
          currentTrend = 'bullish';
          trendConfidence = 90;
        } else if (colorStr.includes('red') || colorStr.includes('#ef5350') || colorStr === '-1') {
          currentTrend = 'bearish';
          trendConfidence = 90;
        }
      }
    }
    
    // Fallback: determine trend by comparing trailing stop values across periods
    if (currentTrend === 'unknown' && periods.length >= 2) {
      const lastPeriod = periods[periods.length - 1];
      const prevPeriod = periods[periods.length - 2];
      // Try actual plot names first, then plot_* keys
      const lastTS = lastPeriod?.['Trailingstop'] !== undefined ? lastPeriod['Trailingstop'] : lastPeriod?.['plot_0'];
      const prevTS = prevPeriod?.['Trailingstop'] !== undefined ? prevPeriod['Trailingstop'] : prevPeriod?.['plot_0'];
      
      if (lastTS !== undefined && prevTS !== undefined) {
        if (lastTS > prevTS) {
          currentTrend = 'bullish';  // Trailing stop rising = uptrend
          trendConfidence = 70;
        } else if (lastTS < prevTS) {
          currentTrend = 'bearish';  // Trailing stop falling = downtrend
          trendConfidence = 70;
        } else {
          currentTrend = 'neutral';
          trendConfidence = 50;
        }
      }
    }
  }
  
  // Secondary: try from background fills if no plot-based trend
  if (currentTrend === 'unknown' && bgFills.length > 0) {
    const latestFill = bgFills[bgFills.length - 1];
    const colorStr = JSON.stringify(latestFill.color || '').toLowerCase();
    if (/green/i.test(colorStr)) { currentTrend = 'bullish'; trendConfidence = 80; }
    else if (/red/i.test(colorStr)) { currentTrend = 'bearish'; trendConfidence = 80; }
  }

  return {
    summary: {
      totalBoxes: boxes.length, totalLabels: labels.length, totalLines: lines.length,
      bgFills: bgFills.length, trendLines: trendLines.length, 
      trailingLines: trailingLines.length, labelObjects: labelObjects.length
    },
    trend: { 
      current: currentTrend, confidence: trendConfidence, 
      signal: currentTrend === 'bullish' ? 'BUY' : currentTrend === 'bearish' ? 'SELL' : 'NONE',
      trailingStop: trailingStop,
      extremum: extremum,
      fibs: fibs
    },
    latestPrice: latestClose,
    bgFills: bgFills.slice(-10),
    trendLines: trendLines.slice(-5),
    trailingLines: trailingLines.slice(-3),
    labels: labelObjects.slice(-10),
    plotValues: plotValues,
    meta: { durationMs: 0, timeframe: timeframe }
  };
}

function transformForAgentMode(result, args) {
  const { summary, trend, latestPrice, bgFills, trendLines, trailingLines, labels, plotValues, meta } = result;
  return {
    status: 'ok', exitCode: EXIT_CODES.SUCCESS, timestamp: new Date().toISOString(),
    execution: { durationMs: meta?.durationMs || 0, attempts: 1 },
    agentContext: { 
      workflow: 'swingarm-atr-trend', modelVersion: 'v2', 
      symbol: args?.symbol || 'unknown', timeframe: meta?.timeframe || '15m' 
    },
    trend: { 
      direction: trend.current, signal: trend.signal, confidence: trend.confidence,
      latestPrice: latestPrice,
      trailingStop: trend.trailingStop,
      extremum: trend.extremum,
      fibs: trend.fibs || {}
    },
    indicator: {
      name: SCRIPT_NAME, pineId: PINE_ID,
      bgFills: summary.bgFills, trendLines: summary.trendLines, trailingLines: summary.trailingLines,
      labelCount: summary.labelObjects
    },
    recentFills: bgFills.slice(-3).map(f => ({ 
      color: f.color, left: f.left, right: f.right, 
      top: f.top, bottom: f.bottom 
    })),
    plotValues: plotValues || [],
    labels: labels?.slice(-5) || [],
    schemaVersion: 'v2.0.0',
    _parserMeta: {
      schemaVersion: 'v2.0.0',
      emittedAt: new Date().toISOString(),
      deterministic: true,
      workflow: 'swingarm-atr-trend',
    },
  };
}

function printResults(result) {
  const { summary, trend, latestPrice, bgFills, trendLines, trailingLines, meta } = result;
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SWINGARM ATR TREND INDICATOR — ANALYSIS RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`📊 TREND: ${trend.current.toUpperCase()} | SIGNAL: ${trend.signal} | CONFIDENCE: ${trend.confidence}%`);
  console.log(`   Latest Price: ${latestPrice}`);
  
  // Display ATR-specific data
  if (trend.trailingStop !== undefined) {
    console.log(`\n🎯 TRAILING STOP: ${_round(trend.trailingStop)}`);
  }
  if (trend.extremum !== undefined) {
    console.log(`   EXTREMUM: ${_round(trend.extremum)}`);
  }
  if (trend.fibs && (trend.fibs.fib1 !== undefined || trend.fibs.fib2 !== undefined || trend.fibs.fib3 !== undefined)) {
    console.log(`   FIBS: ${_round(trend.fibs.fib1)} / ${_round(trend.fibs.fib2)} / ${_round(trend.fibs.fib3)}`);
  }
  
  console.log(`\n📈 INDICATOR DATA (${summary.totalBoxes} boxes, ${summary.totalLines} lines)`);
  console.log(`   Background Fills: ${summary.bgFills} | Trend Lines: ${summary.trendLines} | Trailing Lines: ${summary.trailingLines}`);
  if (bgFills.length > 0) {
    console.log('\n🎨 RECENT BACKGROUND FILLS');
    bgFills.slice(-3).forEach(f => console.log(`   ${f.color?.includes('green') ? 'BULL' : 'BEAR'}: ${_round(f.top)}-${_round(f.bottom)}`));
  }
  if (trendLines.length > 0) {
    console.log('\n📈 RECENT TREND LINES');
    trendLines.slice(-3).forEach(l => console.log(`   ${l.color} | ${_round(l.y1)}-${_round(l.y2)}`));
  }
  console.log(`\nℹ️ META | Duration: ${meta?.durationMs || 0}ms`);
  console.log('═══════════════════════════════════════════════════════════\n');
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
      const symbolReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Symbol load timeout')), 15000);
        chart.onSymbolLoaded(() => { clearTimeout(timer); resolve(); });
        chart.onError((err) => { clearTimeout(timer); reject(err); });
      });
      chart.setMarket(symbol, { timeframe: normalizedTf, range: bars });
      await symbolReady;
      try { 
        const existing = chart.getStudies ? chart.getStudies() : [];
        if (existing.length > 0 && chart.removeAllStudies) await chart.removeAllStudies(); 
      } catch (e) {}
      study = chart.Study(indicator);
      let updateCount = 0, resolved = false;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { 
          if (!resolved) { 
            const periods = study.periods || []; 
            if (periods.length > 0) { resolved = true; resolve(); } 
            else reject(new Error('Timeout')); 
          } 
        }, 45000);
        study.onError((err) => { if (!resolved) { resolved = true; reject(err); } });
        study.onUpdate(() => { 
          updateCount++; 
          const periods = study.periods || [];
          // Debug: log period structure
          if (updateCount === 1 && periods.length > 0) {
            console.log(`   [debug] Period keys: ${Object.keys(periods[periods.length - 1]).join(', ')}`);
            const lastPeriod = periods[periods.length - 1];
            console.log(`   [debug] plot_0: ${lastPeriod['plot_0']}, plot_1: ${lastPeriod['plot_1']}`);
          }
          // Wait for periods with plot_* data
          if (periods.length > 0 && updateCount >= 3 && !resolved) { 
            resolved = true; clearTimeout(timer); resolve(); 
          } 
        });
      });
      const rawData = { periods: study.periods || [], graphic: study.graphic || {}, bars };
      const chartPeriods = chart.periods || [];
      const parsed = parseGraphicOutput(rawData, tf, chartPeriods);
      // Set duration
      if (parsed) {
        if (!parsed.meta) parsed.meta = {};
        parsed.meta.durationMs = Date.now() - startTime;
        parsed.meta.timeframe = tf;
      }
      try { study.remove(); } catch {}
      try { chart.delete(); } catch {}
      try { client.end(); } catch {}
      return parsed;
    } catch (err) {
      if (/maximum number of studies/i.test(err.message) && attempt < 3) {
        console.log(`⚠️ Retry ${attempt}/3...`);
        try { chart?.delete(); } catch {} try { client?.end(); } catch {}
        await new Promise(r => setTimeout(r, attempt * 3000));
        continue;
      }
      throw err;
    } finally { try { study?.remove(); } catch {} try { chart?.delete(); } catch {} try { client?.end(); } catch {} }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args._symbol && process.argv.length <= 2)) { printUsage(); process.exit(0); }
  const startTime = Date.now();
  if (args.dryRun) { 
    console.log(`\n🏜️ DRY RUN`);
    console.log(JSON.stringify({ status: 'dry_run', ...args, timestamp: new Date().toISOString() }, null, 2));
    process.exit(EXIT_CODES.SUCCESS);
  }
  try {
    const result = await runWebSocket(args.symbol, args.tf, args.bars, startTime, args.inputs);
    if (args.verbose) console.log(`\n✓ Completed in ${result?.meta?.durationMs || 0}ms`);
    if (args.json || args.agent) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      console.log(JSON.stringify(output, null, 2));
    } else {
      printResults(result);
    }
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) {
    const isCritical = /SESSION|SIGNATURE|connection/i.test(err.message);
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(isCritical ? EXIT_CODES.CRITICAL : EXIT_CODES.VALIDATION);
  }
}

main().catch(err => { console.error(`\n❌ Unexpected: ${err.message}`); process.exit(1); });
