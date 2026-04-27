#!/usr/bin/env node
/**
 * YouTube → TradingView Pine Script — Context Gatherer
 * =====================================================
 * Gathers indicator metadata from a YouTube video and outputs a JSON manifest.
 * The actual code generation is performed by Claude Code (see SKILL.md).
 *
 * Usage:
 *   node youtube-to-tv-pine.cjs "https://youtube.com/watch?v=..."
 *   node youtube-to-tv-pine.cjs "<url>" --auto > manifest.json
 *   node youtube-to-tv-pine.cjs "<url>" --nlm-notebook-id <uuid>
 *   node youtube-to-tv-pine.cjs "<url>" --dry-run
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Project Root Resolution ─────────────────────────────────────────
function findProjectRoot() {
  let dir = path.resolve(__dirname);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'tv-optimized.cjs')) || fs.existsSync(path.join(dir, 'tv.cjs'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, '../..');
}
const PROJECT_ROOT = findProjectRoot();

// ─── Paths ───────────────────────────────────────────────────────────
const PUBLIST = path.join(PROJECT_ROOT, 'tv-indicator', 'scripts', 'publist.cjs');
const TV_CJS = path.join(PROJECT_ROOT, 'tv-optimized.cjs');

// ─── CLI Parser ──────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    youtubeUrl: null,
    auto: false,
    nlmNotebookId: null,
    outputDir: path.join(PROJECT_ROOT, 'generated-skills'),
    dryRun: false,
    verbose: false,
    interactive: true,
    firecrawlWait: 2000,
    help: false,
  };

  let i = 0;
  if (argv[0] && !argv[0].startsWith('-')) {
    args.youtubeUrl = argv[0];
    i = 1;
  }

  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--auto') args.auto = true;
    else if (a === '--nlm-notebook-id' && argv[i + 1]) args.nlmNotebookId = argv[++i];
    else if (a === '--output-dir' && argv[i + 1]) args.outputDir = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--no-interactive') args.interactive = false;
    else if (a === '--firecrawl-wait' && argv[i + 1]) args.firecrawlWait = parseInt(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
  }

  return args;
}

function printUsage() {
  console.log(`
YouTube → TradingView Pine Script — Context Gatherer
=====================================================

Gathers indicator metadata from a YouTube video and outputs a JSON manifest.
Code generation is performed by Claude Code (see SKILL.md).

Usage:
  node youtube-to-tv-pine.cjs <YOUTUBE_URL> [options]

Options:
  --auto                    Auto-select top search result
  --nlm-notebook-id <id>    Use existing NLM notebook
  --output-dir <path>       Output directory (default: ./generated-skills)
  --dry-run                 Show pipeline without executing
  --verbose, -v             Detailed logging
  --no-interactive          Never prompt; fail if ambiguity
  --firecrawl-wait <ms>     Wait for JS render (default: 2000)
  --help, -h                Show this help

Examples:
  node youtube-to-tv-pine.cjs "https://youtube.com/watch?v=..."
  node youtube-to-tv-pine.cjs "<url>" --auto > manifest.json
  node youtube-to-tv-pine.cjs "<url>" --dry-run
`);
}

// ─── Utilities ───────────────────────────────────────────────────────
function log(msg) {
  if (process.env.YT_TV_VERBOSE) console.error(`[yt→tv] ${msg}`);
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function camelCase(name) {
  return name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, c => c.toLowerCase());
}

function execJson(cmd, opts = {}) {
  const out = execSync(cmd, { encoding: 'utf8', cwd: PROJECT_ROOT, ...opts });
  try {
    return JSON.parse(out);
  } catch {
    return out.trim();
  }
}

function execText(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: PROJECT_ROOT, ...opts }).trim();
  } catch (e) {
    return { error: true, stderr: e.stderr?.toString(), message: e.message };
  }
}

// ─── Phase A: Extract Indicator Identity ─────────────────────────────────

async function phaseExtractIndicator(args) {
  log('Phase A: Extracting indicator identity from video...');

  if (args.dryRun) {
    return {
      indicatorName: 'DRY-RUN-Indicator',
      pineId: null,
      notebookId: 'dry-run-notebook',
      source: 'dry-run',
    };
  }

  // 1. Ensure NLM auth
  try {
    execSync('nlm auth status', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  } catch {
    log('NLM not authenticated. Running nlm login...');
    try {
      execSync('nlm login', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    } catch {
      console.error('❌ NLM login failed. Please authenticate manually.');
      process.exit(1);
    }
  }

  // 2. Get or create notebook
  let notebookId = args.nlmNotebookId;
  if (!notebookId) {
    log('Creating NLM notebook...');
    // Create notebook and extract ID from output
    const nbRaw = execSync('nlm notebook create "YouTube Indicator Extractor"', {
      encoding: 'utf8', cwd: PROJECT_ROOT,
    }).trim();
    // Extract notebook ID from output
    const nbIdMatch = nbRaw.match(/ID:\s*([a-f0-9-]+)/i);
    notebookId = nbIdMatch ? nbIdMatch[1] : nbRaw;
    if (!notebookId) {
      console.error('❌ Failed to create NLM notebook');
      process.exit(1);
    }
    log(`Notebook ID: ${notebookId}`);
  }

  // 3. Add YouTube source
  log('Adding YouTube source to notebook...');
  try {
    execSync(`nlm source add "${notebookId}" --url "${args.youtubeUrl}"`, {
      cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 120000,
    });
  } catch (e) {
    log(`Source add warning (may already exist): ${e.message}`);
  }

  // Wait for indexing
  log('Waiting 10s for source indexing...');
  await new Promise(r => setTimeout(r, 10000));

  // 4. Query for indicator name
  log('Querying notebook for indicator name...');
  let indicatorName = null;
  let pineId = null;

  try {
    const q1 = execText(
      `nlm notebook query "${notebookId}" "What is the exact name of the TradingView Pine Script indicator discussed? Return ONLY the plain indicator name, no extra text, no URLs, no markdown links. If unsure, return 'Unknown'."`,
      { timeout: 30000 }
    );
    if (typeof q1 === 'string' && q1.length > 0) {
      // Try to parse as JSON (NLM may return JSON)
      let parsed = null;
      try { parsed = JSON.parse(q1); } catch {}
      if (parsed && parsed.value && parsed.value.answer) {
        indicatorName = parsed.value.answer.trim();
      } else {
        indicatorName = q1.replace(/^["']|["']$/g, '').trim();
      }
      if (indicatorName.length > 0 && indicatorName.length < 200) {
        log(`NLM indicator name: ${indicatorName}`);
      } else {
        indicatorName = null;
      }
    }
  } catch (e) {
    log(`NLM query failed: ${e.message}`);
  }

  // 5. Query for Pine ID
  try {
    const q2 = execText(
      `nlm notebook query "${notebookId}" "Does the video mention a TradingView script URL or Pine ID? Look for links like tradingview.com/script/... or IDs like PUB;..."`,
      { timeout: 30000 }
    );
    if (typeof q2 === 'string') {
      // Try to parse as JSON (NLM may return JSON)
      let q2Text = q2;
      try {
        const parsedQ2 = JSON.parse(q2);
        if (parsedQ2?.value?.answer) q2Text = parsedQ2.value.answer;
      } catch {}
      const idMatch = q2Text.match(/(PUB;[a-f0-9]+)/i);
      if (idMatch) pineId = idMatch[1];
      const urlMatch = q2Text.match(/tradingview\.com\/script\/(\w+)/i);
      if (urlMatch && !pineId) pineId = `PUB;${urlMatch[1]}`;
    }
  } catch (e) {
    log(`NLM Pine ID query failed: ${e.message}`);
  }

  // 6. Fallback: Firecrawl scrape
  if (!indicatorName && !pineId) {
    log('NLM could not extract indicator. Falling back to Firecrawl...');
    const fcResult = await fallbackFirecrawl(args);
    if (fcResult.indicatorName) indicatorName = fcResult.indicatorName;
    if (fcResult.pineId) pineId = fcResult.pineId;
  }

  if (!indicatorName && !pineId) {
    console.error('❌ Could not determine indicator from video.');
    process.exit(1);
  }

  return {
    indicatorName: indicatorName || 'Unknown Indicator',
    pineId,
    notebookId,
    source: pineId ? 'nlm+url' : 'nlm+name',
  };
}

async function fallbackFirecrawl(args) {
  const result = { indicatorName: null, pineId: null };
  const fcDir = path.join(PROJECT_ROOT, '.firecrawl');
  if (!fs.existsSync(fcDir)) fs.mkdirSync(fcDir, { recursive: true });

  const outFile = path.join(fcDir, `yt-${Date.now()}.md`);

  try {
    log(`Firecrawl scraping: ${args.youtubeUrl}`);
    execSync(
      `firecrawl scrape "${args.youtubeUrl}" --only-main-content --wait-for ${args.firecrawlWait} -o "${outFile}"`,
      { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 60000 }
    );
  } catch (e) {
    log(`Firecrawl failed: ${e.message}`);
    return result;
  }

  const content = fs.readFileSync(outFile, 'utf8');

  const urlMatch = content.match(/tradingview\.com\/script\/(\w+)/i);
  if (urlMatch) result.pineId = `PUB;${urlMatch[1]}`;

  const idMatch = content.match(/(PUB;[a-f0-9]+)/i);
  if (idMatch && !result.pineId) result.pineId = idMatch[1];

  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    result.indicatorName = title
      .replace(/\s*-\s*YouTube$/i, '')
      .replace(/\|\s*TradingView Indicator Review/i, '');
  }

  return result;
}

// ─── Phase B: Search TradingView ─────────────────────────────────────

async function phaseSearchTV(extracted, args) {
  log('Phase B: Searching TradingView public scripts...');

  if (args.dryRun) {
    return {
      pineId: extracted.pineId || 'PUB;DRYRUN00000000000000000000000000',
      title: extracted.indicatorName,
      scriptName: extracted.indicatorName,
      author: { username: 'dryrun' },
    };
  }

  // If we already have a Pine ID, verify it exists
  if (extracted.pineId) {
    log(`Verifying Pine ID: ${extracted.pineId}`);
    try {
      const tv = require(TV_CJS);
      const indicator = await tv.getIndicator(extracted.pineId, 'last', process.env.SESSION || '', process.env.SIGNATURE || '');
      if (indicator) {
        const opts = indicator._options || {};
        return {
          pineId: extracted.pineId,
          title: opts.shortDescription || extracted.indicatorName,
          scriptName: opts.shortDescription || extracted.indicatorName,
          author: { username: 'verified' },
          indicator,
        };
      }
    } catch (e) {
      log(`Pine ID verification failed: ${e.message}`);
    }
  }

  // Search by name
  const searchQuery = extracted.indicatorName;
  log(`Searching: "${searchQuery}"`);

  let results = [];
  try {
    const raw = execJson(`node "${PUBLIST}" search "${searchQuery}" --limit 10 --json`, { timeout: 30000 });
    results = raw?.results || [];
  } catch (e) {
    log(`publist search failed: ${e.message}`);
  }

  if (results.length === 0) {
    console.error(`❌ No public scripts found for "${searchQuery}"`);
    process.exit(1);
  }

  // Rank results
  results.forEach(r => {
    let score = 0;
    const nameLower = searchQuery.toLowerCase();
    const titleLower = (r.title || '').toLowerCase();
    if (titleLower.includes(nameLower) || nameLower.includes(titleLower)) score += 100;
    if (r.isRecommended) score += 50;
    score += Math.min(r.agreeCount || 0, 1000) / 10;
    r._score = score;
  });
  results.sort((a, b) => b._score - a._score);

  if (args.auto || !args.interactive) {
    const top = results[0];
    log(`Auto-selected: ${top.title}`);
    return {
      pineId: `PUB;${top.scriptIdPart}`,
      title: top.title,
      scriptName: top.scriptName || top.title,
      author: top.author,
      url: top.url,
    };
  }

  console.error('\nMultiple matches found:');
  results.slice(0, 5).forEach((r, i) => {
    const rec = r.isRecommended ? ' ★' : '';
    console.error(`  ${i + 1}. ${r.title}${rec} — ${r.author?.username || 'unknown'} (${r.agreeCount} likes)`);
  });

  const selected = results[0];
  log(`Selected: ${selected.title}`);
  return {
    pineId: `PUB;${selected.scriptIdPart}`,
    title: selected.title,
    scriptName: selected.scriptName || selected.title,
    author: selected.author,
    url: selected.url,
  };
}

// ─── Phase C: Pull Pine Metadata ─────────────────────────────────────

async function phasePullMetadata(tvScript, args) {
  log('Phase C: Pulling Pine metadata...');

  if (args.dryRun) {
    return {
      pineId: tvScript.pineId,
      pineSource: '',
      pineSourceEncoded: true,
      inputs: {},
      shortDescription: tvScript.title,
      name: tvScript.title,
      scriptName: tvScript.title,
      author: tvScript.author,
    };
  }

  const session = process.env.SESSION || '';
  const signature = process.env.SIGNATURE || '';

  if (!session || !signature) {
    console.error('❌ SESSION and SIGNATURE env vars required to pull Pine metadata');
    process.exit(1);
  }

  const tv = require(TV_CJS);
  let indicator;
  try {
    indicator = await tv.getIndicator(tvScript.pineId, 'last', session, signature);
  } catch (e) {
    console.error(`❌ Failed to fetch indicator: ${e.message}`);
    process.exit(1);
  }

  const opts = indicator._options || {};
  const pineSource = opts.script || '';
  const isEncoded = pineSource.length > 0 && !pineSource.includes('//') && !pineSource.includes('@version=');

  log(`Pulled: ${Object.keys(opts.inputs || {}).length} inputs, source encoded=${isEncoded}`);

  return {
    pineId: tvScript.pineId,
    pineSource: isEncoded ? '' : pineSource,
    pineSourceEncoded: isEncoded,
    inputs: opts.inputs || indicator.inputs || {},
    shortDescription: opts.shortDescription || opts.description || tvScript.title,
    name: opts.name || tvScript.title,
    scriptName: opts.scriptName || tvScript.scriptName || tvScript.title,
    author: opts.author || tvScript.author,
  };
}

// ─── Manifest Builder ────────────────────────────────────────────────

function buildManifest(extracted, tvScript, metadata, args) {
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    youtubeUrl: args.youtubeUrl,
    source: {
      discoveryMethod: extracted.source,
      nlmNotebookId: extracted.notebookId,
    },
    indicator: {
      name: metadata.scriptName || metadata.name || tvScript.title,
      slug: slugify(metadata.scriptName || metadata.name || tvScript.title),
      pineId: metadata.pineId,
      description: metadata.shortDescription,
      author: metadata.author,
      url: tvScript.url,
    },
    pine: {
      sourceAvailable: !metadata.pineSourceEncoded,
      sourceLength: metadata.pineSource?.length || 0,
      pineVersion: metadata.pineVersion,
    },
    inputs: Object.entries(metadata.inputs || {}).reduce((acc, [tvId, def]) => {
      // Skip hidden/fake inputs
      if (def.isHidden && def.isFake && tvId === 'pineFeatures') return acc;
      acc[tvId] = {
        variable: camelCase(def.title || def.text || tvId),
        name: def.title || def.text || tvId,
        type: def.type || 'string',
        internalType: def.internalType,
        value: def.value,
        defval: def.defval,
        options: def.options,
        tooltip: def.tooltip,
        min: def.min,
        max: def.max,
      };
      return acc;
    }, {}),
    referenceSkills: [
      {
        name: 'smart-money-concepts',
        path: 'smart-money-concepts/scripts/smart-money-concepts.cjs',
        patterns: ['boxes', 'labels', 'lines', 'BOS/CHoCH/FVG/OB'],
      },
      {
        name: 'volume-gaps-imbalances-zeiierman',
        path: 'volume-gaps-imbalances-zeiierman/scripts/volume-gaps-imbalances-zeiierman.cjs',
        patterns: ['volume profile', 'delta panel', 'zero-volume gaps'],
      },
      {
        name: 'golden-rule-strategy',
        path: 'golden-rule-strategy/scripts/golden-rule-strategy.cjs',
        patterns: ['multi-timeframe', 'strategy', 'oscillator computation'],
      },
    ],
    delegation: {
      recommendedModel: 'google/gemini-2.5-pro-exp-03-25:free',
      fallbackModel: 'meta-llama/llama-4-maverick:free',
      maxIterations: 50,
      expectedOutputs: [
        '<slug>/scripts/<slug>.cjs',
        '<slug>/SKILL.md',
        '<slug>/references/indicator-behavior-analysis.md',
        '<slug>/default.json',
      ],
    },
  };

  return manifest;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.youtubeUrl) {
    console.error('❌ Error: YouTube URL required');
    printUsage();
    process.exit(1);
  }

  if (!args.dryRun) {
    console.error(`🎬 YouTube → TradingView Context Gatherer`);
    console.error(`   URL: ${args.youtubeUrl}`);
    console.error('');
  }

  // Phase A: Extract indicator identity
  const extracted = await phaseExtractIndicator(args);

  // Phase B: Search TV public scripts
  const tvScript = await phaseSearchTV(extracted, args);

  // Phase C: Pull Pine metadata
  const metadata = await phasePullMetadata(tvScript, args);

  // Build and emit manifest
  const manifest = buildManifest(extracted, tvScript, metadata, args);

  if (args.dryRun) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    // In normal mode, output JSON to stdout for piping
    console.log(JSON.stringify(manifest, null, 2));
  }

  process.exit(0);
}

main().catch(err => {
  console.error(`❌ Unexpected error: ${err.message}`);
  if (process.env.YT_TV_VERBOSE) console.error(err.stack);
  process.exit(1);
});
