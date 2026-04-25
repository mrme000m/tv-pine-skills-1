#!/usr/bin/env node
/**
 * Volume Gaps & Imbalances (Zeiierman) — Standalone Runner
 *
 * Usage:
 *   node volume-gaps-imbalances-zeiierman.cjs BTCUSDT
 *   node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --tf 15m --bars 500
 *   node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --preset scalping
 *   node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --tf 1h --bars 1000 --json
 *   node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --agent
 *   node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --dry-run
 *
 * Presets: default | scalping | swing (stored in volume-gaps-imbalances-zeiierman/*.json)
 */

const fs = require('fs');
const path = require('path');

// ── paths ─────────────────────────────────────────────────────────
const SCRIPT_DIR = path.dirname(__filename);
const PRESET_DIR = path.join(SCRIPT_DIR, 'volume-gaps-imbalances-zeiierman');

// Load env from project root (tv.cjs needs SESSION + SIGNATURE)
require('dotenv').config({ path: path.join(SCRIPT_DIR, '.env') });

const tv = require('./tv-optimized.cjs');

// ── constants ─────────────────────────────────────────────────────
const PINE_ID = 'PUB;ff1a0136336340f38e908eeb12ea33aa';
const SCRIPT_NAME = 'Volume Gaps & Imbalances (Zeiierman)';
const PRESET_DEFAULT = {
  prd: 200,
  rows: 50,
  src: 'hlc3',
  width: 100,
  sum_sections: 20,
  sum_panel_w: 40,
  sum_gap_x: 4,
  sum_show_label: true,
  delta_min_frac: 0.2,
};

// Exit codes
const EXIT_CODES = {
  SUCCESS: 0,
  CRITICAL: 1,      // Missing credentials, connection failed
  NO_DATA: 2,       // Empty profile, no gaps
  TIMEOUT: 3,       // Timeout / cancelled
  VALIDATION: 4,    // Validation error
};

function exitWithError(code, message) {
  console.error(`\n❌ Error ${code}: ${message}`);
  process.exit(code);
}

function exitWithStatus(status, message) {
  if (message) console.error(`\n${message}`);
  process.exit(status);
}

// ── CLI parser ────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    _symbol: argv[0]?.toUpperCase() || null,
    symbol: 'BTCUSDT',
    tf: '15m',
    bars: 500,
    preset: 'default',
    json: false,
    out: null,
    agent: false,
    verbose: false,
    dryRun: false,
    lookback: null,
    rows: null,
  };

  // If first arg doesn't look like an option, it's the symbol
  let start = 0;
  if (args._symbol && !args._symbol.startsWith('-')) {
    args.symbol = args._symbol;
    start = 1;
  }

  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) { args.symbol = argv[++i].toUpperCase(); }
    else if (a === '--tf' && argv[i + 1]) { args.tf = argv[++i]; }
    else if (a === '--bars' && argv[i + 1]) { args.bars = parseInt(argv[++i]); }
    else if (a === '--preset' && argv[i + 1]) { args.preset = argv[++i]; }
    else if (a === '--json') { args.json = true; }
    else if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; }
    else if (a === '--agent') { args.json = true; args.agent = true; }
    else if (a === '--verbose' || a === '-v') { args.verbose = true; }
    else if (a === '--dry-run') { args.dryRun = true; }
    else if (a === '--lookback' && argv[i + 1]) { args.lookback = parseInt(argv[++i]); }
    else if (a === '--rows' && argv[i + 1]) { args.rows = parseInt(argv[++i]); }
    else if (a === '--help' || a === '-h') { args.help = true; }
  }

  return args;
}

function printUsage() {
  console.log(`
Volume Gaps & Imbalances (Zeiierman) — Standalone Runner
===========================================================

Usage:
  node volume-gaps-imbalances-zeiierman.cjs <SYMBOL> [options]

Arguments:
  SYMBOL                    Trading pair (default: BTCUSDT)

Options:
  --tf <timeframe>          Timeframe: 1m, 5m, 15m, 1h, 4h, 1D (default: 15m)
  --bars <n>                Number of chart bars (default: 500)
  --preset <name>           Preset: default, scalping, swing (default: default)
  --lookback <n>            Override preset lookback
  --rows <n>                Override preset rows
  --json                    Output JSON instead of table
  --agent                   Agent mode (simplified JSON, optimized for AI agents)
  --out <file>              Write JSON to file
  --verbose, -v             Verbose output for debugging
  --dry-run                 Skip TradingView connection, show parsed args only
  --help, -h                Show this help

Examples:
  node volume-gaps-imbalances-zeiierman.cjs BTCUSDT
  node volume-gaps-imbalances-zeiierman.cjs ETHUSDT --tf 1h --bars 1000
  node volume-gaps-imbalances-zeiierman.cjs SOLUSDT --preset scalping --json --out sol.json
  node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --agent
  node volume-gaps-imbalances-zeiierman.cjs BTCUSDT --lookback 100 --rows 20 --json

Exit Codes:
  0  = Success (normal run)
  1  = Critical error (missing credentials, connection failed)
  2  = No data (empty profile, no gaps)
  3  = Timeout / cancelled
  4  = Validation error

Agent Mode Enhancements:
  --agent enables simplified JSON output with:
    - Status object with exit codes
    - Timestamps in ISO format
    - Confidence scores for trading signals
    - Machine-readable conformance checks
    - Agentic-specific metadata
`);
}

function loadPreset(name) {
  const file = path.join(PRESET_DIR, `${name}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  if (name === 'default') return { ...PRESET_DEFAULT };
  throw new Error(`Preset "${name}" not found in ${PRESET_DIR}`);
}

// ── input mapping (tv.cjs indicator inputs) ────────────────────────
const INPUT_MAP = [
  { variable: 'prd', tvInputId: 'in_0', type: 'int', default: 200 },
  { variable: 'rows', tvInputId: 'in_1', type: 'int', default: 50 },
  { variable: 'src', tvInputId: 'in_2', type: 'source', default: 'hlc3' },
  { variable: 'width', tvInputId: 'in_3', type: 'int', default: 100 },
  { variable: 'bull_color', tvInputId: 'in_4', type: 'color', default: 'color.new(color.blue, 30)' },
  { variable: 'bear_color', tvInputId: 'in_5', type: 'color', default: 'color.new(color.orange, 30)' },
  { variable: 'zone_color', tvInputId: 'in_6', type: 'color', default: 'color.new(color.navy, 50)' },
  { variable: 'sum_sections', tvInputId: 'in_7', type: 'int', default: 20 },
  { variable: 'sum_panel_w', tvInputId: 'in_8', type: 'int', default: 40 },
  { variable: 'sum_gap_x', tvInputId: 'in_9', type: 'int', default: 4 },
  { variable: 'sum_show_label', tvInputId: 'in_10', type: 'bool', default: true },
  { variable: 'delta_pos_color', tvInputId: 'in_11', type: 'color', default: 'color.new(color.lime, 20)' },
  { variable: 'delta_neg_color', tvInputId: 'in_12', type: 'color', default: 'color.new(color.red,  20)' },
  { variable: 'delta_neutral_bg', tvInputId: 'in_13', type: 'color', default: 'color.new(color.gray, 90)' },
  { variable: 'delta_text_color', tvInputId: 'in_14', type: 'color', default: 'color.white' },
  { variable: 'delta_min_frac', tvInputId: 'in_15', type: 'float', default: 0.2 }
];

function applyInputs(indicator, inputs) {
  if (!inputs || Object.keys(inputs).length === 0) return;
  console.log(`📝 Applying input overrides...`);
  for (const [key, value] of Object.entries(inputs)) {
    const mapping = INPUT_MAP.find(m => m.variable === key);
    if (!mapping) {
      console.warn(`   ⚠️  Unknown input: ${key}`);
      continue;
    }
    try {
      const tvInputDef = indicator.inputs[mapping.tvInputId];
      if (!tvInputDef) {
        console.warn(`   ⚠️  Input ${key} (${mapping.tvInputId}) not in indicator`);
        continue;
      }
      const typed = _coerce(value, mapping.type);
      indicator.setOption(mapping.tvInputId, typed);
      console.log(`   ✅ ${key} → ${mapping.tvInputId} (${tvInputDef.name}): ${JSON.stringify(value)} → ${JSON.stringify(typed)} (${tvInputDef.type})`);
    } catch (e) {
      console.warn(`   ⚠️  ${key} failed: ${e.message}`);
    }
  }
}

function _coerce(val, type) {
  const s = String(val);
  if (type === 'bool') return s.toLowerCase() === 'true' || s === '1';
  if (type === 'int') return parseInt(s, 10);
  if (type === 'float') return parseFloat(s);
  return val;
}

function normalizeTf(tf) {
  const t = String(tf || '15').trim().toLowerCase();
  if (/^\d+$/.test(t)) return t;
  if (/^[dwm]$/.test(t)) return t.toUpperCase();
  const m = t.match(/^(\d+)m$/);
  if (m) return m[1];
  const h = t.match(/^(\d+)h$/);
  if (h) return String(Number(h[1]) * 60);
  if (t === '1d') return '1D';
  if (t === '1w') return '1W';
  return t;
}

// ── parser ────────────────────────────────────────────────────────
function _round(val, decimals = 2) {
  return typeof val === 'number' ? Math.round(val * 10 ** decimals) / 10 ** decimals : val;
}

function parseOutput(rawData, timeframe) {
  const profile = _extractProfile(rawData);
  const gaps = _extractZeroVolumeGaps(rawData);
  const delta = _extractDeltaPanel(rawData);
  const lastBar = _extractLastBar(rawData);
  const summary = _buildSummary(profile, gaps, delta, lastBar);
  const meta = _extractMeta(rawData, timeframe);

  // Enhanced intelligence layers
  const gapIntel = _analyzeGaps(gaps, summary.lastPrice);
  const keyLevels = _extractKeyLevels(profile, summary.lastPrice);
  const regime = _detectRegime(summary, profile, gaps, delta, keyLevels);
  const signals = _generateSignals(gaps, summary, delta, profile, regime, keyLevels);
  const narrative = _generateNarrative(summary, gaps, delta, profile, regime, signals, keyLevels);
  const validation = _validateOutput(summary, profile, gaps, signals);

  const enhanced = {
    gapIntelligence: gapIntel,
    keyLevels,
    regime,
    signals,
    narrative,
    validation,
    agenticScore: _computeAgenticScore(gaps, delta, profile, validation),
  };

  return { summary, profile, gaps, delta, meta, lastBar, enhanced };
}

function _extractProfile(rawData) {
  const boxes = Object.values(
    rawData?.graphic?.dwgboxes ?? rawData?.graphic?.dwgBoxes ?? rawData?.graphic?.boxes ?? {}
  );
  const rows = [];
  for (const b of boxes) {
    if (b.bc === 5 || b.bc === 6) {
      const top = _round(Math.max(b.y1 ?? 0, b.y2 ?? 0));
      const bottom = _round(Math.min(b.y1 ?? 0, b.y2 ?? 0));
      const width = Math.abs((b.x2 ?? 0) - (b.x1 ?? 0));
      rows.push({ priceTop: top, priceBottom: bottom, direction: b.bc === 6 ? 'bull' : 'bear', xStart: b.x1, xEnd: b.x2, width, id: b.id });
    }
  }
  const byPrice = {};
  for (const r of rows) {
    const k = r.priceTop.toFixed(2) + '-' + r.priceBottom.toFixed(2);
    if (!byPrice[k]) byPrice[k] = r;
  }
  const deduped = Object.values(byPrice).sort((a, b) => b.priceTop - a.priceTop);
  return {
    rows: deduped,
    count: deduped.length,
    top: deduped.slice(0, 5),
    bottom: deduped.slice(-5),
    bullCount: deduped.filter(r => r.direction === 'bull').length,
    bearCount: deduped.filter(r => r.direction === 'bear').length,
  };
}

function _extractZeroVolumeGaps(rawData) {
  const boxes = Object.values(
    rawData?.graphic?.dwgboxes ?? rawData?.graphic?.dwgBoxes ?? rawData?.graphic?.boxes ?? {}
  );
  const gaps = [];
  for (const b of boxes) {
    if (b.bc === 7 && b.c === null) {
      const top = _round(Math.max(b.y1 ?? 0, b.y2 ?? 0));
      const bottom = _round(Math.min(b.y1 ?? 0, b.y2 ?? 0));
      gaps.push({ priceTop: top, priceBottom: bottom, height: _round(top - bottom), xStart: b.x1, xEnd: b.x2, id: b.id });
    }
  }
  gaps.sort((a, b) => b.priceTop - a.priceTop);
  return {
    gaps,
    count: gaps.length,
    totalHeight: _round(gaps.reduce((s, g) => s + g.height, 0)),
    largestGap: gaps.length > 0 ? gaps.reduce((a, b) => a.height > b.height ? a : b) : null,
    top3: gaps.slice(0, 3),
  };
}

function _extractDeltaPanel(rawData) {
  const boxes = Object.values(
    rawData?.graphic?.dwgboxes ?? rawData?.graphic?.dwgBoxes ?? rawData?.graphic?.boxes ?? {}
  );
  const sections = [];
  for (const b of boxes) {
    if (b.t && b.t.startsWith('Δ ')) {
      const m = b.t.match(/Δ\s+([+-]?[\d.]+)%/);
      const value = m ? parseFloat(m[1]) : null;
      const top = _round(Math.max(b.y1 ?? 0, b.y2 ?? 0));
      const bottom = _round(Math.min(b.y1 ?? 0, b.y2 ?? 0));
      sections.push({ value, direction: b.bc === 12 ? 'buy' : b.bc === 13 ? 'sell' : 'neutral', priceTop: top, priceBottom: bottom, xStart: b.x1, xEnd: b.x2, id: b.id });
    }
  }
  sections.sort((a, b) => b.priceTop - a.priceTop);
  const buy = sections.filter(s => s.direction === 'buy');
  const sell = sections.filter(s => s.direction === 'sell');
  const avg = sections.length > 0 ? _round(sections.reduce((s, sec) => s + (sec.value || 0), 0) / sections.length, 2) : null;
  return {
    sections,
    count: sections.length,
    avgDelta: avg,
    buySections: buy.length,
    sellSections: sell.length,
    dominantFlow: avg > 10 ? 'buy' : avg < -10 ? 'sell' : 'neutral',
    strongestBuy: buy.length > 0 ? buy.reduce((a, b) => (a.value || 0) > (b.value || 0) ? a : b) : null,
    strongestSell: sell.length > 0 ? sell.reduce((a, b) => (a.value || 0) < (b.value || 0) ? a : b) : null,
  };
}

function _buildSummary(profile, gaps, delta, lastBar) {
  const bullishBias = profile.bullCount > profile.bearCount;
  const bearishBias = profile.bearCount > profile.bullCount;
  const lastPrice = lastBar?.close != null ? _round(lastBar.close) : null;
  return {
    status: 'ok',
    bias: bullishBias ? 'bullish' : bearishBias ? 'bearish' : 'neutral',
    dominantFlow: delta.dominantFlow,
    hasStructuralGaps: gaps.count > 0,
    gapCount: gaps.count,
    largestGapHeight: gaps.largestGap ? gaps.largestGap.height : null,
    largestGapPriceRange: gaps.largestGap ? { top: gaps.largestGap.priceTop, bottom: gaps.largestGap.priceBottom } : null,
    lastPrice,
    totalProfileRows: profile.count,
    deltaSectionCount: delta.count,
    avgDelta: delta.avgDelta,
  };
}

function _extractLastBar(rawData) {
  const p = rawData?.periods || [];
  const latest = p[0];
  if (!latest) return null;
  // Handle both Chart period format ($time, high, low) and Study period format (time, max, min)
  const timestamp = latest.$time ?? latest.time ?? null;
  const open = latest.open ?? latest.o ?? null;
  const high = latest.high ?? latest.max ?? latest.h ?? null;
  const low = latest.low ?? latest.min ?? latest.l ?? null;
  const close = latest.close ?? latest.c ?? null;
  const volume = latest.volume ?? latest.v ?? null;
  return { timestamp, open, high, low, close, volume };
}

function _extractMeta(rawData, timeframe) {
  const g = rawData?.graphic || {};
  return {
    pineId: PINE_ID,
    scriptName: SCRIPT_NAME,
    timeframe: timeframe || '15m',
    boxCount: Object.keys(g.dwgboxes ?? g.dwgBoxes ?? g.boxes ?? {}).length,
    labelCount: Object.keys(g.dwglabels ?? g.dwgLabels ?? g.labels ?? {}).length,
    tableCount: Object.keys(g.dwgtables ?? g.dwgTables ?? g.tables ?? {}).length,
    lineCount: Object.keys(g.dwglines ?? g.dwgLines ?? g.lines ?? {}).length,
    periodCount: rawData?.periods?.length ?? 0,
  };
}

// ── enhanced intelligence modules ──────────────────────────────────

/**
 * Analyzes zero-volume gaps and enriches each with distance, quality, and proximity metrics.
 * @param {Object} gaps - Extracted gaps object from _extractZeroVolumeGaps
 * @param {number|null} lastPrice - Current price
 * @returns {Object} Enriched gap intelligence object
 */
function _analyzeGaps(gaps, lastPrice) {
  const enriched = gaps.gaps.map((g, idx) => {
    const distanceToPrice = lastPrice != null ? _round(g.priceTop - lastPrice) : null;
    const distancePercent = lastPrice != null && g.height > 0 ? _round(distanceToPrice / g.height, 2) : null;
    const isAbovePrice = lastPrice != null ? g.priceBottom > lastPrice : false;
    const isBelowPrice = lastPrice != null ? g.priceTop < lastPrice : false;
    const isNearPrice = lastPrice != null
      ? (isAbovePrice && g.priceBottom - lastPrice <= 2 * g.height) ||
        (isBelowPrice && lastPrice - g.priceTop <= 2 * g.height) ||
        (g.priceBottom <= lastPrice && g.priceTop >= lastPrice)
      : false;

    return {
      ...g,
      index: idx,
      distanceToPrice,
      distancePercent,
      isAbovePrice,
      isBelowPrice,
      isNearPrice,
    };
  });

  const avgGapHeight = gaps.count > 0
    ? _round(gaps.gaps.reduce((s, g) => s + g.height, 0) / gaps.count)
    : 0;

  // Compute quality scores after avg is known
  enriched.forEach(g => {
    const heightScore = avgGapHeight > 0 ? Math.min(g.height / avgGapHeight, 2) / 2 : 0.5;
    const positionScore = g.isNearPrice ? 0.3 : 0.1;
    g.qualityScore = _round(Math.min(0.95, 0.4 + heightScore * 0.4 + positionScore * 0.2), 2);
  });

  const above = enriched.filter(g => g.isAbovePrice).sort((a, b) => a.priceBottom - b.priceBottom);
  const below = enriched.filter(g => g.isBelowPrice).sort((a, b) => b.priceTop - a.priceTop);
  const priceInsideGap = enriched.some(g => g.priceBottom <= lastPrice && g.priceTop >= lastPrice);

  return {
    gaps: enriched,
    count: enriched.length,
    avgGapHeight,
    nearestAbove: above.length > 0 ? above[0] : null,
    nearestBelow: below.length > 0 ? below[0] : null,
    priceInsideGap,
    totalHeight: gaps.totalHeight,
    largestGap: enriched.find(g => gaps.largestGap && g.id === gaps.largestGap.id) || null,
    top3: enriched.slice(0, 3),
  };
}

/**
 * Extracts key levels from the volume profile: POC, value area, support/resistance.
 * @param {Object} profile - Extracted profile object
 * @param {number|null} lastPrice - Current price
 * @returns {Object} Key levels object
 */
function _extractKeyLevels(profile, lastPrice) {
  const rows = profile.rows || [];
  if (rows.length === 0) {
    return {
      poc: null,
      valueAreaHigh: null,
      valueAreaLow: null,
      nearestResistance: null,
      nearestSupport: null,
      profileRange: { high: null, low: null },
    };
  }

  // POC = widest row (largest x extent as volume proxy)
  const pocRow = rows.reduce((widest, r) => ((r.width || 0) > (widest.width || 0) ? r : widest), rows[0]);
  const poc = pocRow ? _round((pocRow.priceTop + pocRow.priceBottom) / 2) : null;

  // Value area: top 70% of rows by width
  const sortedByWidth = [...rows].sort((a, b) => (b.width || 0) - (a.width || 0));
  const cumulativeWidth = sortedByWidth.reduce((s, r) => s + (r.width || 0), 0);
  let running = 0;
  const vaRows = [];
  for (const r of sortedByWidth) {
    running += (r.width || 0);
    vaRows.push(r);
    if (running >= cumulativeWidth * 0.7) break;
  }
  const vaPrices = vaRows.flatMap(r => [r.priceTop, r.priceBottom]);
  const valueAreaHigh = vaPrices.length > 0 ? _round(Math.max(...vaPrices)) : null;
  const valueAreaLow = vaPrices.length > 0 ? _round(Math.min(...vaPrices)) : null;

  // Resistance: highest bear row above price
  const bearRowsAbove = rows.filter(r => r.direction === 'bear' && lastPrice != null && r.priceBottom > lastPrice);
  const nearestResistance = bearRowsAbove.length > 0
    ? bearRowsAbove.reduce((lowest, r) => (r.priceBottom < lowest.priceBottom ? r : lowest), bearRowsAbove[0])
    : null;

  // Support: lowest bull row below price
  const bullRowsBelow = rows.filter(r => r.direction === 'bull' && lastPrice != null && r.priceTop < lastPrice);
  const nearestSupport = bullRowsBelow.length > 0
    ? bullRowsBelow.reduce((highest, r) => (r.priceTop > highest.priceTop ? r : highest), bullRowsBelow[0])
    : null;

  const profileRange = {
    high: _round(rows[0].priceTop),
    low: _round(rows[rows.length - 1].priceBottom),
  };

  return {
    poc,
    valueAreaHigh,
    valueAreaLow,
    nearestResistance: nearestResistance ? _round((nearestResistance.priceTop + nearestResistance.priceBottom) / 2) : null,
    nearestSupport: nearestSupport ? _round((nearestSupport.priceTop + nearestSupport.priceBottom) / 2) : null,
    profileRange,
    pocRow: pocRow ? { priceTop: pocRow.priceTop, priceBottom: pocRow.priceBottom } : null,
  };
}

/**
 * Detects the current market regime based on profile, gaps, delta, and price position.
 * @param {Object} summary - Summary object
 * @param {Object} profile - Profile object
 * @param {Object} gaps - Gaps object
 * @param {Object} delta - Delta panel object
 * @param {Object} keyLevels - Key levels object
 * @returns {string} Regime classification
 */
function _detectRegime(summary, profile, gaps, delta, keyLevels) {
  const totalRows = profile.count || 1;
  const bullRatio = totalRows > 0 ? profile.bullCount / totalRows : 0;
  const bearRatio = totalRows > 0 ? profile.bearCount / totalRows : 0;
  const avgDelta = delta.avgDelta || 0;
  const lastPrice = summary.lastPrice;
  const profileRange = keyLevels.profileRange || {};

  // Position within profile
  let pricePosition = 0.5;
  if (lastPrice != null && profileRange.high != null && profileRange.low != null && profileRange.high > profileRange.low) {
    pricePosition = (lastPrice - profileRange.low) / (profileRange.high - profileRange.low);
  }

  const gapCount = gaps.count || 0;
  const avgGapHeight = gapCount > 0 ? _round(gaps.gaps.reduce((s, g) => s + g.height, 0) / gapCount) : 0;
  const profileSpan = (profileRange.high != null && profileRange.low != null) ? profileRange.high - profileRange.low : 0;
  const isWideProfile = profileSpan > 0 && avgGapHeight / profileSpan > 0.05;
  const hasLargeGaps = gapCount > 0 && gaps.largestGap && gaps.largestGap.height > avgGapHeight * 1.5;

  // Trending bull
  if (bullRatio > 0.70 && avgDelta > 5 && pricePosition > 0.6) return 'trending_bull';
  // Trending bear
  if (bearRatio > 0.70 && avgDelta < -5 && pricePosition < 0.4) return 'trending_bear';
  // Volatile
  if (hasLargeGaps && isWideProfile && Math.abs(avgDelta) < 20) return 'volatile';
  // Accumulation
  if (pricePosition < 0.3 && avgDelta > 0 && avgDelta < 25) return 'accumulation';
  // Distribution
  if (pricePosition > 0.7 && avgDelta < 0 && avgDelta > -25) return 'distribution';
  // Ranging
  if (Math.abs(bullRatio - bearRatio) < 0.2 && Math.abs(avgDelta) < 10 && gapCount <= 3) return 'ranging';

  // Default based on delta
  if (avgDelta > 15) return 'trending_bull';
  if (avgDelta < -15) return 'trending_bear';
  return 'ranging';
}

/**
 * Generates rich trading signals from gaps with full risk/reward metrics.
 * @param {Object} gaps - Raw gaps object
 * @param {Object} summary - Summary object
 * @param {Object} delta - Delta panel object
 * @param {Object} profile - Profile object
 * @param {string} regime - Market regime
 * @param {Object} keyLevels - Key levels object
 * @returns {Array<Object>} Array of trading signals
 */
function _generateSignals(gaps, summary, delta, profile, regime, keyLevels) {
  const lastPrice = summary.lastPrice;
  if (!lastPrice || gaps.count === 0) return [];

  const signals = [];
  const regimeBias = regime.includes('bull') ? 'long' : regime.includes('bear') ? 'short' : 'neutral';
  const deltaAligned = (d) => {
    if (d === 'long') return (delta.avgDelta || 0) > -5;
    if (d === 'short') return (delta.avgDelta || 0) < 5;
    return true;
  };

  // Sort gaps by quality (nearest + largest combined)
  const scoredGaps = gaps.gaps.map(g => {
    const dist = Math.abs((g.priceTop + g.priceBottom) / 2 - lastPrice);
    const score = g.height / (dist + 1); // larger gap, closer = higher score
    return { ...g, score };
  }).sort((a, b) => b.score - a.score);

  // Take top gaps (max 5) for signal generation
  const candidateGaps = scoredGaps.slice(0, 5);

  for (const gap of candidateGaps) {
    const gapMid = _round((gap.priceTop + gap.priceBottom) / 2);
    const isAbove = gap.priceBottom > lastPrice;
    const isBelow = gap.priceTop < lastPrice;
    const isInside = gap.priceBottom <= lastPrice && gap.priceTop >= lastPrice;

    if (!isAbove && !isBelow && !isInside) continue;

    // Determine primary direction for this gap
    const direction = isAbove ? 'short' : 'long';

    // Setup types: rejection, breakout, target
    const setups = [];

    if (isInside) {
      // Price inside gap → rejection from either edge, or breakout
      setups.push('rejection');
      setups.push('breakout');
    } else if (isAbove) {
      // Gap above price → rejection (price moves up into it), target (price magnet)
      setups.push('rejection');
      setups.push('target');
    } else if (isBelow) {
      setups.push('rejection');
      setups.push('target');
    }

    for (const setupType of setups) {
      let entryZone, optimalEntry, stopLoss, takeProfit1, takeProfit2, takeProfit3;
      let risk, reward1, rr;

      if (setupType === 'rejection') {
        entryZone = { min: gap.priceBottom, max: gap.priceTop };
        optimalEntry = direction === 'short'
          ? _round(gap.priceTop - gap.height * 0.25)
          : _round(gap.priceBottom + gap.height * 0.25);
        stopLoss = direction === 'short'
          ? _round(gap.priceTop + gap.height * 0.5)
          : _round(gap.priceBottom - gap.height * 0.5);
        risk = Math.abs(optimalEntry - stopLoss);
        reward1 = risk * 2;
        takeProfit1 = direction === 'short'
          ? _round(optimalEntry - reward1)
          : _round(optimalEntry + reward1);
      } else if (setupType === 'breakout') {
        // Breakout: enter beyond gap edge
        entryZone = direction === 'short'
          ? { priceBottom: gap.priceBottom, priceTop: gap.priceTop }
          : { priceBottom: gap.priceBottom, priceTop: gap.priceTop };
        optimalEntry = direction === 'short'
          ? _round(gap.priceBottom - gap.height * 0.1)
          : _round(gap.priceTop + gap.height * 0.1);
        stopLoss = direction === 'short'
          ? _round(gap.priceTop + gap.height * 0.3)
          : _round(gap.priceBottom - gap.height * 0.3);
        risk = Math.abs(optimalEntry - stopLoss);
        reward1 = risk * 2;
        takeProfit1 = direction === 'short'
          ? _round(optimalEntry - reward1)
          : _round(optimalEntry + reward1);
      } else {
        // Target: gap acts as magnetic target
        entryZone = { min: lastPrice, max: lastPrice };
        optimalEntry = lastPrice;
        stopLoss = direction === 'short'
          ? _round(lastPrice + gap.height * 0.5)
          : _round(lastPrice - gap.height * 0.5);
        risk = Math.abs(optimalEntry - stopLoss);
        reward1 = Math.abs(gapMid - lastPrice);
        takeProfit1 = gapMid;
      }

      // Take Profit 2: next gap in direction
      const gapsInDirection = direction === 'short'
        ? gaps.gaps.filter(g2 => g2.priceTop < gap.priceBottom).sort((a, b) => b.priceTop - a.priceTop)
        : gaps.gaps.filter(g2 => g2.priceBottom > gap.priceTop).sort((a, b) => a.priceBottom - b.priceBottom);
      takeProfit2 = gapsInDirection.length > 0
        ? _round((gapsInDirection[0].priceTop + gapsInDirection[0].priceBottom) / 2)
        : takeProfit1;

      // Take Profit 3: measured move (2x gap height in direction)
      takeProfit3 = direction === 'short'
        ? _round(optimalEntry - gap.height * 2)
        : _round(optimalEntry + gap.height * 2);

      rr = risk > 0 ? _round(reward1 / risk, 2) : 0;
      if (setupType === 'target') rr = risk > 0 ? _round(Math.abs(gapMid - lastPrice) / risk, 2) : 0;

      // Confluence score
      const gapQuality = Math.min(gap.height / (gaps.gaps.reduce((s, g) => s + g.height, 0) / gaps.count || 1), 2) / 2;
      const deltaScore = deltaAligned(direction) ? 0.25 : 0.05;
      const profileScore = direction === 'short'
        ? Math.min(profile.bearCount / (profile.count || 1), 0.25)
        : Math.min(profile.bullCount / (profile.count || 1), 0.25);
      const regimeScore = (regimeBias === direction || regime === 'volatile') ? 0.25 : 0.05;
      const confluenceScore = _round(Math.min(0.99, 0.2 + gapQuality * 0.3 + deltaScore + profileScore + regimeScore), 2);

      // Confidence
      let confidence;
      if (confluenceScore >= 0.85) confidence = 'STRONG';
      else if (confluenceScore >= 0.70) confidence = 'HIGH';
      else if (confluenceScore >= 0.55) confidence = 'MED';
      else confidence = 'LOW';

      // Rationale
      let rationale;
      if (setupType === 'rejection') {
        rationale = `${direction === 'short' ? 'Bearish' : 'Bullish'} rejection expected at ${gap.priceBottom.toFixed(2)}–${gap.priceTop.toFixed(2)} gap (${gap.height.toFixed(2)} height). ${regime.replace('_', ' ')} regime with ${delta.dominantFlow} delta flow.`;
      } else if (setupType === 'breakout') {
        rationale = `${direction === 'short' ? 'Bearish' : 'Bullish'} breakout through ${gap.priceBottom.toFixed(2)}–${gap.priceTop.toFixed(2)} gap. Momentum continuation likely in ${regime.replace('_', ' ')} regime.`;
      } else {
        rationale = `${gap.priceBottom.toFixed(2)}–${gap.priceTop.toFixed(2)} gap acts as magnetic ${direction === 'short' ? 'resistance' : 'support'} target. Price drawn to untraded void.`;
      }

      signals.push({
        setupType,
        direction,
        entryZone: {
          min: _round(entryZone.min),
          max: _round(entryZone.max),
        },
        optimalEntry,
        stopLoss,
        takeProfits: [
          { method: '1:2_rr', price: takeProfit1 },
          { method: 'next_gap', price: takeProfit2 },
          { method: 'measured_move', price: takeProfit3 },
        ],
        riskReward: rr,
        confluenceScore,
        confidence,
        rationale,
        gapId: gap.id,
        gapHeight: gap.height,
      });
    }
  }

  // Rank signals by confluenceScore (descending), dedupe by setup+direction+gapId
  const seen = new Set();
  const ranked = [];
  signals.sort((a, b) => b.confluenceScore - a.confluenceScore);
  for (const s of signals) {
    const key = `${s.setupType}-${s.direction}-${s.gapId}`;
    if (!seen.has(key)) {
      seen.add(key);
      ranked.push({ rank: ranked.length + 1, ...s });
    }
  }

  return ranked.slice(0, 6); // max 6 signals
}

/**
 * Generates a natural language narrative describing market structure and opportunities.
 * @param {Object} summary - Summary object
 * @param {Object} gaps - Gaps object
 * @param {Object} delta - Delta panel object
 * @param {Object} profile - Profile object
 * @param {string} regime - Market regime
 * @param {Array<Object>} signals - Generated signals
 * @param {Object} keyLevels - Key levels object
 * @returns {Object} Narrative sections
 */
function _generateNarrative(summary, gaps, delta, profile, regime, signals, keyLevels) {
  const lastPrice = summary.lastPrice;
  const gapCount = gaps.count || 0;
  const totalVoid = gaps.totalHeight || 0;

  // Market structure paragraph
  const parts = [];
  parts.push(`Price is at ${lastPrice != null ? lastPrice.toFixed(2) : 'N/A'} in a ${regime.replace(/_/g, ' ')} regime.`);
  parts.push(`Profile bias is ${summary.bias} with ${summary.dominantFlow} delta flow (${profile.bullCount} bull vs ${profile.bearCount} bear rows).`);
  if (gapCount > 0) {
    parts.push(`There are ${gapCount} structural gaps totaling ${totalVoid.toFixed(2)} units of void.`);
    if (gaps.largestGap) {
      parts.push(`The largest gap is ${gaps.largestGap.height.toFixed(2)} (${gaps.largestGap.priceBottom.toFixed(2)}–${gaps.largestGap.priceTop.toFixed(2)}).`);
    }
  } else {
    parts.push('No structural gaps detected — market may be in consolidation.');
  }
  const marketStructure = parts.join(' ');

  // Primary opportunity
  let primaryOpportunity = 'No high-confidence setups detected.';
  const best = signals.find(s => s.rank === 1);
  if (best) {
    primaryOpportunity = `Best setup: ${best.direction.toUpperCase()} ${best.setupType} at ${best.entryZone.min.toFixed(2)}–${best.entryZone.max.toFixed(2)} (confidence: ${best.confidence}, R/R: ${best.riskReward}). ${best.rationale}`;
  }

  // Warnings
  const warnings = [];
  if (gapCount === 0) warnings.push('No structural gaps — avoid directional bets without inefficiency.');
  if (Math.abs(delta.avgDelta || 0) < 5) warnings.push('Delta is near neutral — confirm directional bias before entering.');
  if (regime === 'ranging') warnings.push('Ranging regime — reduce position size and expect false breaks.');
  if (regime === 'volatile') warnings.push('Volatile regime — wide stops recommended, choppy conditions likely.');
  if (profile.count < 10) warnings.push('Thin profile — low confidence in row-based bias.');

  // Watchlist
  const watchlist = [];
  watchlist.push(`Watch for delta shift in favor of the intended direction.`);
  if (keyLevels.poc) watchlist.push(`Monitor POC at ${keyLevels.poc.toFixed(2)} for acceptance/rejection.`);
  if (keyLevels.valueAreaHigh && keyLevels.valueAreaLow) {
    watchlist.push(`Value area bounds: ${keyLevels.valueAreaLow.toFixed(2)}–${keyLevels.valueAreaHigh.toFixed(2)}.`);
  }
  if (best) {
    watchlist.push(`Watch ${best.direction === 'short' ? 'upper' : 'lower'} gaps for confluence.`);
  }

  return { marketStructure, primaryOpportunity, warnings, watchlist };
}

/**
 * Validates the parsed output for structural correctness and signal completeness.
 * @param {Object} summary - Summary object
 * @param {Object} profile - Profile object
 * @param {Object} gaps - Gaps object
 * @param {Array<Object>} signals - Generated signals
 * @returns {Object} Validation result
 */
function _validateOutput(summary, profile, gaps, signals) {
  const checks = [];
  const warnings = [];

  // Valid profile
  if (profile.count > 0) {
    checks.push({ name: 'valid_profile', passed: true, detail: `${profile.count} rows` });
  } else {
    checks.push({ name: 'valid_profile', passed: false, detail: '0 rows' });
    warnings.push('Empty volume profile — indicator may not have loaded correctly.');
  }

  // Valid gaps or explanation
  if (gaps.count > 0) {
    checks.push({ name: 'valid_gaps', passed: true, detail: `${gaps.count} gaps` });
  } else {
    checks.push({ name: 'valid_gaps', passed: false, detail: '0 gaps' });
    warnings.push('No gaps detected — this is normal in low-volatility or consolidation periods.');
  }

  // Last price present
  if (summary.lastPrice != null) {
    checks.push({ name: 'last_price', passed: true, detail: String(summary.lastPrice) });
  } else {
    checks.push({ name: 'last_price', passed: false, detail: 'missing' });
    warnings.push('Missing last price — signals may be incomplete.');
  }

  // Signal fields
  const requiredSignalFields = ['setupType', 'direction', 'entryZone', 'optimalEntry', 'stopLoss', 'takeProfits', 'riskReward', 'confluenceScore', 'confidence', 'rationale'];
  let signalChecksPassed = true;
  for (const sig of signals) {
    for (const f of requiredSignalFields) {
      if (sig[f] === undefined) {
        signalChecksPassed = false;
        warnings.push(`Signal missing field: ${f}`);
      }
    }
  }
  checks.push({ name: 'signal_fields', passed: signalChecksPassed, detail: `${signals.length} signals checked` });

  const passed = checks.every(c => c.passed);

  return { passed, checks, warnings };
}

/**
 * Computes an overall agentic readiness score.
 * @param {Object} gaps - Gaps object
 * @param {Object} delta - Delta panel object
 * @param {Object} profile - Profile object
 * @param {Object} validation - Validation result
 * @returns {number} Score between 0 and 1
 */
function _computeAgenticScore(gaps, delta, profile, validation) {
  let score = 0.3;
  if (gaps.count > 0) score += 0.2;
  if (delta.avgDelta !== null && Math.abs(delta.avgDelta) > 10) score += 0.2;
  if (delta.count >= 3) score += 0.1;
  if (profile.count >= 10) score += 0.1;
  if (validation.passed) score += 0.1;
  return _round(Math.min(score, 0.99), 2);
}

// ── agent mode transformation ─────────────────────────────────────
/**
 * Transforms parsed result into agent-optimized output.
 * @param {Object} result - Full parsed result including enhanced intelligence
 * @param {Object} args - CLI arguments (for symbol, tf, inputs)
 * @returns {Object} Agent-ready JSON structure
 */
function transformForAgentMode(result, args) {
  const { summary, profile, gaps, delta, meta, enhanced } = result;
  const now = new Date().toISOString();

  const inputs = args?.inputs || {};
  const lookback = inputs.prd || PRESET_DEFAULT.prd;

  // Build structural gaps list for key levels
  const structuralGaps = gaps.gaps.map(g => ({
    priceBottom: g.priceBottom,
    priceTop: g.priceTop,
    height: g.height,
    role: g.priceTop < summary.lastPrice ? 'support' : g.priceBottom > summary.lastPrice ? 'resistance' : 'current_zone',
  }));

  return {
    status: 'ok',
    exitCode: EXIT_CODES.SUCCESS,
    timestamp: now,
    execution: {
      durationMs: meta.durationMs,
      attempts: 1,
    },
    agentContext: {
      workflow: 'trend-following-gap-rejection', htfTimeframe: null,
      modelVersion: 'agent-ready-v2',
      symbol: args?.symbol || meta.symbol || 'unknown',
      timeframe: meta.timeframe || '15m',
    },
    market: {
      lastPrice: summary.lastPrice,
      bias: summary.bias,
      dominantFlow: summary.dominantFlow,
      regime: enhanced.regime,
    },
    structure: {
      gaps: {
        count: enhanced.gapIntelligence.count,
        avgGapHeight: enhanced.gapIntelligence.avgGapHeight,
        totalVoid: enhanced.gapIntelligence.totalHeight,
        nearestAbove: enhanced.gapIntelligence.nearestAbove
          ? { priceBottom: enhanced.gapIntelligence.nearestAbove.priceBottom, priceTop: enhanced.gapIntelligence.nearestAbove.priceTop, distance: enhanced.gapIntelligence.nearestAbove.distanceToPrice }
          : null,
        nearestBelow: enhanced.gapIntelligence.nearestBelow
          ? { priceBottom: enhanced.gapIntelligence.nearestBelow.priceBottom, priceTop: enhanced.gapIntelligence.nearestBelow.priceTop, distance: enhanced.gapIntelligence.nearestBelow.distanceToPrice }
          : null,
        priceInsideGap: enhanced.gapIntelligence.priceInsideGap,
        top3: enhanced.gapIntelligence.top3.map(g => ({
          priceBottom: g.priceBottom,
          priceTop: g.priceTop,
          height: g.height,
          qualityScore: g.qualityScore,
          isNearPrice: g.isNearPrice,
        })),
      },
      profile: {
        totalRows: profile.count,
        bullRows: profile.bullCount,
        bearRows: profile.bearCount,
        dominantRatio: (() => {
          const total = profile.bullCount + profile.bearCount;
          if (total === 0) return 'balanced';
          const ratio = profile.bullCount / total;
          return ratio > 0.85 ? 'bullish' : ratio < 0.15 ? 'bearish' : 'balanced';
        })(),
      },
      delta: {
        sections: delta.count,
        avgDelta: delta.avgDelta,
        dominantFlow: delta.dominantFlow,
        strongestBuy: delta.strongestBuy
          ? { value: delta.strongestBuy.value, range: `${delta.strongestBuy.priceBottom.toFixed(2)}-${delta.strongestBuy.priceTop.toFixed(2)}` }
          : null,
        strongestSell: delta.strongestSell
          ? { value: delta.strongestSell.value, range: `${delta.strongestSell.priceBottom.toFixed(2)}-${delta.strongestSell.priceTop.toFixed(2)}` }
          : null,
      },
    },
    opportunities: enhanced.signals.map(s => {
      const distanceFromPrice = (s.optimalEntry && summary.lastPrice) ? _round(Math.abs(s.optimalEntry - summary.lastPrice)) : null;
      const isStale = distanceFromPrice !== null && distanceFromPrice > (summary.lastPrice * 0.005);
      return {
        rank: s.rank,
        setup: `${s.direction}_${s.setupType}`,
        direction: s.direction,
        confidence: s.confidence,
        confluenceScore: s.confluenceScore,
        entryZone: { min: s.entryZone.min, max: s.entryZone.max },
        optimalEntry: s.optimalEntry,
        stopLoss: s.stopLoss,
        takeProfits: s.takeProfits,
        riskReward: s.riskReward,
        distanceFromPrice,
        isStale,
        setupType: s.setupType === 'target' ? 'limit' : s.setupType === 'breakout' ? 'stop' : 'market',
        rationale: s.rationale + (isStale ? ` ⚠️ Entry is ${distanceFromPrice} away from price ${summary.lastPrice.toFixed(2)} — limit setup.` : ''),
      };
    }),
    keyLevels: {
      poc: enhanced.keyLevels.poc,
      valueAreaHigh: enhanced.keyLevels.valueAreaHigh,
      valueAreaLow: enhanced.keyLevels.valueAreaLow,
      nearestSupport: enhanced.keyLevels.nearestSupport,
      nearestResistance: enhanced.keyLevels.nearestResistance,
      structuralGaps,
    },
    narrative: enhanced.narrative,
    validation: enhanced.validation,
    conformance: {
      hasValidStructure: enhanced.validation.checks.find(c => c.name === 'valid_gaps')?.passed || false,
      hasDirectionalImpulse: Math.abs(delta.avgDelta || 0) > 5,
      profileBalance: (() => {
        const total = profile.bullCount + profile.bearCount;
        if (total === 0) return 'balanced';
        const ratio = profile.bullCount / total;
        return ratio > 0.85 ? 'bullish' : ratio < 0.15 ? 'bearish' : 'balanced';
      })(),
      agenticScore: enhanced.agenticScore,
    },
    schemaVersion: 'agent-ready-v2.0.0',
  };
}

// ── output formatting ─────────────────────────────────────────────
function printResults(result) {
  const { summary, profile, gaps, delta, meta, enhanced } = result;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  VOLUME GAPS & IMBALANCES — ANALYSIS RESULTS');
  console.log('══════════════════════════════════════════════════════════════════════');

  console.log('\n📊 SUMMARY');
  console.log(`   Status:          ${summary.status}`);
  console.log(`   Bias:            ${summary.bias.toUpperCase()}`);
  console.log(`   Dominant Flow:   ${summary.dominantFlow.toUpperCase()}`);
  console.log(`   Structural Gaps: ${summary.hasStructuralGaps ? 'YES' : 'none'}`);
  console.log(`   Regime:          ${enhanced.regime}`);
  if (summary.lastPrice) console.log(`   Last Price:      ${summary.lastPrice.toFixed(2)}`);

  console.log('\n⚡ ZERO-VOLUME GAPS');
  console.log(`   Count:           ${gaps.count}`);
  console.log(`   Total Void:      ${gaps.totalHeight.toFixed(2)} USDT`);
  console.log(`   Avg Gap Height:  ${enhanced.gapIntelligence.avgGapHeight.toFixed(2)} USDT`);
  if (enhanced.gapIntelligence.priceInsideGap) console.log(`   ⚠️  Price inside gap!`);
  if (enhanced.gapIntelligence.nearestAbove) {
    const na = enhanced.gapIntelligence.nearestAbove;
    console.log(`   Nearest Above:   ${na.priceBottom.toFixed(2)}–${na.priceTop.toFixed(2)} (${na.distanceToPrice != null ? '+' + na.distanceToPrice.toFixed(2) : 'N/A'})`);
  }
  if (enhanced.gapIntelligence.nearestBelow) {
    const nb = enhanced.gapIntelligence.nearestBelow;
    console.log(`   Nearest Below:   ${nb.priceBottom.toFixed(2)}–${nb.priceTop.toFixed(2)} (${nb.distanceToPrice != null ? nb.distanceToPrice.toFixed(2) : 'N/A'})`);
  }
  if (gaps.largestGap) {
    console.log(`   Largest Gap:     ${gaps.largestGap.height.toFixed(2)} USDT`);
    console.log(`   Largest Range:   ${gaps.largestGap.priceBottom.toFixed(2)} – ${gaps.largestGap.priceTop.toFixed(2)}`);
  }
  if (gaps.top3.length > 0) {
    console.log('   Top 3 Gaps:');
    gaps.top3.forEach((g, i) => console.log(`      ${i + 1}. ${g.priceBottom.toFixed(2)} – ${g.priceTop.toFixed(2)} (${g.height.toFixed(2)} height, id:${g.id})`));
  }

  console.log('\n📈 VOLUME PROFILE');
  console.log(`   Total Rows:      ${profile.count}`);
  console.log(`   Bull Rows:       ${profile.bullCount}`);
  console.log(`   Bear Rows:       ${profile.bearCount}`);
  console.log(`   POC:             ${enhanced.keyLevels.poc != null ? enhanced.keyLevels.poc.toFixed(2) : 'N/A'}`);
  console.log(`   Value Area:      ${enhanced.keyLevels.valueAreaLow != null ? enhanced.keyLevels.valueAreaLow.toFixed(2) : 'N/A'} – ${enhanced.keyLevels.valueAreaHigh != null ? enhanced.keyLevels.valueAreaHigh.toFixed(2) : 'N/A'}`);
  console.log(`   Nearest Support: ${enhanced.keyLevels.nearestSupport != null ? enhanced.keyLevels.nearestSupport.toFixed(2) : 'N/A'}`);
  console.log(`   Nearest Resist:  ${enhanced.keyLevels.nearestResistance != null ? enhanced.keyLevels.nearestResistance.toFixed(2) : 'N/A'}`);
  if (profile.top.length > 0) {
    console.log('   Top 5 Price Rows (highest price):');
    profile.top.forEach((r, i) => console.log(`      ${i + 1}. ${r.direction === 'bull' ? '🟢' : '🟠'} ${r.priceBottom.toFixed(2)} – ${r.priceTop.toFixed(2)} (${r.direction})`));
  }
  if (profile.bottom.length > 0) {
    console.log('   Bottom 5 Price Rows (lowest price):');
    profile.bottom.forEach((r, i) => console.log(`      ${i + 1}. ${r.direction === 'bull' ? '🟢' : '🟠'} ${r.priceBottom.toFixed(2)} – ${r.priceTop.toFixed(2)} (${r.direction})`));
  }

  console.log('\n📊 DELTA PANEL');
  console.log(`   Sections:        ${delta.count}`);
  console.log(`   Buy Flow:        ${delta.buySections} sections`);
  console.log(`   Sell Flow:       ${delta.sellSections} sections`);
  console.log(`   Avg Delta:       ${delta.avgDelta !== null ? delta.avgDelta.toFixed(1) + '%' : 'N/A'}`);
  if (delta.strongestBuy) console.log(`   Strongest Buy:   ${delta.strongestBuy.value.toFixed(1)}% @ ${delta.strongestBuy.priceBottom.toFixed(2)}-${delta.strongestBuy.priceTop.toFixed(2)}`);
  if (delta.strongestSell) console.log(`   Strongest Sell:  ${delta.strongestSell.value.toFixed(1)}% @ ${delta.strongestSell.priceBottom.toFixed(2)}-${delta.strongestSell.priceTop.toFixed(2)}`);
  console.log('\n   All Delta Sections (top to bottom of profile):');
  delta.sections.forEach((s, i) => {
    const arrow = s.direction === 'buy' ? '▲' : s.direction === 'sell' ? '▼' : '—';
    const val = s.value !== null ? s.value.toFixed(1) + '%' : 'N/A';
    console.log(`      ${i + 1}. ${arrow} ${val} @ ${s.priceBottom.toFixed(2)}-${s.priceTop.toFixed(2)}`);
  });

  if (enhanced.signals.length > 0) {
    console.log('\n🎯 TRADING SIGNALS');
    enhanced.signals.forEach((s) => {
      const emoji = s.direction === 'long' ? '🟢' : '🔴';
      console.log(`   ${emoji} #${s.rank} ${s.direction.toUpperCase()} ${s.setupType.toUpperCase()} | Confidence: ${s.confidence} | R/R: ${s.riskReward}`);
      console.log(`      Entry Zone: ${s.entryZone.min.toFixed(2)} – ${s.entryZone.max.toFixed(2)}`);
      console.log(`      Optimal Entry: ${s.optimalEntry.toFixed(2)} | SL: ${s.stopLoss.toFixed(2)}`);
      console.log(`      TPs: ${s.takeProfits.map(tp => `${tp.method}=${tp.price.toFixed(2)}`).join(', ')}`);
      console.log(`      Confluence: ${s.confluenceScore} | ${s.rationale}`);
    });
  }

  if (enhanced.narrative.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS');
    enhanced.narrative.warnings.forEach(w => console.log(`   • ${w}`));
  }

  console.log('\nℹ️  META');
  console.log(`   pineId:          ${meta.pineId}`);
  console.log(`   scriptName:      ${meta.scriptName}`);
  console.log(`   Duration:        ${meta.durationMs}ms`);
  console.log(`   Agentic Score:   ${enhanced.agenticScore}`);
  console.log('══════════════════════════════════════════════════════════════════════\n');
}

// ── WebSocket runner (with retry + cleanup) ────────────────────────
async function runWebSocket(symbol, tf, bars, inputs, startTime) {
  const session = process.env.SESSION || '';
  const signature = process.env.SIGNATURE || '';
  if (!session || !signature) throw new Error('SESSION and SIGNATURE env vars required');

  const normalizedTf = normalizeTf(tf);

  for (let attempt = 1; attempt <= 3; attempt++) {
    let client = null;
    let chart = null;
    let study = null;

    try {
      // 1. Load indicator
      const indicator = await tv.getIndicator(PINE_ID, 'last', session, signature);

      // 2. Connect
      client = new tv.Client({ token: session, signature, location: 'https://www.tradingview.com/' });
      await client.connect();
      const connected = await client.waitForConnected(20000);
      if (!connected) throw new Error('Connection timeout');

      // 3. Chart session
      chart = client.Session.Chart();
      const symbolReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Symbol load timeout (15s)')), 15000);
        chart.onSymbolLoaded(() => { clearTimeout(timer); resolve(); });
        chart.onError((err) => { clearTimeout(timer); reject(new Error(`Chart error: ${err?.message || JSON.stringify(err)}`)); });
      });

      chart.setMarket(symbol, { timeframe: normalizedTf, range: bars });
      await symbolReady;

      // 4. Cleanup existing studies
      try {
        const existing = chart.getStudies ? chart.getStudies() : [];
        if (existing.length > 0) {
          console.log(`🧹 Removing ${existing.length} existing study/studies...`);
          if (chart.removeAllStudies) {
            await chart.removeAllStudies();
          } else {
            for (const s of existing) {
              try { chart.removeStudy(s.id); } catch {}
            }
          }
        }
      } catch (e) {}

      // 5. Apply inputs
      applyInputs(indicator, inputs);

      // 6. Attach study
      study = chart.Study(indicator);

      // 7. Wait for data
      const maxUpdates = 3;
      let updateCount = 0;
      let resolved = false;

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!resolved) {
            const periods = study.periods || [];
            if (periods.length > 0 || Object.keys(study.graphic || {}).length > 0) {
              resolved = true; resolve();
            } else {
              reject(new Error('Timeout (45s)'));
            }
          }
        }, 45000);

        study.onError((err) => {
          clearTimeout(timer);
          if (!resolved) { resolved = true; reject(new Error(`Study error: ${err?.message || JSON.stringify(err)}`)); }
        });

        study.onUpdate(() => {
          updateCount++;
          if (updateCount >= maxUpdates && !resolved) { resolved = true; clearTimeout(timer); resolve(); }
        });
      });

      // 8. Extract & parse
      // Use chart periods if study periods lack OHLC data (common when studies output only timestamps + numericals)
      const periods = (study.periods && study.periods[0]?.close != null)
        ? study.periods
        : (study.periods && chart.periods && chart.periods.length > 0)
          ? chart.periods
          : (study.periods || chart.periods || []);
      const rawData = {
        periods,
        graphic: study.graphic || {},
        strategyReport: study.strategyReport || null,
        bars,
        raw: study,
      };
      const parsed = parseOutput(rawData, tf);
      const duration = Date.now() - startTime;
      parsed.meta.durationMs = duration;

      // 9. Cleanup
      try { study.remove(); } catch {}
      try { chart.delete(); } catch {}
      try { client.end(); } catch {}

      return parsed;

    } catch (err) {
      const isLimit = /maximum number of studies/i.test(err.message);
      if (isLimit && attempt < 3) {
        console.log(`⚠️  Study limit hit (attempt ${attempt}/3), retrying in ${attempt * 3}s...`);
        try { chart.delete(); } catch {}
        try { client.end(); } catch {}
        await new Promise(r => setTimeout(r, attempt * 3000));
        continue;
      }
      throw err;
    } finally {
      try { study.remove(); } catch {}
      try { chart.delete(); } catch {}
      try { client.end(); } catch {}
    }
  }
}

// ── main ──────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args._symbol && process.argv.length <= 2)) {
    printUsage();
    process.exit(0);
  }

  const startTime = Date.now();

  console.log('\n======================================================================');
  console.log(`📊 Running: ${PINE_ID}`);
  console.log(`   Symbol: ${args.symbol} | Timeframe: ${args.tf} | Bars: ${args.bars}`);
  console.log('======================================================================');

  // Load preset
  let inputs = loadPreset(args.preset);

  // Apply CLI overrides for lookback and rows
  if (args.lookback != null) inputs.prd = args.lookback;
  if (args.rows != null) inputs.rows = args.rows;
  args.inputs = inputs;

  console.log(`📝 Input overrides (${args.preset} preset + CLI):`);
  console.log(JSON.stringify(inputs, null, 2));

  // Dry run: print args and exit without connecting
  if (args.dryRun) {
    console.log('\n🏜️  DRY RUN — Skipping TradingView connection.');
    const dryOutput = {
      status: 'dry_run',
      symbol: args.symbol,
      timeframe: args.tf,
      bars: args.bars,
      inputs,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(dryOutput, null, 2));
    process.exit(EXIT_CODES.SUCCESS);
  }

  try {
    const result = await runWebSocket(args.symbol, args.tf, args.bars, inputs, startTime);

    if (args.verbose) {
      console.log(`\n✓ Completed in ${result.meta.durationMs}ms`);
    }

    if (args.json) {
      const output = args.agent ? transformForAgentMode(result, args) : result;
      const json = JSON.stringify(output, null, 2);
      if (args.out) {
        fs.writeFileSync(args.out, json, 'utf8');
        console.log(`✅ Saved ${args.agent ? 'agent-ready' : 'raw'} JSON to ${args.out}`);
      } else {
        console.log(json);
      }
    } else {
      printResults(result);
    }

    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) {
    const isCritical = /SESSION and SIGNATURE/i.test(err.message) || /connection/i.test(err.message);
    const code = isCritical ? EXIT_CODES.CRITICAL : EXIT_CODES.VALIDATION;

    console.error(`\n❌ Error ${code}: ${err.message}`);
    if (args.verbose) {
      if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    } else {
      if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }

    process.exit(code);
  }
}

main().catch(err => {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
