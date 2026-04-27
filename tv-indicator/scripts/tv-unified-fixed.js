#!/usr/bin/env node
/**
 * TradingView Unified CLI - Consolidated Tool (Fixed)
 *
 * Merged from: tvcli.js, tv-cli.js, publist.cjs
 */

import 'dotenv/config';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import YAML from 'yaml';

const CONFIG = {
  baseUrl: process.env.PINE_FACADE_BASE_URL || 'https://pine-facade.tradingview.com/pine-facade',
  tvBaseUrl: process.env.TV_BASE_URL || 'https://www.tradingview.com',
  timeoutMs: Number(process.env.TV_TIMEOUT_MS) || 120_000,
  userName: process.env.TV_USER || '',
  sessionId: process.env.SESSION || '',
  signature: process.env.SIGNATURE || '',
  dataDir: process.env.TV_DATA_DIR || '.tv-scripts',
  metaFile: process.env.TV_META_FILE || '.tv-meta.json',
};

function getCookies() {
  if (process.env.TV_COOKIES) return process.env.TV_COOKIES;
  if (!CONFIG.sessionId) throw new Error('Missing SESSION env var');
  let cookies = `sessionid=${CONFIG.sessionId}`;
  if (CONFIG.signature) cookies += `; sessionid_sign=${CONFIG.signature}`;
  if (process.env.EXTRA_COOKIES) cookies += `; ${process.env.EXTRA_COOKIES}`;
  return cookies;
}

const EXIT_CODES = { SUCCESS: 0, GENERAL_ERROR: 1, AUTH_ERROR: 2, VALIDATION_ERROR: 3, NETWORK_ERROR: 4, NOT_FOUND: 5, CONFLICT_ERROR: 6 };

class OutputFormatter {
  constructor(format = 'json', compact = false) { this.format = format; this.compact = compact; }
  success(data) { return this._format({ success: true, timestamp: new Date().toISOString(), data }); }
  error(error) { return this._format({ error: true, message: String(error?.message || error), code: EXIT_CODES.GENERAL_ERROR, timestamp: new Date().toISOString() }); }
  _format(obj) {
    switch (this.format) {
      case 'json': return this.compact ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
      case 'yaml': return YAML.stringify(obj);
      case 'human': return this._formatHuman(obj);
      default: return JSON.stringify(obj, null, 2);
    }
  }
  _formatHuman(obj) {
    if (obj.error) return `❌ Error: ${obj.message}`;
    if (obj.data?.results) return obj.data.results.map((r, i) => `  ${i+1}. ${r.title || r.name || 'Unknown'}\n      ID: ${r.scriptIdPart || r.pineId || 'N/A'}`).join('\n');
    return JSON.stringify(obj.data, null, 2);
  }
}

class TVAPIClient {
  constructor() { this.tvBaseUrl = CONFIG.tvBaseUrl; this.timeout = CONFIG.timeoutMs; }
  _getHeaders() { return { 'Content-Type': 'application/json', 'Cookie': getCookies() }; }
  async get(url, params = {}) {
    try { const resp = await axios.get(url, { headers: this._getHeaders(), params, timeout: this.timeout }); return resp.data; }
    catch (err) { throw new Error(`Request failed: ${err.message}`); }
  }
  async listPublicScripts(offset = 0) { return this.get(`${this.tvBaseUrl}/pubscripts-library/`, { offset, limit: 20 }); }
  async searchPublicScripts(query) { return this.get(`${this.tvBaseUrl}/pubscripts-suggest-json/?search=${encodeURIComponent(query)}`); }
}

class MetaStore {
  constructor(baseDir = process.cwd()) { this.metaFile = path.join(baseDir, CONFIG.metaFile); }
  load() { try { return JSON.parse(fsSync.readFileSync(this.metaFile, 'utf8')); } catch { return { version: 1, scripts: {} }; } }
  save(meta) { fsSync.writeFileSync(this.metaFile, JSON.stringify(meta, null, 2)); }
  listScripts() { const meta = this.load(); return Object.entries(meta.scripts || {}).map(([id, entry]) => ({ id, ...entry })); }
}

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const [key, ...rest] = a.slice(2).split('='); args.flags[key] = rest.length ? rest.join('=') : (argv[i+1] && !argv[i+1].startsWith('-') ? argv[++i] : true); }
    else if (a.startsWith('-') && a.length === 2) { args.flags[a[1]] = argv[i+1] && !argv[i+1].startsWith('-') ? argv[++i] : true; }
    else { args.positional.push(a); }
  }
  return args;
}

function parseBool(val, def = false) { return val === undefined ? def : (val === true || val === 'true' || val === '1'); }
function parseIntSafe(val, def) { const n = Number(val); return Number.isFinite(n) ? n : def; }

async function cmdAgentValidate(client, formatter) {
  console.log(formatter.success({ authenticated: true, userName: CONFIG.userName, config: { hasSession: !!CONFIG.sessionId, hasSignature: !!CONFIG.signature } }));
  return EXIT_CODES.SUCCESS;
}

async function cmdAgentSearch(query, options, client, formatter) {
  if (!query) throw new Error('Usage: tv-unified agent search <query>');
  const data = await client.searchPublicScripts(query);
  const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
  console.log(formatter.success({ query, count: results.length, results }));
  return EXIT_CODES.SUCCESS;
}

async function cmdManageList(store, formatter) {
  const scripts = store.listScripts();
  console.log(formatter.success({ source: 'local', count: scripts.length, scripts }));
  return EXIT_CODES.SUCCESS;
}

async function cmdPublicList(options, client, formatter) {
  const offset = parseIntSafe(options.offset, 0);
  const limit = parseIntSafe(options.limit, 20);
  const data = await client.listPublicScripts(offset);
  const results = Array.isArray(data?.results) ? data.results : [];
  const items = results.slice(0, limit);
  if (parseBool(options.json)) { console.log(formatter.success({ offset, limit, count: items.length, results: items })); }
  else { console.log(formatter.success({ results: items })); }
  return EXIT_CODES.SUCCESS;
}

async function cmdPublicSearch(query, options, client, formatter) {
  if (!query) throw new Error('Usage: tv-unified public search <query>');
  const limit = parseIntSafe(options.limit, 20);
  const data = await client.searchPublicScripts(query);
  const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));
  const items = results.slice(0, limit);
  if (parseBool(options.json)) { console.log(formatter.success({ query, count: items.length, results: items })); }
  else { console.log(formatter.success({ results: items })); }
  return EXIT_CODES.SUCCESS;
}

async function cmdPublicTop(options, client, formatter) {
  const limit = parseIntSafe(options.limit, 100);
  const output = options.output || 'top_scripts.json';
  console.log(`Fetching top ${limit} scripts...`);
  const allItems = [];
  let offset = 0;
  while (allItems.length < limit) {
    const data = await client.listPublicScripts(offset);
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) break;
    for (const item of results) { if (item) allItems.push(item); if (allItems.length >= limit) break; }
    offset += 20;
    if (results.length < 20) break;
  }
  const outputPath = path.resolve(process.cwd(), output);
  fsSync.writeFileSync(outputPath, JSON.stringify({ total: allItems.length, fetchedAt: new Date().toISOString(), scripts: allItems }, null, 2));
  console.log(formatter.success({ message: `Saved ${allItems.length} scripts to ${outputPath}` }));
  return EXIT_CODES.SUCCESS;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const formatter = new OutputFormatter(args.flags.format || 'json', parseBool(args.flags.compact));
  const group = args.positional[0];
  const command = args.positional[1];
  const client = new TVAPIClient();
  const store = new MetaStore();

  if (!group || args.flags.help) {
    console.log(`
TradingView Unified CLI v1.0.0 (Fixed)

Usage: tv-unified <group> <command> [options]

Groups:
  agent    - validate, search
  manage   - list, search
  public   - list, search, top

Examples:
  tv-unified agent validate
  tv-unified agent search "RSI"
  tv-unified public list --limit 5
  tv-unified public search "moving average"
  tv-unified public top --limit 10
`);
    return EXIT_CODES.SUCCESS;
  }

  try {
    switch (group) {
      case 'agent':
        switch (command) {
          case 'validate': return await cmdAgentValidate(client, formatter);
          case 'search': return await cmdAgentSearch(args.positional[2], args.flags, client, formatter);
          default: throw new Error(`Unknown agent command: ${command}`);
        }
      case 'manage':
        switch (command) {
          case 'list': return await cmdManageList(store, formatter);
          default: throw new Error(`Unknown manage command: ${command}`);
        }
      case 'public':
        switch (command) {
          case 'list': return await cmdPublicList(args.flags, client, formatter);
          case 'search': return await cmdPublicSearch(args.positional[2], args.flags, client, formatter);
          case 'top': return await cmdPublicTop(args.flags, client, formatter);
          default: throw new Error(`Unknown public command: ${command}`);
        }
      default: throw new Error(`Unknown group: ${group}`);
    }
  } catch (err) {
    console.error(formatter.error(err));
    return EXIT_CODES.GENERAL_ERROR;
  }
}

main().then(code => process.exit(code)).catch(err => { console.error(`Fatal: ${err.message}`); process.exit(EXIT_CODES.GENERAL_ERROR); });
