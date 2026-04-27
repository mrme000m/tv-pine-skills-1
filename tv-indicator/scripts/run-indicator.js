#!/usr/bin/env node
/**
 * TradingView Indicator Runner - Using only Node.js built-in modules.
 *
 * Fetches indicator metadata from TradingView's pine-facade API via HTTPS.
 * For full WebSocket-based execution, the @mathieuc/tradingview package is required.
 *
 * Usage:
 *   SESSION=xxx SIGNATURE=xxx TV_USER=xxx node run-indicator.js [pineId] [symbol] [timeframe] [outputDir]
 *
 * Example:
 *   SESSION=lzxym0ep28z98y0iht671rk69ztjli7b SIGNATURE=v3:AnxtGxDtuB5mIzTveqW7R+0ScwKy7PEbziWLjeTof7s= TV_USER=rmuammar1123 \
 *     node run-indicator.js "USER;3f4483bd813545908ab6e1a6fe9636d5" OANDA:XAUUSD 15 /path/to/output
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Configuration from environment and args
// =============================================================================

const SESSION = process.env.SESSION || '';
const SIGNATURE = process.env.SIGNATURE || '';
const TV_USER = process.env.TV_USER || '';

const PINE_ID = process.argv[2] || 'USER;3f4483bd813545908ab6e1a6fe9636d5';
const SYMBOL = process.argv[3] || 'OANDA:XAUUSD';
const TIMEFRAME = process.argv[4] || '15';
const OUTPUT_DIR = process.argv[5] || '';

// =============================================================================
// HTTP utilities using only Node.js built-in https
// =============================================================================

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function httpPost(url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// =============================================================================
// TradingView API Client
// =============================================================================

class TVAPI {
  constructor() {
    this.baseHeaders = {
      'Cookie': `sessionid=${SESSION}; sessionid_sign=${SIGNATURE}`,
      'Origin': 'https://www.tradingview.com',
      'Referer': 'https://www.tradingview.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
    };
  }

  async fetchIndicator(pineId) {
    const encoded = encodeURIComponent(pineId);

    // Try /translate/ endpoint first
    try {
      const res = await httpGet(
        `https://pine-facade.tradingview.com/pine-facade/translate/${encoded}/last`,
        this.baseHeaders
      );
      if (res.status === 200 && res.data) {
        try {
          const parsed = JSON.parse(res.data);
          if (parsed.source || parsed.metaInfo || parsed.result) return parsed;
        } catch {}
      }
    } catch (e) {}

    // Try /get/ endpoint
    try {
      const res = await httpGet(
        `https://pine-facade.tradingview.com/pine-facade/get/${encoded}/last`,
        this.baseHeaders
      );
      if (res.status === 200 && res.data) {
        try {
          const parsed = JSON.parse(res.data);
          if (parsed.source || parsed.metaInfo || parsed.result) return parsed;
        } catch {}
      }
    } catch (e) {}

    // Try /versions/ to get version list
    try {
      const res = await httpGet(
        `https://pine-facade.tradingview.com/pine-facade/versions/${encoded}`,
        this.baseHeaders
      );
      if (res.status === 200 && res.data) {
        try {
          const parsed = JSON.parse(res.data);
          // If we have versions, try the first one
          const versions = Array.isArray(parsed) ? parsed :
            (Array.isArray(parsed.versions) ? parsed.versions :
             (Array.isArray(parsed.result?.versions) ? parsed.result.versions : []));
          if (versions.length > 0) {
            const version = typeof versions[0] === 'string' ? versions[0] :
              (versions[0].version || versions[0].result?.version || '1');
            const res2 = await httpGet(
              `https://pine-facade.tradingview.com/pine-facade/translate/${encoded}/${version}`,
              this.baseHeaders
            );
            if (res2.status === 200 && res2.data) {
              try { return JSON.parse(res2.data); } catch {}
            }
          }
        } catch {}
      }
    } catch (e) {}

    return null;
  }

  async searchPublicScripts(query) {
    try {
      const res = await httpGet(
        `https://www.tradingview.com/pubscripts-suggest-json/?search=${encodeURIComponent(query)}`,
        this.baseHeaders
      );
      if (res.status === 200 && res.data) {
        try { return JSON.parse(res.data); } catch { return null; }
      }
    } catch (e) {}
    return null;
  }

  async listSavedScripts() {
    try {
      const res = await httpGet(
        `https://pine-facade.tradingview.com/pine-facade/list?filter=saved`,
        this.baseHeaders
      );
      if (res.status === 200 && res.data) {
        try { return JSON.parse(res.data); } catch { return null; }
      }
    } catch (e) {}
    return null;
  }

  async getScriptInfo(scriptIdPart) {
    // Search for the specific script by its ID part
    try {
      const res = await httpGet(
        `https://www.tradingview.com/pubscripts-suggest-json/?search=${encodeURIComponent(scriptIdPart)}`,
        this.baseHeaders
      );
      if (res.status === 200 && res.data) {
        try {
          const parsed = JSON.parse(res.data);
          if (parsed.items && Array.isArray(parsed.items)) {
            return parsed.items.find(item =>
              item.scriptIdPart === scriptIdPart ||
              item.scriptIdPart === `USER;${scriptIdPart}`
            );
          }
        } catch {}
      }
    } catch (e) {}
    return null;
  }
}

// =============================================================================
// Source parser - extract inputs from Pine Script source
// =============================================================================

function parseInputsFromSource(source) {
  if (!source) return [];
  const inputs = [];
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    // Match input declarations like: myVar = input.int(14, "Length", minval=1)
    const match = line.match(/^\s*(?:\w+\s+)?(\w+)\s*=\s*input(?:\.(\w+))?\s*\((.*)\)\s*$/);
    if (match) {
      const varName = match[1];
      const inputType = match[2] || 'source'; // default type
      const argsStr = match[3];
      inputs.push({
        variable: varName,
        type: inputType,
        rawArgs: argsStr,
      });
    }
  }

  return inputs;
}

function parsePlotsFromSource(source) {
  if (!source) return [];
  const plots = [];
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    // Match plot declarations
    const match = line.match(/^\s*plot\s*\(/);
    if (match) {
      // Extract the plot title if present
      const titleMatch = line.match(/title\s*=\s*["']([^"']+)["']/);
      plots.push({
        title: titleMatch ? titleMatch[1] : 'unnamed',
        raw: line.trim(),
      });
    }
  }

  return plots;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const pineId = PINE_ID;
  const symbol = SYMBOL;
  const timeframe = TIMEFRAME;
  const outputDir = OUTPUT_DIR;

  console.log('='.repeat(60));
  console.log('TradingView Indicator Runner');
  console.log('='.repeat(60));
  console.log(`Indicator: ${pineId}`);
  console.log(`Symbol:    ${symbol}`);
  console.log(`Timeframe: ${timeframe}`);
  console.log(`User:      ${TV_USER || '(not set)'}`);
  console.log(`Session:   ${SESSION ? SESSION.slice(0, 8) + '...' : '(not set)'}`);
  console.log('='.repeat(60));
  console.log();

  if (!SESSION) {
    console.error('ERROR: SESSION environment variable is required.');
    console.error('Set it with: export SESSION=your_session_cookie');
    process.exit(1);
  }

  const api = new TVAPI();

  // ---------------------------------------------------------------------------
  // Step 1: Fetch indicator metadata
  // ---------------------------------------------------------------------------
  console.log('Step 1: Fetching indicator metadata from pine-facade...');
  const indicMeta = await api.fetchIndicator(pineId);

  if (!indicMeta) {
    console.error('ERROR: Could not fetch indicator metadata.');
    console.error('This may mean:');
    console.error('  - The pineId is incorrect or the script is private/inaccessible');
    console.error('  - The SESSION/SIGNATURE credentials are invalid or expired');
    process.exit(1);
  }

  console.log('  Metadata fetched successfully.');
  console.log();

  // ---------------------------------------------------------------------------
  // Step 2: Extract indicator details
  // ---------------------------------------------------------------------------
  const metaInfo = indicMeta.metaInfo || indicMeta.result?.metaInfo || {};
  const scriptName = metaInfo.name || metaInfo.scriptName || indicMeta.scriptName || 'Unknown';
  const scriptDescription = metaInfo.description || '';
  const scriptVersion = metaInfo.version || indicMeta.version || 'unknown';
  const scriptType = metaInfo.scriptType || metaInfo.type || 'unknown';

  console.log('Step 2: Indicator Details');
  console.log('  Name:', scriptName);
  console.log('  Version:', scriptVersion);
  console.log('  Type:', scriptType);
  if (scriptDescription) console.log('  Description:', scriptDescription.slice(0, 200));
  console.log();

  // ---------------------------------------------------------------------------
  // Step 3: Parse inputs
  // ---------------------------------------------------------------------------
  const source = indicMeta.source || indicMeta.result?.scriptSource || '';
  const parsedInputs = metaInfo.inputs || [];
  const parsedPlots = metaInfo.plots || [];

  console.log('Step 3: Inputs');
  if (parsedInputs.length > 0) {
    for (const inp of parsedInputs) {
      const def = inp.defval !== undefined ? ` (default: ${JSON.stringify(inp.defval)})` : '';
      console.log(`  - ${inp.id || inp.name}: ${inp.name || inp.id}${def}`);
    }
  } else if (source) {
    const sourceInputs = parseInputsFromSource(source);
    for (const inp of sourceInputs) {
      console.log(`  - ${inp.variable}: ${inp.type}`);
    }
  } else {
    console.log('  (none detected)');
  }
  console.log();

  // ---------------------------------------------------------------------------
  // Step 4: Parse plots
  // ---------------------------------------------------------------------------
  console.log('Step 4: Plots');
  if (parsedPlots.length > 0) {
    for (const plot of parsedPlots) {
      console.log(`  - ${plot.id}: ${plot.type}`);
    }
  } else if (source) {
    const sourcePlots = parsePlotsFromSource(source);
    for (const plot of sourcePlots) {
      console.log(`  - ${plot.title}`);
    }
  } else {
    console.log('  (none detected)');
  }
  console.log();

  // ---------------------------------------------------------------------------
  // Step 5: Try to get public script info
  // ---------------------------------------------------------------------------
  console.log('Step 5: Searching public script info...');
  const scriptIdPart = pineId.split(';')[1] || pineId;
  const publicInfo = await api.getScriptInfo(scriptIdPart);

  if (publicInfo) {
    console.log('  Public info found:');
    console.log(`    Title: ${publicInfo.title || 'N/A'}`);
    console.log(`    Author: ${publicInfo.author?.username || 'N/A'}`);
    console.log(`    Type: ${publicInfo.type || 'N/A'}`);
    console.log(`    Access: ${publicInfo.access || 'N/A'}`);
    console.log(`    Agrees: ${publicInfo.agreeCount || 0}`);
    console.log(`    Version: ${publicInfo.version || 'N/A'}`);
  } else {
    console.log('  No public info found (script may be private).');
  }
  console.log();

  // ---------------------------------------------------------------------------
  // Step 6: Build result object
  // ---------------------------------------------------------------------------
  const result = {
    success: true,
    timestamp: new Date().toISOString(),
    request: {
      pineId,
      symbol,
      timeframe,
    },
    indicator: {
      name: scriptName,
      description: scriptDescription,
      version: scriptVersion,
      type: scriptType,
      pineId,
    },
    metadata: {
      inputs: parsedInputs.map(inp => ({
        id: inp.id || inp.name,
        name: inp.name,
        type: inp.type,
        defval: inp.defval,
        minval: inp.minval,
        maxval: inp.maxval,
        options: inp.options,
      })),
      plots: parsedPlots.map(p => ({
        id: p.id,
        type: p.type,
      })),
      styles: metaInfo.styles || {},
    },
    publicInfo: publicInfo ? {
      title: publicInfo.title,
      author: publicInfo.author?.username,
      scriptIdPart: publicInfo.scriptIdPart,
      type: publicInfo.type,
      access: publicInfo.access,
      agreeCount: publicInfo.agreeCount,
      version: publicInfo.version,
      imageUrl: publicInfo.imageUrl,
      url: publicInfo.url,
    } : null,
    note: 'This output contains indicator metadata fetched via TradingView REST API. Full execution with live chart data requires the @mathieuc/tradingview WebSocket client package.',
  };

  const jsonOutput = JSON.stringify(result, null, 2);

  console.log('Step 6: Result');
  console.log('-'.repeat(60));
  console.log(jsonOutput);
  console.log('-'.repeat(60));
  console.log();

  // ---------------------------------------------------------------------------
  // Step 7: Save outputs
  // ---------------------------------------------------------------------------
  if (outputDir) {
    console.log('Step 7: Saving outputs...');

    // Ensure directory exists
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`  Directory ensured: ${outputDir}`);
    } catch (e) {
      console.error(`  ERROR creating directory: ${e.message}`);
    }

    const resultPath = path.join(outputDir, 'result.txt');
    const summaryPath = path.join(outputDir, 'summary.txt');

    // Save full JSON result
    try {
      fs.writeFileSync(resultPath, jsonOutput, 'utf8');
      console.log(`  Saved: ${resultPath}`);
    } catch (e) {
      console.error(`  ERROR saving result: ${e.message}`);
    }

    // Save human-readable summary
    const summary = `Hermes Consensus Engine Indicator Run Summary
==============================================
Generated: ${result.timestamp}

Request Parameters:
  Indicator ID: ${pineId}
  Symbol:       ${symbol}
  Timeframe:    ${timeframe}
  User:         ${TV_USER || 'N/A'}

Indicator Details:
  Name:        ${scriptName}
  Version:     ${scriptVersion}
  Type:        ${scriptType}
  Description: ${scriptDescription || 'N/A'}

Inputs (${parsedInputs.length}):
${parsedInputs.map(inp => {
  const def = inp.defval !== undefined ? ` = ${JSON.stringify(inp.defval)}` : '';
  const range = (inp.minval !== undefined || inp.maxval !== undefined)
    ? ` [${inp.minval ?? '-inf'}, ${inp.maxval ?? '+inf'}]` : '';
  return `  - ${inp.id || inp.name}: ${inp.name || inp.id}${def}${range}`;
}).join('\n') || '  (none)'}

Plots (${parsedPlots.length}):
${parsedPlots.map(p => `  - ${p.id}: ${p.type}`).join('\n') || '  (none)'}

Public Info:
${publicInfo ? `
  Title:      ${publicInfo.title || 'N/A'}
  Author:     ${publicInfo.author?.username || 'N/A'}
  Script ID:  ${publicInfo.scriptIdPart || 'N/A'}
  Type:       ${publicInfo.type || 'N/A'}
  Access:     ${publicInfo.access || 'N/A'}
  Agrees:     ${publicInfo.agreeCount || 0}
  Version:    ${publicInfo.version || 'N/A'}
` : '  No public info available (script may be private)'}

Status: Metadata fetched successfully.

Note: Full indicator execution with live chart data requires the
@mathieuc/tradingview WebSocket client package. Install it with:
  npm install @mathieuc/tradingview

Then use tv-cli.js or tvcli.js to run the indicator with live data:
  node tvcli.js run "${pineId}" ${symbol} --tf ${timeframe} --json
`;

    try {
      fs.writeFileSync(summaryPath, summary, 'utf8');
      console.log(`  Saved: ${summaryPath}`);
    } catch (e) {
      console.error(`  ERROR saving summary: ${e.message}`);
    }

    console.log();
    console.log('Output files saved successfully.');
  } else {
    console.log('Step 7: No output directory specified. Skipping file save.');
    console.log('  To save outputs, provide an output directory as the 5th argument.');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Done.');
  console.log('='.repeat(60));

  return result;
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
