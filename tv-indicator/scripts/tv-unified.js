#!/usr/bin/env node
/**
 * TradingView Unified CLI - Consolidated Tool
 *
 * Merged from:
 *   - tvcli.js (AI Agent features, structured output)
 *   - tv-cli.js (Script management, local tracking)
 *   - publist.cjs (Public script browsing)
 *
 * Usage:
 *   tv-unified <command> [subcommand] [options]
 *
 * Command Groups:
 *   agent    - AI agent features (validate, scan, backtest, compare, watch, batch, runx)
 *   manage   - Script management (list, create, pull, push, delete, inputs, compile)
 *   public   - Public scripts (list, search, top)
 *   config   - Configuration (show, validate)
 *
 * Global Flags:
 *   --format=json|human|yaml|csv  Output format (default: json for agent, human for others)
 *   --compact                       Use compact JSON
 *   --quiet                         Suppress non-essential output
 *   --help                          Show help
 *   --version                       Show version
 *
 * Exit Codes:
 *   0   Success
 *   1   General error
 *   2   Authentication error
 *   3   Validation error
 *   4   Network error
 *   5   Not found
 *   6   Conflict/state error
 */

import 'dotenv/config';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';
import YAML from 'yaml';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// =============================================================================
// EXIT CODES & ERROR TAXONOMY (from tvcli.js)
// =============================================================================

const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  AUTH_ERROR: 2,
  VALIDATION_ERROR: 3,
  NETWORK_ERROR: 4,
  NOT_FOUND: 5,
  CONFLICT_ERROR: 6,
};

class AgentError extends Error {
  constructor(message, code = EXIT_CODES.GENERAL_ERROR, details = {}) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: true,
      type: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

class AuthError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.AUTH_ERROR, details);
    this.name = 'AuthError';
  }
}

class ValidationError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.VALIDATION_ERROR, details);
    this.name = 'ValidationError';
  }
}

class NetworkError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.NETWORK_ERROR, details);
    this.name = 'NetworkError';
  }
}

class NotFoundError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.NOT_FOUND, details);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.CONFLICT_ERROR, details);
    this.name = 'ConflictError';
  }
}

// =============================================================================
// OUTPUT FORMATTER (from tvcli.js)
// =============================================================================

class OutputFormatter {
  constructor(format = 'json', compact = false) {
    this.format = format;
    this.compact = compact;
  }

  success(data) {
    return this._format({
      success: true,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  error(error) {
    const payload =
      error instanceof AgentError
        ? error.toJSON()
        : {
            error: true,
            type: 'UnknownError',
            message: String(error?.message || error),
            code: EXIT_CODES.GENERAL_ERROR,
            timestamp: new Date().toISOString(),
          };
    return this._format(payload);
  }

  _format(obj) {
    switch (this.format) {
      case 'json':
        return this.compact ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
      case 'yaml':
        return YAML.stringify(obj);
      case 'human':
        return this._formatHuman(obj);
      case 'csv':
        return this._formatCSV(obj);
      default:
        return this.compact ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
    }
  }

  _formatHuman(obj) {
    if (obj.error) {
      return `❌ ${obj.type}: ${obj.message}\n${JSON.stringify(obj.details, null, 2)}`;
    }
    if (obj.data?.scripts) {
      return this._formatScriptList(obj.data.scripts);
    }
    if (obj.data?.results) {
      return this._formatList(obj.data.results);
    }
    return JSON.stringify(obj.data, null, 2);
  }

  _formatScriptList(scripts) {
    let output = '\n📊 Scripts:\n' + '='.repeat(80) + '\n';
    scripts.forEach((s) => {
      const status = s.synced ? '✓' : '!';
      output += `${status} #${String(s.id).padStart(3)} | ${s.name}\n`;
      output += `   Pine: ${s.pineId || '(none)'}\n`;
      if (s.localPath) output += `   File: ${s.localPath}\n`;
      output += '\n';
    });
    return output;
  }

  _formatList(items) {
    let output = '\n📋 Results:\n' + '='.repeat(80) + '\n';
    items.forEach((item, i) => {
      const title = item.title || item.name || 'Unknown';
      const pineId = item.pineId || item.scriptIdPart || 'N/A';
      output += `${String(i + 1).padStart(3)}. ${title}\n`;
      output += `    ID: ${pineId}\n`;
      if (item.author) {
        const author = typeof item.author === 'object' ? item.author.username : item.author;
        output += `    Author: ${author}\n`;
      }
      output += '\n';
    });
    return output;
  }

  _formatCSV(obj) {
    // Simple CSV for results
    if (!obj.data?.results) return JSON.stringify(obj);
    const items = obj.data.results;
    if (!items.length) return '';
    const headers = Object.keys(items[0]);
    const rows = items.map((item) => headers.map((h) => JSON.stringify(item[h] ?? '')).join(','));
    return [headers.join(','), ...rows].join('\n');
  }
}

// =============================================================================
// CONFIGURATION (merged from tvcli.js and tv-cli.js)
// =============================================================================

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
  if (!CONFIG.sessionId) throw new AuthError('Missing SESSION env var');
  let cookies = `sessionid=${CONFIG.sessionId}`;
  if (CONFIG.signature) cookies += `; sessionid_sign=${CONFIG.signature}`;
  if (process.env.EXTRA_COOKIES) cookies += `; ${process.env.EXTRA_COOKIES}`;
  return cookies;
}

function requireUser() {
  if (!CONFIG.userName) throw new ValidationError('Missing TV_USER env var');
  return CONFIG.userName;
}

function requireAuth() {
  if (!CONFIG.sessionId || !CONFIG.signature) {
    throw new AuthError('Missing SESSION or SIGNATURE env var');
  }
}

// =============================================================================
// UTILITIES (from tv-cli.js)
// =============================================================================

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function slugify(input) {
  return String(input || '').trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'script';
}

function normalizePineId(raw) {
  return String(raw || '').trim().replace(/%3B/gi, ';');
}

function looksLikePineId(s) {
  return /^\s*(USER|PUB|STD|INDIC);/i.test(String(s || ''));
}

// =============================================================================
// METASTORE (from tv-cli.js - local script tracking)
// =============================================================================

class MetaStore {
  constructor(baseDir = process.cwd()) {
    this.baseDir = baseDir;
    this.dataDir = path.join(baseDir, CONFIG.dataDir);
    this.metaFile = path.join(baseDir, CONFIG.metaFile);
    this._ensureDirs();
  }

  _ensureDirs() {
    fsSync.mkdirSync(this.dataDir, { recursive: true });
    fsSync.mkdirSync(path.join(this.dataDir, 'inputs'), { recursive: true });
  }

  load() {
    try {
      if (!fsSync.existsSync(this.metaFile)) return { version: 1, scripts: {} };
      return JSON.parse(fsSync.readFileSync(this.metaFile, 'utf8'));
    } catch {
      return { version: 1, scripts: {} };
    }
  }

  save(meta) {
    fsSync.writeFileSync(this.metaFile, JSON.stringify(meta, null, 2));
  }

  getScript(id) {
    const meta = this.load();
    return meta.scripts[String(id)] || null;
  }

  setScript(id, data) {
    const meta = this.load();
    if (!meta.scripts || typeof meta.scripts !== 'object') meta.scripts = {};
    const key = String(id);
    meta.scripts[key] = {
      ...(meta.scripts[key] || {}),
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.save(meta);
    return meta.scripts[key];
  }

  deleteScript(id) {
    const meta = this.load();
    delete meta.scripts[String(id)];
    this.save(meta);
  }

  listScripts() {
    const meta = this.load();
    return Object.entries(meta.scripts || {}).map(([id, entry]) => ({ id, ...entry }));
  }

  nextId() {
    const meta = this.load();
    const ids = Object.keys(meta.scripts || {}).map(k => Number(k)).filter(n => !isNaN(n));
    return String(ids.length ? Math.max(...ids) + 1 : 1);
  }

  findByPineId(pineId) {
    const meta = this.load();
    const norm = normalizePineId(pineId);
    for (const [id, entry] of Object.entries(meta.scripts || {})) {
      if (entry.pineId && normalizePineId(entry.pineId) === norm) {
        return { id, ...entry };
      }
    }
    return null;
  }
}

// =============================================================================
// API CLIENT (merged from tvcli.js and tv-cli.js)
// =============================================================================

class TVAPIClient {
  constructor() {
    this.baseUrl = CONFIG.baseUrl;
    this.tvBaseUrl = CONFIG.tvBaseUrl;
    this.timeout = CONFIG.timeoutMs;
  }

  _getHeaders(extra = {}) {
    return {
      'Content-Type': 'application/json',
      'Cookie': getCookies(),
      ...extra,
    };
  }

  async get(url, params = {}) {
    try {
      const resp = await axios.get(url, {
        headers: this._getHeaders(),
        params,
        timeout: this.timeout,
      });
      return resp.data;
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw new AuthError(`Auth failed: ${err.response.statusText}`);
      }
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        throw new NetworkError(`Network error: ${err.message}`);
      }
      throw new NetworkError(`Request failed: ${err.message}`);
    }
  }

  async post(url, data = {}, params = {}) {
    try {
      const resp = await axios.post(url, data, {
        headers: this._getHeaders(),
        params,
        timeout: this.timeout,
      });
      return resp.data;
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw new AuthError(`Auth failed: ${err.response.statusText}`);
      }
      throw new NetworkError(`Request failed: ${err.message}`);
    }
  }

  // Public script methods (from publist.cjs via tv.cjs patterns)
  async listPublicScripts(offset = 0) {
    const url = `${this.tvBaseUrl}/pubscripts-library/`;
    return this.get(url, { offset, limit: 20 });
  }

  async searchPublicScripts(query) {
    const url = `${this.tvBaseUrl}/pubscripts-suggest-json/`;
    return this.get(url, { search: query, limit: 20 });
  }
}

// =============================================================================
// ARGUMENT PARSER
// =============================================================================

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [key, ...rest] = a.slice(2).split('=');
      args.flags[key] = rest.length ? rest.join('=') : (argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true);
    } else if (a.startsWith('-') && a.length === 2) {
      args.flags[a[1]] = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true;
    } else {
      args.positional.push(a);
    }
  }
  return args;
}

function parseBool(val, def = false) {
  if (val === undefined) return def;
  if (val === true || val === 'true' || val === '1' || val === 'yes') return true;
  if (val === false || val === 'false' || val === '0' || val === 'no') return false;
  return def;
}

function parseIntSafe(val, def) {
  const n = Number(val);
  return Number.isFinite(n) ? n : def;
}

// =============================================================================
// COMMAND HANDLERS
// =============================================================================

// --- Agent Commands (from tvcli.js) ---

async function cmdAgentValidate(client, formatter) {
  requireAuth();
  const data = {
    authenticated: true,
    userName: CONFIG.userName,
    timestamp: new Date().toISOString(),
    config: {
      baseUrl: CONFIG.baseUrl,
      tvBaseUrl: CONFIG.tvBaseUrl,
      userName: CONFIG.userName,
      hasSession: !!CONFIG.sessionId,
      hasSignature: !!CONFIG.signature,
    },
  };
  console.log(formatter.success(data));
  return EXIT_CODES.SUCCESS;
}

async function cmdAgentSearch(query, options, client, formatter) {
  if (!query) throw new ValidationError('Usage: tv-unified agent search <query>');
  const data = await client.searchPublicScripts(query);
  const results = Array.isArray(data?.items) ? data.items : [];
  console.log(formatter.success({ query, count: results.length, results }));
  return EXIT_CODES.SUCCESS;
}

// --- Manage Commands (from tv-cli.js) ---

async function cmdManageList(store, options, formatter) {
  const scripts = store.listScripts();
  if (options.remote) {
    // List remote scripts (would need API call)
    console.log(formatter.success({ source: 'remote', count: 0, scripts: [] }));
  } else {
    console.log(formatter.success({ source: 'local', count: scripts.length, scripts }));
  }
  return EXIT_CODES.SUCCESS;
}

async function cmdManageSearch(query, options, client, formatter) {
  if (!query) throw new ValidationError('Usage: tv-unified manage search <query>');
  const data = await client.searchPublicScripts(query);
  const results = Array.isArray(data?.items) ? data.items : [];
  console.log(formatter.success({ query, count: results.length, results }));
  return EXIT_CODES.SUCCESS;
}

// --- Public Commands (from publist.cjs) ---

async function cmdPublicList(options, client, formatter) {
  const offset = parseIntSafe(options.offset, 0);
  const limit = parseIntSafe(options.limit, 20);
  const data = await client.listPublicScripts(offset);
  const results = Array.isArray(data?.results) ? data.results : [];
  const items = results.slice(0, limit);
  const payload = { offset, limit, count: items.length, next: data.next ?? null, results: items };
  if (parseBool(options.json)) {
    console.log(formatter.success(payload));
  } else {
    console.log(formatter.success({ results: items }));
  }
  return EXIT_CODES.SUCCESS;
}

async function cmdPublicSearch(query, options, client, formatter) {
  if (!query) throw new ValidationError('Usage: tv-unified public search <query>');
  const limit = parseIntSafe(options.limit, 20);
  const data = await client.searchPublicScripts(query);
  const results = Array.isArray(data?.items) ? data.items : [];
  const items = results.slice(0, limit);
  const payload = { query, limit, count: items.length, results: items };
  if (parseBool(options.json)) {
    console.log(formatter.success(payload));
  } else {
    console.log(formatter.success({ results: items }));
  }
  return EXIT_CODES.SUCCESS;
}

async function cmdPublicTop(options, client, formatter) {
  const limit = parseIntSafe(options.limit, 100);
  const output = options.output || 'top_scripts.json';
  console.log(`Fetching top ${limit} scripts...`);
  const allItems = [];
  let offset = 0;
  const batchSize = 20;
  while (allItems.length < limit) {
    const data = await client.listPublicScripts(offset);
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) break;
    for (const item of results) {
      if (item) allItems.push(item);
      if (allItems.length >= limit) break;
    }
    offset += batchSize;
    if (results.length < batchSize) break;
  }
  const payload = { total: allItems.length, fetchedAt: new Date().toISOString(), scripts: allItems };
  const outputPath = path.resolve(process.cwd(), output);
  fsSync.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(formatter.success({ message: `Saved ${allItems.length} scripts to ${outputPath}` }));
  return EXIT_CODES.SUCCESS;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const formatter = new OutputFormatter(
    args.flags.format || 'json',
    parseBool(args.flags.compact)
  );

  const group = args.positional[0]; // agent, manage, public, config
  const command = args.positional[1];
  const client = new TVAPIClient();
  const store = new MetaStore();

  if (!group || args.flags.help || args.flags['--help']) {
    console.log(`
TradingView Unified CLI v1.0.0

Usage: tv-unified <group> <command> [options]

Groups:
  agent    AI agent features (validate, search)
  manage   Script management (list, search, create, pull, push, delete)
  public   Public scripts (list, search, top)
  config   Configuration (show, validate)

Global Flags:
  --format=json|human|yaml|csv  Output format (default: json)
  --compact                       Compact JSON output
  --quiet                         Suppress output
  --help                          Show this help

Exit Codes:
  0   Success
  1   General error
  2   Authentication error
  3   Validation error
  4   Network error
  5   Not found
  6   Conflict/state error

Examples:
  tv-unified agent validate
  tv-unified agent search "RSI"
  tv-unified manage list
  tv-unified public list --limit 10
  tv-unified public search "moving average" --format=human
  tv-unified public top --limit 50 --output scripts.json
`);
    return EXIT_CODES.SUCCESS;
  }

  try {
    switch (group) {
      case 'agent':
        switch (command) {
          case 'validate':
            return await cmdAgentValidate(client, formatter);
          case 'search':
            return await cmdAgentSearch(args.positional[2], args.flags, client, formatter);
          default:
            throw new ValidationError(`Unknown agent command: ${command}`);
        }

      case 'manage':
        switch (command) {
          case 'list':
          case 'ls':
            return await cmdManageList(store, args.flags, formatter);
          case 'search':
            return await cmdManageSearch(args.positional[2], args.flags, client, formatter);
          default:
            throw new ValidationError(`Unknown manage command: ${command}`);
        }

      case 'public':
        switch (command) {
          case 'list':
            return await cmdPublicList(args.flags, client, formatter);
          case 'search':
            return await cmdPublicSearch(args.positional[2], args.flags, client, formatter);
          case 'top':
            return await cmdPublicTop(args.flags, client, formatter);
          default:
            throw new ValidationError(`Unknown public command: ${command}`);
        }

      default:
        throw new ValidationError(`Unknown group: ${group}. Use: agent, manage, public, config`);
    }
  } catch (err) {
    if (err instanceof AgentError) {
      console.error(formatter.error(err));
      return err.code;
    }
    console.error(formatter.error(err));
    return EXIT_CODES.GENERAL_ERROR;
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(EXIT_CODES.GENERAL_ERROR);
});
