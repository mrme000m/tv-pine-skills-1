#!/usr/bin/env node
/**
 * TradingView AI Agent CLI - Market Data Analysis Tool
 *
 * Design Principles:
 * 1. ZERO interactive prompts - all inputs via flags/args
 * 2. Structured JSON output by default (--human for readable)
 * 3. Exit codes + error taxonomy for programmatic handling
 * 4. Idempotent operations where possible
 * 5. Built-in analysis primitives (backtest, scan, compare)
 * 6. Session validation and health checks
 * 7. Concurrent operation safety
 *
 * Agent-First Commands:
 *   validate              Check auth & connectivity
 *   scan <query>          Multi-timeframe market screening
 *   backtest <id>         Run historical analysis
 *   compare <id1> <id2>   Compare indicator performance
 *   watch <id>            Stream live updates (WebSocket)
 *   batch <commands.json> Execute multiple operations
 *
 * Core Operations:
 *   list [--remote] [--format json|table]
 *   search <query> [--json] [--limit N]
 *   create <file> --name <name> [--wait]
 *   pull <pineId> [--out file.pine] [--force]
 *   push <file> [--create-if-missing] [--sync]
 *   run <id|file> <symbol> [--tf 5m] [--json]
 *   runx <id> --symbol <sym> [--timeframes 5m,15m,1h] [--variants file.json] [--inputs key=val]
 *   delete <id> [--confirm]
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

import "dotenv/config";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import FormData from "form-data";
import YAML from "yaml";
import { createRequire } from "module";
import EventEmitter from "events";

const require = createRequire(import.meta.url);

// =============================================================================
// EXIT CODES & ERROR TAXONOMY
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
    this.name = "AgentError";
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
    this.name = "AuthError";
  }
}

class ValidationError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.VALIDATION_ERROR, details);
    this.name = "ValidationError";
  }
}

class NetworkError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.NETWORK_ERROR, details);
    this.name = "NetworkError";
  }
}

class NotFoundError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.NOT_FOUND, details);
    this.name = "NotFoundError";
  }
}

class ConflictError extends AgentError {
  constructor(message, details = {}) {
    super(message, EXIT_CODES.CONFLICT_ERROR, details);
    this.name = "ConflictError";
  }
}

// =============================================================================
// OUTPUT FORMATTER - Structured by default
// =============================================================================

class OutputFormatter {
  constructor(format = "json", compact = false) {
    this.format = format; // json | human | csv | yaml
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
            type: "UnknownError",
            message: String(error?.message || error),
            code: EXIT_CODES.GENERAL_ERROR,
            timestamp: new Date().toISOString(),
          };
    return this._format(payload);
  }

  _format(obj) {
    switch (this.format) {
      case "json":
        return this.compact 
          ? JSON.stringify(obj) 
          : JSON.stringify(obj, null, 2);

      case "yaml":
        return YAML.stringify(obj);

      case "human":
        return this._formatHuman(obj);

      case "csv":
        return this._formatCSV(obj);

      default:
        return this.compact 
          ? JSON.stringify(obj) 
          : JSON.stringify(obj, null, 2);
    }
  }

  _formatHuman(obj) {
    if (obj.error) {
      return `❌ ${obj.type}: ${obj.message}\n${JSON.stringify(obj.details, null, 2)}`;
    }

    // Custom formatters per data type
    if (obj.data?.scripts) {
      return this._formatScriptList(obj.data.scripts);
    }

    if (obj.data?.analysis) {
      return this._formatAnalysis(obj.data.analysis);
    }

    if (obj.data?.matrix && obj.data?.summary) {
      return this._formatRunX(obj.data);
    }

    return JSON.stringify(obj.data, null, 2);
  }

  _formatRunX(data) {
    const { matrix, summary } = data;
    let output = "\n🧪 Extended Run Results:\n" + "=".repeat(80) + "\n";
    output += `Pine ID: ${summary.pineId}\n`;
    output += `Variants: ${summary.totalVariants} (OK: ${summary.ok}, Failed: ${summary.failed})\n`;
    output += `Consensus: ${summary.consensus} | Buy: ${summary.buyCount} | Sell: ${summary.sellCount}\n`;
    output += `Score — Avg: ${summary.avgScore ?? "N/A"} | Best: ${summary.bestScore ?? "N/A"} | Worst: ${summary.worstScore ?? "N/A"}\n`;

    if (summary.failures.length > 0) {
      output += `\n❌ Failures:\n`;
      for (const f of summary.failures) {
        output += `  - ${f.symbol} @ ${f.timeframe} | inputs: ${JSON.stringify(f.inputOverrides)}\n`;
        for (const e of f.errors) {
          output += `    → ${e.type}: ${e.error}\n`;
        }
      }
    }

    output += "\n" + "─".repeat(80) + "\n";
    const hdr = [
      "Variant".padEnd(10),
      "Sym".padEnd(20),
      "TF".padEnd(6),
      "Bars".padEnd(6),
      "Score".padEnd(8),
      "Grade".padEnd(7),
      "Signal".padEnd(8),
      "Net Profit".padEnd(14),
      "WinRate".padEnd(10),
      "Trades",
    ].join("");
    output += hdr + "\n";
    output += "─".repeat(80) + "\n";

    for (let i = 0; i < matrix.length; i++) {
      const r = matrix[i];
      const sig = r.signal?.action || "N/A";
      const score = r.quality ? `${r.quality.score}/100` : "N/A";
      const grade = r.quality ? r.quality.grade : "-";
      const np = r.performance?.netProfit ?? "N/A";
      const wr = r.performance?.winRate != null ? `${r.performance.winRate}%` : "N/A";
      const tr = r.performance?.totalTrades ?? 0;
      const row = [
        String(i + 1).padEnd(10),
        (r.symbol || "").padEnd(20),
        (r.timeframe || "").padEnd(6),
        String(r.periodCount).padEnd(6),
        score.padEnd(8),
        grade.padEnd(7),
        sig.padEnd(8),
        String(np).padEnd(14),
        wr.padEnd(10),
        String(tr),
      ].join("");
      output += row + "\n";
    }

    if (summary.failures.length > 0) {
      output += "\n❌ Failed variants omitted from table above.\n";
    }

    return output;
  }

  _formatScriptList(scripts) {
    let output = "\n📊 Scripts:\n" + "=".repeat(80) + "\n";
    scripts.forEach((s) => {
      const status = s.synced ? "✓" : "!";
      output += `${status} #${String(s.id).padStart(3)} | ${s.name}\n`;
      output += `   Pine: ${s.pineId || "(none)"}\n`;
      if (s.localPath) output += `   File: ${s.localPath}\n`;
      output += "\n";
    });
    return output;
  }

  _formatAnalysis(analysis) {
    let output = "\n📈 Analysis Results:\n" + "=".repeat(80) + "\n";
    output += `Symbol: ${analysis.symbol} @ ${analysis.timeframe}\n`;
    output += `Period: ${analysis.periodCount} bars\n\n`;

    if (analysis.signal) {
      output += `🎯 Signal: ${analysis.signal.action} (${analysis.signal.confidence}%)\n`;
      output += `   Trend: ${analysis.signal.trend}\n`;
      output += `   Entry: ${analysis.signal.entry || "N/A"}\n`;
      output += `   SL: ${analysis.signal.sl || "N/A"} | TP: ${analysis.signal.tp || "N/A"}\n\n`;
    }

    if (analysis.performance) {
      const p = analysis.performance;
      output += "📊 Performance:\n";
      output += `   Net Profit: ${p.netProfit || "N/A"}\n`;
      output += `   Win Rate: ${p.winRate || "N/A"}%\n`;
      output += `   Profit Factor: ${p.profitFactor || "N/A"}\n`;
      output += `   Total Trades: ${p.totalTrades || 0}\n`;
    }

    return output;
  }

  _formatCSV(obj) {
    // Flatten object for CSV
    const flatten = (o, prefix = "") => {
      return Object.keys(o).reduce((acc, k) => {
        const pre = prefix.length ? `${prefix}.` : "";
        if (typeof o[k] === "object" && o[k] !== null && !Array.isArray(o[k])) {
          Object.assign(acc, flatten(o[k], pre + k));
        } else {
          acc[pre + k] = o[k];
        }
        return acc;
      }, {});
    };

    const flat = flatten(obj);
    const headers = Object.keys(flat).join(",");
    const values = Object.values(flat)
      .map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : v))
      .join(",");

    return `${headers}\n${values}`;
  }
}

// =============================================================================
// CONFIGURATION with Validation
// =============================================================================

class Config {
  constructor() {
    this.baseUrl =
      process.env.PINE_FACADE_BASE_URL ||
      "https://pine-facade.tradingview.com/pine-facade";
    this.tvBaseUrl = process.env.TV_BASE_URL || "https://www.tradingview.com";
    this.timeoutMs = Number(process.env.TV_TIMEOUT_MS) || 120000;
    this.userName = process.env.TV_USER || "";
    this.sessionId = process.env.SESSION || "";
    this.signature = process.env.SIGNATURE || "";
    this.dataDir = process.env.TV_DATA_DIR || ".tv-scripts";
    this.metaFile = process.env.TV_META_FILE || ".tv-meta.json";
    this.lockTimeout = Number(process.env.TV_LOCK_TIMEOUT) || 5000;
    this.maxRetries = Number(process.env.TV_MAX_RETRIES) || 3;
  }

  validate(operation = "read") {
    const errors = [];

    if (!this.sessionId && operation !== "search") {
      errors.push("Missing SESSION environment variable");
    }

    if (["write", "create", "push", "delete"].includes(operation)) {
      if (!this.userName) {
        errors.push(
          "Missing TV_USER environment variable (required for write operations)",
        );
      }
    }

    if (errors.length > 0) {
      throw new ValidationError("Configuration validation failed", { errors });
    }
  }

  getCookies() {
    if (process.env.TV_COOKIES) return process.env.TV_COOKIES;
    if (!this.sessionId) throw new AuthError("Missing SESSION");

    let cookies = `sessionid=${this.sessionId}`;
    if (this.signature) cookies += `; sessionid_sign=${this.signature}`;
    if (process.env.EXTRA_COOKIES) cookies += `; ${process.env.EXTRA_COOKIES}`;

    return cookies;
  }
}

// =============================================================================
// ATOMIC FILE OPERATIONS with Locking
// =============================================================================

class FileStore {
  constructor(baseDir = process.cwd(), config) {
    this.baseDir = baseDir;
    this.config = config;
    this.dataDir = path.join(baseDir, config.dataDir);
    this.metaFile = path.join(baseDir, config.metaFile);
    this.lockFile = this.metaFile + ".lock";
    this._locks = new Map();
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(path.join(this.dataDir, "inputs"), { recursive: true });
  }

  async withLock(fn) {
    const lockId = crypto.randomBytes(8).toString("hex");
    const maxWait = this.config.lockTimeout;
    const startTime = Date.now();

    // Spin wait for lock
    while (true) {
      try {
        await fs.writeFile(this.lockFile, lockId, { flag: "wx" });
        break;
      } catch (err) {
        if (err.code !== "EEXIST") throw err;

        if (Date.now() - startTime > maxWait) {
          // Force unlock if stale
          await fs.unlink(this.lockFile).catch(() => {});
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    try {
      return await fn();
    } finally {
      await fs.unlink(this.lockFile).catch(() => {});
    }
  }

  async load() {
    try {
      const content = await fs.readFile(this.metaFile, "utf8");
      return JSON.parse(content);
    } catch (err) {
      if (err.code === "ENOENT") {
        return { version: 1, scripts: {} };
      }
      throw err;
    }
  }

  async save(meta) {
    const temp = this.metaFile + ".tmp";
    await fs.writeFile(temp, JSON.stringify(meta, null, 2));
    await fs.rename(temp, this.metaFile);
  }

  async transaction(fn) {
    return this.withLock(async () => {
      const meta = await this.load();
      const result = await fn(meta);
      await this.save(meta);
      return result;
    });
  }

  async getScript(id) {
    const meta = await this.load();
    return meta.scripts[String(id)] || null;
  }

  async setScript(id, data) {
    return this.transaction(async (meta) => {
      if (!meta.scripts) meta.scripts = {};
      const key = String(id);
      meta.scripts[key] = {
        ...(meta.scripts[key] || {}),
        ...data,
        updatedAt: new Date().toISOString(),
      };
      return meta.scripts[key];
    });
  }

  async deleteScript(id) {
    return this.transaction(async (meta) => {
      delete meta.scripts[String(id)];
    });
  }

  async listScripts() {
    const meta = await this.load();
    return Object.entries(meta.scripts || {}).map(([id, entry]) => ({
      id,
      ...entry,
    }));
  }

  async nextId() {
    const meta = await this.load();
    const ids = Object.keys(meta.scripts || {})
      .map((k) => Number(k))
      .filter((n) => !isNaN(n));
    return String(ids.length ? Math.max(...ids) + 1 : 1);
  }

  async findByPineId(pineId) {
    const meta = await this.load();
    const norm = normalizePineId(pineId);
    for (const [id, entry] of Object.entries(meta.scripts || {})) {
      if (entry.pineId && normalizePineId(entry.pineId) === norm) {
        return { id, ...entry };
      }
    }
    return null;
  }

  async findByLocalPath(filePath) {
    const meta = await this.load();
    const abs = path.resolve(this.baseDir, filePath);
    for (const [id, entry] of Object.entries(meta.scripts || {})) {
      if (entry.localPath) {
        const entryAbs = path.resolve(this.baseDir, entry.localPath);
        if (entryAbs === abs) return { id, ...entry };
      }
    }
    return null;
  }
}

// =============================================================================
// PINE CLIENT with Retry & Circuit Breaker
// =============================================================================

class PineClient {
  constructor(config) {
    this.config = config;
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      validateStatus: () => true,
    });
    this.failureCount = 0;
    this.circuitOpen = false;
  }

  _baseHeaders() {
    return {
      Cookie: this.config.getCookies(),
      Origin: this.config.tvBaseUrl,
      Referer: this.config.tvBaseUrl + "/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  async _withRetry(fn, operation = "operation") {
    if (this.circuitOpen) {
      throw new NetworkError("Circuit breaker open - service unavailable", {
        operation,
        failureCount: this.failureCount,
      });
    }

    let lastError;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const result = await fn();
        this.failureCount = 0; // Reset on success
        return result;
      } catch (err) {
        lastError = err;

        // Don't retry auth errors
        if (err instanceof AuthError) throw err;
        if (err instanceof ValidationError) throw err;

        // Exponential backoff
        if (attempt < this.config.maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    this.failureCount++;
    if (this.failureCount >= 5) {
      this.circuitOpen = true;
      setTimeout(() => {
        this.circuitOpen = false;
        this.failureCount = 0;
      }, 60000); // Reset after 1min
    }

    throw new NetworkError(
      `Operation failed after ${this.config.maxRetries} attempts`,
      {
        operation,
        lastError: lastError?.message,
      },
    );
  }

  async validate() {
    return this._withRetry(async () => {
      const headers = this._baseHeaders();
      const res = await this.http.get("/list?filter=saved", { headers });

      if (res.status === 401 || res.status === 403) {
        throw new AuthError("Invalid credentials", {
          status: res.status,
          hint: "Check SESSION and SIGNATURE environment variables",
        });
      }

      if (res.status !== 200) {
        throw new NetworkError("Validation failed", { status: res.status });
      }

      return {
        authenticated: true,
        userName: this.config.userName,
        timestamp: new Date().toISOString(),
      };
    }, "validate");
  }

  async get(pineId, version = null) {
    return this._withRetry(async () => {
      const headers = this._baseHeaders();
      let resolvedVersion = version != null ? String(version) : null;

      if (!resolvedVersion || resolvedVersion === "-1") {
        const latest = await this._resolveLatestVersion(pineId);
        if (latest) resolvedVersion = latest;
      }

      const targetVersion = resolvedVersion || "last";

      if (resolvedVersion) {
        const res = await this._tryGetVersion(pineId, resolvedVersion, headers);
        if (res) return res;
      }

      const url = `/translate/${encodeURIComponent(pineId)}/${encodeURIComponent(targetVersion)}`;
      const res = await this.http.get(url, { headers });

      if (res.status === 404) {
        throw new NotFoundError(`Script not found: ${pineId}`, {
          pineId,
          version: targetVersion,
        });
      }

      if (res.status !== 200) {
        throw new NetworkError(`Failed to fetch ${pineId}`, {
          status: res.status,
        });
      }

      const data = this._parseResponse(res.data);
      if (!data.source) {
        throw new NotFoundError("Empty source returned", { pineId });
      }

      return data;
    }, "get");
  }

  async _tryGetVersion(pineId, version, headers) {
    let url = `/get/${encodeURIComponent(pineId)}/${encodeURIComponent(version)}`;
    let res = await this.http.get(url, { headers });

    if (res.status === 200) {
      const data = this._parseResponse(res.data);
      if (data.source) return data;

      if (data.meta?.version && data.meta.version !== version) {
        url = `/get/${encodeURIComponent(pineId)}/${encodeURIComponent(data.meta.version)}`;
        res = await this.http.get(url, { headers });
        if (res.status === 200) {
          const d2 = this._parseResponse(res.data);
          if (d2.source) return d2;
        }
      }
    }
    return null;
  }

  async _resolveLatestVersion(pineId) {
    try {
      const headers = this._baseHeaders();
      const url = `/versions/${encodeURIComponent(pineId)}`;
      const res = await this.http.get(url, { headers });
      if (res.status !== 200) return null;

      const entries = this._normalizeVersionEntries(res.data);
      const candidates = entries
        .map((entry) => this._extractVersionFromEntry(entry))
        .filter((v) => v);
      return this._chooseHighestVersion(candidates);
    } catch {
      return null;
    }
  }

  _normalizeVersionEntries(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.versions)) return payload.versions;
    if (Array.isArray(payload.result?.versions)) return payload.result.versions;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }

  _extractVersionFromEntry(entry) {
    if (!entry) return null;
    if (typeof entry === "string") return entry;
    return (
      entry.version ||
      entry.result?.version ||
      entry.metaInfo?.version ||
      entry.scriptVersion ||
      entry.sourceVersion ||
      null
    );
  }

  _chooseHighestVersion(versions) {
    let best = null;
    for (const candidate of versions) {
      if (!candidate) continue;
      if (!best || compareVersionStrings(candidate, best) > 0) {
        best = candidate;
      }
    }
    return best;
  }

  _parseResponse(payload) {
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {}
    }

    if (typeof payload === "object" && payload) {
      return {
        source:
          payload.source ||
          payload.scriptSource ||
          payload.result?.scriptSource ||
          null,
        meta: {
          scriptName:
            payload.scriptName ||
            payload.scriptTitle ||
            payload.result?.metaInfo?.name ||
            null,
          version:
            payload.version ||
            payload.result?.version ||
            payload.result?.metaInfo?.version ||
            null,
          created: payload.created || null,
          updated: payload.updated || null,
        },
      };
    }

    return { source: typeof payload === "string" ? payload : null, meta: null };
  }

  async listSaved() {
    return this._withRetry(async () => {
      const headers = this._baseHeaders();
      const res = await this.http.get("/list?filter=saved", { headers });

      if (res.status !== 200) {
        throw new NetworkError("Failed to list scripts", {
          status: res.status,
        });
      }

      return res.data;
    }, "listSaved");
  }

  async compile(source) {
    return this._withRetry(async () => {
      const headers = this._baseHeaders();
      const form = new FormData();
      form.append("source", source);

      const res = await this.http.post(
        `/translate_light?user_name=${encodeURIComponent(this.config.userName)}&v=3`,
        form,
        { headers: { ...form.getHeaders(), ...headers } },
      );

      if (res.status === 401 || res.status === 403) {
        throw new AuthError("Compilation unauthorized", { status: res.status });
      }

      if (res.status !== 200) {
        throw new NetworkError("Compilation failed", { status: res.status });
      }

      const data = res.data;
      if (data.success === false) {
        throw new ValidationError("Script compilation failed", {
          errors: data.result?.errors || [],
        });
      }

      return data;
    }, "compile");
  }

  async saveNew(source, name) {
    return this._withRetry(async () => {
      const headers = this._baseHeaders();
      const form = new FormData();
      form.append("source", source);

      const res = await this.http.post(
        `/save/new?name=${encodeURIComponent(name)}&user_name=${encodeURIComponent(this.config.userName)}&allow_overwrite=true`,
        form,
        { headers: { ...form.getHeaders(), ...headers } },
      );

      if (res.status === 401 || res.status === 403) {
        throw new AuthError("Save unauthorized", { status: res.status });
      }

      if (res.status !== 200) {
        throw new NetworkError("Save failed", { status: res.status });
      }

      return res.data;
    }, "saveNew");
  }

  async saveNext(pineId, source) {
    return this._withRetry(async () => {
      const headers = this._baseHeaders();
      const form = new FormData();
      form.append("source", source);

      const res = await this.http.post(
        `/save/next/${encodeURIComponent(pineId)}?user_name=${encodeURIComponent(this.config.userName)}`,
        form,
        { headers: { ...form.getHeaders(), ...headers } },
      );

      if (res.status === 401 || res.status === 403) {
        throw new AuthError("Update unauthorized", { status: res.status });
      }

      if (res.status !== 200) {
        throw new NetworkError("Update failed", { status: res.status });
      }

      return res.data;
    }, "saveNext");
  }

  async delete(pineId) {
    return this._withRetry(async () => {
      const headers = this._baseHeaders();
      const res = await this.http.post(
        `/delete/${encodeURIComponent(pineId)}?user_name=${encodeURIComponent(this.config.userName)}`,
        null,
        { headers },
      );

      if (res.status !== 200) {
        throw new NetworkError("Delete failed", { status: res.status });
      }

      return res.data;
    }, "delete");
  }

  async searchPublicScripts(query) {
    return this._withRetry(async () => {
      const headers = this._baseHeaders();
      const url = `${this.config.tvBaseUrl}/pubscripts-suggest-json/?search=${encodeURIComponent(query)}`;
      const res = await this.http.get(url, { headers });

      if (res.status !== 200) {
        throw new NetworkError("Search failed", { status: res.status });
      }

      return res.data;
    }, "search");
  }
}

// =============================================================================
// UTILITIES (keeping essential ones)
// =============================================================================

function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function slugify(input) {
  return (
    String(input || "")
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "script"
  );
}

function normalizePineId(raw) {
  return String(raw || "")
    .trim()
    .replace(/%3B/gi, ";");
}

function normalizeTimeframe(tf) {
  const t = String(tf || "").trim();
  if (!t) return "5";
  if (/^\d+$/.test(t) || /^[DWM]$/.test(t)) return t;
  const m = t.match(/^(\d+)\s*m$/i);
  if (m) return m[1];
  const h = t.match(/^(\d+)\s*h$/i);
  if (h) return String(Number(h[1]) * 60);
  return t;
}

function compareVersionStrings(a, b) {
  const toParts = (value) =>
    String(value || "")
      .trim()
      .split(".")
      .map((chunk) => {
        const n = Number(chunk);
        return Number.isFinite(n) ? n : 0;
      });
  const aParts = toParts(a);
  const bParts = toParts(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }
  return 0;
}

function looksLikePineId(s) {
  return /^\s*(USER|PUB|STD|INDIC);/i.test(String(s || ""));
}

function extractPineIdFromResponse(obj) {
  if (!obj) return null;
  if (typeof obj === "string") {
    const s = normalizePineId(obj);
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return extractPineIdFromResponse(JSON.parse(s));
      } catch {}
    }
    const m = s.match(/\b(?:USER|PUB|STD|INDIC);[^\s"'<>]+/i);
    return m ? normalizePineId(m[0]) : null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractPineIdFromResponse(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === "object") {
    const keys = [
      "id",
      "pineId",
      "pine_id",
      "scriptIdPart",
      "script_id",
      "scriptId",
      "result",
      "data",
    ];
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        const found = extractPineIdFromResponse(obj[k]);
        if (found) return found;
      }
    }
    if (obj.result?.metaInfo) {
      const part = obj.result.metaInfo.scriptIdPart;
      if (part) {
        if (String(part).includes(";")) return normalizePineId(part);
        return normalizePineId(`USER;${String(part)}`);
      }
    }
  }
  return null;
}

function parseSaveResponse(resp) {
  if (!resp) return null;
  let data = resp;
  if (typeof resp === "string") {
    try {
      data = JSON.parse(resp);
    } catch {
      data = { raw: resp };
    }
  }
  const pineId = extractPineIdFromResponse(data) || null;
  const version =
    data?.version ||
    data?.result?.version ||
    data?.result?.metaInfo?.version ||
    null;
  const success =
    typeof data.success === "boolean"
      ? data.success
      : data?.result
        ? true
        : null;
  const reason = data?.reason || null;
  const errors = data?.reason2?.errors || data?.result?.errors || null;
  return { pineId, version, success, reason, errors, raw: data };
}

function extractPineIdFromSource(source) {
  const m = String(source || "").match(
    /(?:^|\n)\s*(?:\/\/\s*)?(?:@?pineId\b\s*(?::|=)?\s*)(?:"|')?\s*((?:USER|PUB|STD|INDIC);[^\s"'<>]+)/i,
  );
  return m ? normalizePineId(m[1]) : null;
}

function ensurePineIdInSource(source, pineId) {
  const existing = extractPineIdFromSource(source);
  if (existing) return { updated: false, source, pineId: existing };

  const line = `// pineId: ${normalizePineId(pineId)}`;
  const lines = source.split(/\r?\n/);
  const versionIdx = lines.findIndex((l) => /^\s*\/\/\s*@version\b/i.test(l));
  lines.splice(versionIdx >= 0 ? versionIdx + 1 : 0, 0, line);
  return {
    updated: true,
    source: lines.join("\n"),
    pineId: normalizePineId(pineId),
  };
}

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [key, ...rest] = a.slice(2).split("=");
      args.flags[key] = rest.length
        ? rest.join("=")
        : argv[i + 1] && !argv[i + 1].startsWith("-")
          ? argv[++i]
          : true;
    } else if (a.startsWith("-") && a.length === 2) {
      args.flags[a[1]] =
        argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[++i] : true;
    } else {
      args.positional.push(a);
    }
  }
  return args;
}

function toBool(val, def = false) {
  if (val === undefined) return def;
  if (val === true || val === "true" || val === "1" || val === "yes")
    return true;
  if (val === false || val === "false" || val === "0" || val === "no")
    return false;
  return def;
}

function parseValue(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === "true";
  if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (/^["'].*["']$/.test(s)) return s.slice(1, -1);
  if (/^\[.*\]$/.test(s)) {
    try {
      return JSON.parse(s.replace(/'/g, '"'));
    } catch {
      return s;
    }
  }
  return s;
}

// =============================================================================
// ANALYSIS ENGINE - Agent-First Primitives
// =============================================================================

class AnalysisEngine {
  constructor(client, store) {
    this.client = client;
    this.store = store;
  }

  /**
   * Multi-timeframe scan - runs indicator across multiple timeframes
   */
  async scan(
    pineId,
    symbol,
    timeframes = ["5m", "15m", "1h", "4h", "D"],
    options = {},
  ) {
    const results = [];

    for (const tf of timeframes) {
      try {
        const analysis = await this.analyze(pineId, symbol, tf, options);
        results.push({
          timeframe: tf,
          ...analysis,
        });
      } catch (err) {
        results.push({
          timeframe: tf,
          error: err.message,
        });
      }
    }

    // Aggregate signals
    const signals = results.filter((r) => r.signal && !r.error);
    const consensus = this._calculateConsensus(signals);

    return {
      symbol,
      timeframes: results,
      consensus,
      timestamp: new Date().toISOString(),
    };
  }

  _calculateConsensus(signals) {
    if (signals.length === 0) return { action: "NONE", confidence: 0 };

    const buyCount = signals.filter((s) => s.signal?.action === "BUY").length;
    const sellCount = signals.filter((s) => s.signal?.action === "SELL").length;
    const total = signals.length;

    if (buyCount > sellCount) {
      return {
        action: "BUY",
        confidence: Math.round((buyCount / total) * 100),
        buyCount,
        sellCount,
        total,
      };
    } else if (sellCount > buyCount) {
      return {
        action: "SELL",
        confidence: Math.round((sellCount / total) * 100),
        buyCount,
        sellCount,
        total,
      };
    }

    return {
      action: "NEUTRAL",
      confidence: 50,
      buyCount,
      sellCount,
      total,
    };
  }

  /**
   * Single analysis run
   *
   * Mirrors the Python ScriptRunner.run() flow:
   *  1. Fetch indicator metadata via getIndicator()
   *  2. Apply input overrides
   *  3. Connect via tv.Client (with auth fallback)
   *  4. Create chart session, set market, wait for symbol
   *  5. Clear existing studies (free-tier 1-study limit)
   *  6. Create study, wait for data via update-count completion
   *  7. Extract signal + performance from results
   *  8. Cleanup chart + client
   */
  async analyze(pineId, symbol, timeframe = "5m", options = {}) {
    // Load TradingView client - try tv.cjs first (CommonJS), then pkg, then npm package
    let TradingView;
    const tvCjsPath = path.resolve(process.cwd(), "tv.cjs");
    const tvJsPath = path.resolve(process.cwd(), "tv.js");
    
    // Use dynamic import for ESM files, require for CommonJS
    const fsCheck = import("fs");
    const tvCjsExists = (await fsCheck).existsSync(tvCjsPath);
    const tvJsExists = (await fsCheck).existsSync(tvJsPath);
    
    if (tvCjsExists) {
      try {
        const tvRequire = createRequire(import.meta.url);
        TradingView = tvRequire(tvCjsPath);
      } catch (e) {
        throw new ValidationError(`Failed to load tv.cjs: ${e.message}`);
      }
    } else if (tvJsExists) {
      try {
        TradingView = await import(tvJsPath);
        if (TradingView.default) TradingView = TradingView.default;
      } catch (e) {
        throw new ValidationError(`Failed to load tv.js: ${e.message}`);
      }
    } else {
      try {
        const pkg = await import("@mathieuc/tradingview");
        TradingView = pkg.default || pkg;
      } catch {
        throw new ValidationError("TradingView client not available (tried tv.cjs, tv.js, @mathieuc/tradingview)");
      }
    }

    const config = this.client.config;
    const tvLocation = config.tvBaseUrl.replace(/\/+$/, "") + "/";
    const hasCookies = !!(config.sessionId && config.signature);

    // --- Step 1: Fetch indicator metadata (before connecting) ---
    const indic = await TradingView.getIndicator(
      pineId,
      "last",
      config.sessionId,
      config.signature,
    );

    // --- Step 2: Apply input overrides ---
    if (options.inputs) {
      for (const [key, value] of Object.entries(options.inputs)) {
        try {
          indic.setOption(key, value);
        } catch {}
      }
    }

    // --- Step 3: Connect to TradingView WebSocket ---
    let tvClient;
    try {
      // Try with auth first
      tvClient = new TradingView.Client({
        ...(hasCookies
          ? { token: config.sessionId, signature: config.signature }
          : {}),
        location: tvLocation,
      });
      if (typeof tvClient.connect === "function") {
        await tvClient.connect();
      }
      await this._waitForConnection(tvClient);
    } catch (authErr) {
      // Auth failed - retry without credentials
      if (hasCookies && (authErr.message?.includes("auth") || authErr.message?.includes("credential") || authErr.message?.includes("Auth"))) {
        tvClient = new TradingView.Client({
          location: tvLocation,
        });
        if (typeof tvClient.connect === "function") {
          await tvClient.connect();
        }
        await this._waitForConnection(tvClient);
      } else {
        throw authErr;
      }
    }

    // --- Step 4: Create chart session and set market ---
    const chart = tvClient.Session.Chart();

    const symbolLoaded = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new NetworkError("Symbol load timeout (15s)")),
        15000,
      );
      chart.onSymbolLoaded?.(() => {
        clearTimeout(timer);
        resolve();
      });
      chart.onError?.((err) => {
        clearTimeout(timer);
        reject(new NetworkError(`Chart error during market load: ${err?.message || JSON.stringify(err)}`));
      });
    });

    const range = options.range || 500;
    chart.setMarket(symbol, {
      timeframe: normalizeTimeframe(timeframe),
      range,
    });
    await symbolLoaded;

    // --- Step 5: Clear existing studies (free-tier 1-study limit) ---
    try {
      const existingStudies = chart.getStudies?.() || [];
      if (existingStudies.length > 0) {
        await chart.removeAllStudies?.();
      }
    } catch {}

    // --- Step 6: Create study and wait for data ---
    const study = chart.Study(indic);

    const result = await this._waitForStudy(
      study,
      options.timeout || 30000,
    );

    // --- Step 7: Cleanup ---
    try {
      chart.delete?.();
    } catch {}
    try {
      tvClient.end?.();
    } catch {}

    // --- Step 8: Extract signal and performance ---
    const signal = this._extractSignal(result.periods);
    const performance = this._extractPerformance(result.strategyReport);

    return {
      symbol,
      timeframe,
      periodCount: result.periods.length,
      signal,
      performance,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Wait for WebSocket connection to be ready
   */
  async _waitForConnection(tvClient) {
    // Use waitForConnected if available (tv.cjs)
    if (typeof tvClient.waitForConnected === "function") {
      const ok = await tvClient.waitForConnected(20000);
      if (!ok) {
        throw new NetworkError("Connection timeout (waitForConnected)");
      }
      return;
    }

    // Fallback: wait for onConnected event
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new NetworkError("Connection timeout (30s)")),
        30000,
      );
      const cleanup = () => clearTimeout(timer);
      tvClient.onConnected?.(() => {
        cleanup();
        resolve();
      });
      tvClient.onError?.((err) => {
        cleanup();
        reject(new NetworkError(err?.message || "Connection failed"));
      });
    });
  }

  /**
   * Wait for study data with update-count-based completion.
   *
   * Mirrors Python ScriptRunner's update-count strategy:
   *  - Normal indicators: resolve after 2 updates
   *  - Strategy scripts: resolve after 5 updates (need more time for report)
   */
   async _waitForStudy(study, timeoutMs) {
     const maxUpdates = study.instance?.type?.includes("strategy") ? 5 : 2;
     let updateCount = 0;
     let resolved = false;

     return new Promise((resolve, reject) => {
       const timer = setTimeout(
         () => {
           if (!resolved) {
             // Check if we have data despite timeout
             const periods = study.periods || [];
             if (periods.length > 0) {
               console.log(`   Timeout reached but have ${periods.length} bars - continuing`);
               resolved = true;
               resolve({
                 periods,
                 strategyReport: study.strategyReport || null,
               });
             } else {
               reject(new NetworkError(`Study timeout (${timeoutMs}ms)`));
             }
           }
         },
         timeoutMs,
       );
       const cleanup = () => clearTimeout(timer);

       study.onError?.((err) => {
         if (!resolved) {
           resolved = true;
           cleanup();
           reject(new ValidationError("Study error", { error: err }));
         }
       });

       study.onReady?.(() => {
         // Study completed initial setup - still need to wait for data updates
       });

       study.onUpdate?.(() => {
         updateCount++;
         if (updateCount >= maxUpdates && !resolved) {
           resolved = true;
           cleanup();
           resolve({
             periods: study.periods || [],
             strategyReport: study.strategyReport || null,
           });
         }
       });

       // Fallback: onEvent catches studyCompleted for studies without plot data
       study.onEvent?.((event) => {
         if (event === "studyCompleted" && updateCount === 0 && !resolved) {
           // No plot updates expected - resolve immediately
           resolved = true;
           cleanup();
           resolve({
             periods: study.periods || [],
             strategyReport: study.strategyReport || null,
           });
         }
       });
     });
   }

  /**
   * Extract trading signal from the most recent period.
   *
   * Checks multiple field name variants since different scripts
   * use different naming conventions for signals.
   */
  _extractSignal(periods) {
    if (!periods || periods.length === 0) return null;

    const last = periods[0]; // Already sorted newest-first by tv.cjs
    if (!last) return null;

    // Check known signal field names (Python: signal_fields list)
    const signalFields = [
      "signal", "Signal", "direction", "Direction",
      "trend", "Trend", "Last_Signal", "last_signal",
      "signal_direction", "Signal_Direction",
    ];

    let signalValue = null;
    for (const field of signalFields) {
      if (field in last) {
        signalValue = last[field];
        break;
      }
    }

    // If no explicit signal field, check for position indicators
    const entryPrice = last["Entry Price"] ?? last["entry_price"] ?? last["entryPrice"];
    const activeSL = last["Active SL"] ?? last["stop_loss"] ?? last["stopLoss"];
    const activeTP = last["Active TP"] ?? last["take_profit"] ?? last["takeProfit"];

    const hasPosition = entryPrice !== undefined && !isNaN(entryPrice);

    // Determine action from signal value
    let action = "NONE";
    if (signalValue !== null && signalValue !== undefined) {
      if (signalValue === 1 || signalValue === "BUY" || signalValue === "buy" || signalValue === "Long") {
        action = "BUY";
      } else if (signalValue === -1 || signalValue === "SELL" || signalValue === "sell" || signalValue === "Short") {
        action = "SELL";
      }
    }

    // Extract trend strength
    const trendVal = last["Trend_Strength"] ?? last["trend_strength"] ?? last["trendStrength"] ?? last["trend"] ?? last["Trend"];

    return {
      action,
      trend: trendVal,
      trendDesc: this._describeTrend(trendVal),
      entry: entryPrice,
      sl: activeSL,
      tp: activeTP,
      hasPosition,
      rawSignal: signalValue,
    };
  }

  /**
   * Extract performance metrics from strategy report.
   */
  _extractPerformance(strategyReport) {
    if (!strategyReport?.performance) return null;

    const perf = strategyReport.performance.all || strategyReport.performance;

    return {
      netProfit: perf.netProfit ?? perf.net_profit ?? null,
      winRate: perf.percentProfitable ?? perf.win_rate ?? null,
      profitFactor: perf.profitFactor ?? perf.profit_factor ?? null,
      totalTrades: perf.totalTrades ?? perf.total_trades ?? 0,
      maxDrawdown: perf.maxDrawdown ?? perf.max_drawdown ?? null,
      avgTrade: perf.avgTrade ?? perf.avg_trade ?? null,
    };
  }

  _describeTrend(trendVal) {
    if (trendVal === undefined) return "UNKNOWN";
    if (trendVal >= 4) return "STRONG_UP";
    if (trendVal <= -4) return "STRONG_DOWN";
    if (trendVal > 0) return "WEAK_UP";
    if (trendVal < 0) return "WEAK_DOWN";
    return "NEUTRAL";
  }

  /**
   * Compare two indicators on same symbol/timeframe
   */
  async compare(pineId1, pineId2, symbol, timeframe = "5m", options = {}) {
    const [analysis1, analysis2] = await Promise.all([
      this.analyze(pineId1, symbol, timeframe, options),
      this.analyze(pineId2, symbol, timeframe, options),
    ]);

    return {
      symbol,
      timeframe,
      indicator1: { pineId: pineId1, ...analysis1 },
      indicator2: { pineId: pineId2, ...analysis2 },
      agreement: analysis1.signal?.action === analysis2.signal?.action,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Backtest - run historical analysis
   */
  async backtest(pineId, symbol, timeframe = "5m", options = {}) {
    // For true backtesting, we'd need to use replay mode
    // For now, just return strategy report
    const analysis = await this.analyze(pineId, symbol, timeframe, {
      ...options,
      range: options.range || 2000, // More history for backtest
    });

    return {
      symbol,
      timeframe,
      performance: analysis.performance,
      timestamp: new Date().toISOString(),
    };
  }
}

// =============================================================================
// COMMANDS - Agent-Optimized
// =============================================================================

async function cmdValidate(config, client) {
  const result = await client.validate();
  return {
    success: true,
    data: {
      ...result,
      config: {
        baseUrl: config.baseUrl,
        tvBaseUrl: config.tvBaseUrl,
        userName: config.userName,
        hasSession: !!config.sessionId,
        hasSignature: !!config.signature,
      },
    },
  };
}

async function cmdList(store, client, args) {
  const showRemote = toBool(args.flags.remote || args.flags.r);

  if (showRemote) {
    const items = await client.listSaved();
    const normalized = (
      Array.isArray(items) ? items : items.items || items.scripts || []
    ).map((it) => ({
      pineId:
        extractPineIdFromResponse(it) ||
        it.id ||
        it.scriptIdPart ||
        "(unknown)",
      name: it.name || it.scriptName || it.scriptTitle || "(unnamed)",
      version: it.version || it.result?.version || "",
      access: it.access || it.type || "",
    }));

    return {
      success: true,
      data: {
        source: "remote",
        count: normalized.length,
        scripts: normalized,
      },
    };
  }

  // Local list
  const scripts = await store.listScripts();
  const normalized = scripts.map((s) => ({
    id: s.id,
    name: s.name,
    pineId: s.pineId,
    localPath: s.localPath,
    remoteVersion: s.remoteVersion,
    synced: s.remoteHash === s.localHash,
    updatedAt: s.updatedAt,
  }));

  return {
    success: true,
    data: {
      source: "local",
      count: normalized.length,
      scripts: normalized,
    },
  };
}

async function cmdSearch(client, args) {
  const query = args.positional[0];
  if (!query) throw new ValidationError("Search query required");

  const limit = Number(args.flags.limit || args.flags.l || 20);
  const data = await client.searchPublicScripts(query);

  const results = (Array.isArray(data) ? data : data.results || []).slice(
    0,
    limit,
  );
  const normalized = results.map((it) => ({
    pineId: it.scriptIdPart || "",
    name: it.title || it.scriptName || "",
    author: it.author?.username || "",
    type: it.type || "",
    access: it.access || null,
    version: it.version || null,
  }));

  return {
    success: true,
    data: {
      query,
      limit,
      count: normalized.length,
      results: normalized,
    },
  };
}

async function cmdCreate(store, client, args) {
  const filePath = args.positional[0];
  if (!filePath) throw new ValidationError("File path required");

  const absPath = path.resolve(store.baseDir, filePath);

  try {
    await fs.access(absPath);
  } catch {
    throw new NotFoundError(`File not found: ${filePath}`);
  }

  const source = await fs.readFile(absPath, "utf8");
  const localHash = sha256(source);

  // Check if already tracked
  const existing = await store.findByLocalPath(absPath);
  if (existing && !toBool(args.flags.force)) {
    throw new ConflictError(
      `Already tracked as #${existing.id}. Use --force to recreate.`,
    );
  }

  // Compile first
  await client.compile(source);

  // Create on remote
  const name =
    args.flags.name || path.basename(absPath, ".pine").replace(/^\d+[-_]+/, "");
  const createRes = await client.saveNew(source, name);

  const parsed = parseSaveResponse(createRes);
  if (!parsed.pineId) {
    throw new NetworkError("No pineId returned from create", {
      response: parsed,
    });
  }

  let pineId = parsed.pineId;
  if (/^USER;USER;/.test(pineId)) {
    pineId = pineId.replace(/^USER;USER;/, "USER;");
  }

  // Update source with pineId
  const updated = ensurePineIdInSource(source, pineId);
  if (updated.updated) {
    await fs.writeFile(absPath, updated.source, "utf8");
  }

  // Track locally
  const id = await store.nextId();
  await store.setScript(id, {
    name,
    pineId,
    localPath: path.relative(store.baseDir, absPath),
    localHash: sha256(updated.source),
    remoteHash: sha256(updated.source),
    remoteVersion: parsed.version || "1.0",
  });

  return {
    success: true,
    data: {
      id,
      pineId,
      name,
      version: parsed.version,
      localPath: path.relative(store.baseDir, absPath),
    },
  };
}

async function cmdPull(store, client, args) {
  const target = args.positional[0];
  if (!target)
    throw new ValidationError("Target required (pineId or numeric ID)");

  let pineId, localPath, scriptName;

  if (/^\d+$/.test(target)) {
    const entry = await store.getScript(target);
    if (!entry?.pineId) throw new NotFoundError(`No pineId for #${target}`);
    pineId = entry.pineId;
    localPath = entry.localPath;
    scriptName = entry.name;
  } else if (looksLikePineId(target)) {
    pineId = normalizePineId(target);
    const existing = await store.findByPineId(pineId);
    if (existing) {
      localPath = existing.localPath;
      scriptName = existing.name;
    }
  } else {
    throw new ValidationError("Invalid target format");
  }

  const { source, meta } = await client.get(pineId);
  if (!source || !source.trim()) {
    throw new NotFoundError("Empty source returned");
  }

  const remoteHash = sha256(source);
  scriptName = scriptName || meta?.scriptName || "script";

  // Determine output path
  let outputPath = args.flags.out;
  if (!outputPath) {
    if (!localPath) {
      const id = await store.nextId();
      const fileName = `${String(id).padStart(3, "0")}--${slugify(scriptName)}.pine`;
      localPath = path.join(store.config.dataDir, fileName);

      await store.setScript(id, {
        name: scriptName,
        pineId,
        localPath,
        localHash: remoteHash,
        remoteHash,
        remoteVersion: meta?.version,
      });
    }
    outputPath = localPath;
  }

  const absPath = path.resolve(store.baseDir, outputPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, source, "utf8");

  // Update tracking
  const entry =
    (await store.findByLocalPath(absPath)) ||
    (await store.findByPineId(pineId));
  if (entry) {
    await store.setScript(entry.id, {
      localHash: remoteHash,
      remoteHash,
      remoteVersion: meta?.version,
    });
  }

  return {
    success: true,
    data: {
      pineId,
      scriptName,
      localPath: path.relative(store.baseDir, absPath),
      version: meta?.version,
    },
  };
}

async function cmdPush(store, client, args) {
  const target = args.positional[0];
  if (!target)
    throw new ValidationError("Target required (numeric ID or file path)");

  const force = toBool(args.flags.force);
  let id, entry, localPath, source;

  if (/^\d+$/.test(target)) {
    id = target;
    entry = await store.getScript(id);
    if (!entry) throw new NotFoundError(`No script #${id}`);
    if (!entry.localPath) throw new ValidationError(`No local file for #${id}`);
    localPath = path.resolve(store.baseDir, entry.localPath);
  } else {
    localPath = path.resolve(store.baseDir, target);
    entry = await store.findByLocalPath(localPath);
    id = entry?.id;
  }

  try {
    await fs.access(localPath);
  } catch {
    throw new NotFoundError(`File not found: ${localPath}`);
  }

  source = await fs.readFile(localPath, "utf8");
  const localHash = sha256(source);

  let pineId = entry?.pineId || extractPineIdFromSource(source);

  if (!pineId) {
    if (toBool(args.flags["create-if-missing"])) {
      // Auto-create
      const name = args.flags.name || path.basename(localPath, ".pine");
      const createRes = await client.saveNew(source, name);
      const parsed = parseSaveResponse(createRes);
      if (!parsed.pineId) throw new NetworkError("Create failed");
      pineId = parsed.pineId;

      // Update source
      const updated = ensurePineIdInSource(source, pineId);
      if (updated.updated) {
        await fs.writeFile(localPath, updated.source, "utf8");
        source = updated.source;
      }
    } else {
      throw new ValidationError(
        "No pineId found. Use --create-if-missing or add pineId comment.",
      );
    }
  }

  // Check if push needed
  if (!force && entry?.remoteHash === localHash) {
    return {
      success: true,
      data: {
        pineId,
        action: "skipped",
        reason: "No changes detected",
      },
    };
  }

  // Pull remote to compare
  if (!force) {
    try {
      const { source: remoteSource } = await client.get(pineId);
      const remoteHash = sha256(remoteSource || "");

      if (remoteHash === localHash) {
        if (id) {
          await store.setScript(id, { localHash, remoteHash });
        }
        return {
          success: true,
          data: {
            pineId,
            action: "skipped",
            reason: "Local matches remote",
          },
        };
      }
    } catch {
      // Continue with push
    }
  }

  // Compile
  await client.compile(source);

  // Push
  const pushRes = await client.saveNext(pineId, source);
  const parsed = parseSaveResponse(pushRes);

  if (parsed.success === false) {
    throw new NetworkError("Push failed", { reason: parsed.reason });
  }

  let pushedPine = parsed.pineId || pineId;
  if (/^USER;USER;/.test(pushedPine)) {
    pushedPine = pushedPine.replace(/^USER;USER;/, "USER;");
  }

  // Update metadata
  if (id) {
    await store.setScript(id, {
      pineId: pushedPine,
      localHash,
      remoteHash: localHash,
      remoteVersion: parsed.version,
    });
  }

  return {
    success: true,
    data: {
      pineId: pushedPine,
      action: "pushed",
      version: parsed.version,
    },
  };
}

async function cmdDelete(store, client, args) {
  const target = args.positional[0];
  if (!target) throw new ValidationError("Target required (numeric ID)");

  if (!/^\d+$/.test(target)) {
    throw new ValidationError("Use numeric ID for delete");
  }

  const entry = await store.getScript(target);
  if (!entry) throw new NotFoundError(`No script #${target}`);

  const confirm = toBool(args.flags.yes || args.flags.y || args.flags.confirm);
  if (!confirm) {
    throw new ValidationError("Use --yes to confirm deletion");
  }

  let remoteDeleted = false;
  if (entry.pineId) {
    try {
      await client.delete(entry.pineId);
      remoteDeleted = true;
    } catch (err) {
      // Continue with local deletion
    }
  }

  await store.deleteScript(target);

  return {
    success: true,
    data: {
      id: target,
      pineId: entry.pineId,
      remoteDeleted,
      localDeleted: true,
    },
  };
}

async function cmdCompile(client, args) {
  const filePath = args.positional[0];
  if (!filePath) throw new ValidationError("File path required");

  const absPath = path.resolve(process.cwd(), filePath);

  try {
    await fs.access(absPath);
  } catch {
    throw new NotFoundError(`File not found: ${filePath}`);
  }

  const source = await fs.readFile(absPath, "utf8");

  // Will throw ValidationError if compilation fails
  const res = await client.compile(source);

  return {
    success: true,
    data: {
      compiled: true,
      warnings: res.warnings || [],
    },
  };
}

async function cmdRun(store, client, args) {
  const target = args.positional[0];
  const symbol = args.positional[1] || args.flags.symbol;

  if (!target)
    throw new ValidationError("Target required (ID, pineId, or file)");
  if (!symbol) throw new ValidationError("Symbol required");

  let pineId;

  if (/^\d+$/.test(target)) {
    const entry = await store.getScript(target);
    if (!entry?.pineId) throw new NotFoundError(`No pineId for #${target}`);
    pineId = entry.pineId;
  } else if (looksLikePineId(target)) {
    pineId = normalizePineId(target);
  } else {
    const localPath = path.resolve(store.baseDir, target);
    const entry = await store.findByLocalPath(localPath);

    if (entry?.pineId) {
      pineId = entry.pineId;
    } else {
      try {
        const source = await fs.readFile(localPath, "utf8");
        pineId = extractPineIdFromSource(source);
        if (!pineId) throw new ValidationError("No pineId in source");
      } catch {
        throw new NotFoundError("File not found or no pineId");
      }
    }
  }

  const engine = new AnalysisEngine(client, store);
  const timeframe = args.flags.timeframe || args.flags.tf || "5m";
  const range = Number(args.flags.range || 500);
  const timeout = Number(args.flags.timeout || 60000);

  const options = {
    range,
    timeout,
    inputs: {},
  };

  // Parse custom inputs from flags
  const skipKeys = [
    "symbol",
    "timeframe",
    "tf",
    "range",
    "timeout",
    "json",
    "out",
    "format",
    "human",
  ];
  for (const [key, val] of Object.entries(args.flags)) {
    if (!skipKeys.includes(key)) {
      options.inputs[key] = parseValue(val);
    }
  }

  const analysis = await engine.analyze(pineId, symbol, timeframe, options);

  // Save to file if requested
  if (args.flags.out) {
    const outPath = path.resolve(store.baseDir, args.flags.out);
    await fs.writeFile(outPath, JSON.stringify(analysis, null, 2));
  }

  return {
    success: true,
    data: {
      analysis,
    },
  };
}

async function cmdScan(store, client, args) {
  const target = args.positional[0];
  const symbol = args.positional[1] || args.flags.symbol;

  if (!target)
    throw new ValidationError("Target required (ID, pineId, or file)");
  if (!symbol) throw new ValidationError("Symbol required");

  let pineId;

  if (/^\d+$/.test(target)) {
    const entry = await store.getScript(target);
    if (!entry?.pineId) throw new NotFoundError(`No pineId for #${target}`);
    pineId = entry.pineId;
  } else if (looksLikePineId(target)) {
    pineId = normalizePineId(target);
  } else {
    const localPath = path.resolve(store.baseDir, target);
    const entry = await store.findByLocalPath(localPath);

    if (entry?.pineId) {
      pineId = entry.pineId;
    } else {
      try {
        const source = await fs.readFile(localPath, "utf8");
        pineId = extractPineIdFromSource(source);
        if (!pineId) throw new ValidationError("No pineId in source");
      } catch {
        throw new NotFoundError("File not found or no pineId");
      }
    }
  }

  const engine = new AnalysisEngine(client, store);
  const timeframes = args.flags.timeframes?.split(",") || [
    "5m",
    "15m",
    "1h",
    "4h",
    "D",
  ];
  const options = {
    range: Number(args.flags.range || 500),
    timeout: Number(args.flags.timeout || 90000),
  };

  const scan = await engine.scan(pineId, symbol, timeframes, options);

  return {
    success: true,
    data: {
      scan,
    },
  };
}

async function cmdCompare(store, client, args) {
  const target1 = args.positional[0];
  const target2 = args.positional[1];
  const symbol = args.positional[2] || args.flags.symbol;

  if (!target1 || !target2) throw new ValidationError("Two targets required");
  if (!symbol) throw new ValidationError("Symbol required");

  const resolvePineId = async (target) => {
    if (looksLikePineId(target)) return normalizePineId(target);

    if (/^\d+$/.test(target)) {
      const entry = await store.getScript(target);
      if (!entry?.pineId) throw new NotFoundError(`No pineId for #${target}`);
      return entry.pineId;
    }

    const localPath = path.resolve(store.baseDir, target);
    const entry = await store.findByLocalPath(localPath);
    if (entry?.pineId) return entry.pineId;

    const source = await fs.readFile(localPath, "utf8");
    const pineId = extractPineIdFromSource(source);
    if (!pineId) throw new ValidationError("No pineId in source");
    return pineId;
  };

  const [pineId1, pineId2] = await Promise.all([
    resolvePineId(target1),
    resolvePineId(target2),
  ]);

  const engine = new AnalysisEngine(client, store);
  const timeframe = args.flags.timeframe || args.flags.tf || "5m";
  const options = {
    range: Number(args.flags.range || 500),
    timeout: Number(args.flags.timeout || 60000),
  };

  const comparison = await engine.compare(
    pineId1,
    pineId2,
    symbol,
    timeframe,
    options,
  );

  return {
    success: true,
    data: {
      comparison,
    },
  };
}

async function cmdBacktest(store, client, args) {
  const target = args.positional[0];
  const symbol = args.positional[1] || args.flags.symbol;

  if (!target) throw new ValidationError("Target required");
  if (!symbol) throw new ValidationError("Symbol required");

  let pineId;

  if (/^\d+$/.test(target)) {
    const entry = await store.getScript(target);
    if (!entry?.pineId) throw new NotFoundError(`No pineId for #${target}`);
    pineId = entry.pineId;
  } else if (looksLikePineId(target)) {
    pineId = normalizePineId(target);
  } else {
    const localPath = path.resolve(store.baseDir, target);
    const entry = await store.findByLocalPath(localPath);

    if (entry?.pineId) {
      pineId = entry.pineId;
    } else {
      const source = await fs.readFile(localPath, "utf8");
      pineId = extractPineIdFromSource(source);
      if (!pineId) throw new ValidationError("No pineId in source");
    }
  }

  const engine = new AnalysisEngine(client, store);
  const timeframe = args.flags.timeframe || args.flags.tf || "5m";
  const options = {
    range: Number(args.flags.range || 2000),
    timeout: Number(args.flags.timeout || 120000),
  };

  const backtest = await engine.backtest(pineId, symbol, timeframe, options);

  return {
    success: true,
    data: {
      backtest,
    },
  };
}

// =============================================================================
// CMD RUNX — Extended multi-variant execution via run-x.cjs
// =============================================================================

async function cmdRunX(store, client, args) {
  const target = args.positional[0];
  const symbol = args.flags.symbol;

  if (!target) throw new ValidationError("Target required (pineId, numeric ID, or file)");
  if (!symbol) throw new ValidationError("Symbol required (--symbol)");

  // Resolve pineId
  let pineId;
  if (/^\d+$/.test(target)) {
    const entry = await store.getScript(target);
    if (!entry?.pineId) throw new NotFoundError(`No pineId for #${target}`);
    pineId = entry.pineId;
  } else if (looksLikePineId(target)) {
    pineId = normalizePineId(target);
  } else {
    const localPath = path.resolve(store.baseDir, target);
    const entry = await store.findByLocalPath(localPath);
    if (entry?.pineId) {
      pineId = entry.pineId;
    } else {
      try {
        const source = await fs.readFile(localPath, "utf8");
        pineId = extractPineIdFromSource(source);
        if (!pineId) throw new ValidationError("No pineId in source");
      } catch {
        throw new NotFoundError("File not found or no pineId");
      }
    }
  }

  // Load run-x module
  let RunXModule;
  try {
    const runXPath = path.resolve(process.cwd(), "run-x.cjs");
    const localRequire = createRequire(import.meta.url);
    RunXModule = localRequire(runXPath);
  } catch {
    throw new NetworkError("run-x.cjs not found in project root");
  }

  const config = client.config;
  const runx = new RunXModule.RunX({
    sessionId: config.sessionId,
    signature: config.signature,
    userName: config.userName,
    location: config.tvBaseUrl,
    timeoutMs: Number(args.flags.timeout || 60000),
    debug: toBool(args.flags.debug),
  });

  // Parse symbols (comma-separated)
  const symbols = symbol.split(",").map((s) => s.trim()).filter(Boolean);

  // Parse timeframes (comma-separated)
  const timeframes = args.flags.timeframes
    ? args.flags.timeframes.split(",").map((t) => t.trim())
    : [args.flags.timeframe || args.flags.tf || "5"];

  // Parse input variants
  let inputVariants = null;
  if (args.flags.variants) {
    const variantsPath = path.resolve(process.cwd(), args.flags.variants);
    try {
      const content = await fs.readFile(variantsPath, "utf8");
      inputVariants = JSON.parse(content);
    } catch (err) {
      throw new ValidationError(`Invalid variants file: ${args.flags.variants}`, { error: err.message });
    }
  }

  // Parse inline input overrides (--inputs key=val,key2=val2)
  if (args.flags.inputs) {
    const inlineOverrides = {};
    for (const pair of args.flags.inputs.split(",")) {
      const [k, ...rest] = pair.split("=");
      if (k) inlineOverrides[k.trim()] = parseValue(rest.join("="));
    }
    if (Object.keys(inlineOverrides).length > 0) {
      // If no variants file, create a single variant with these overrides
      inputVariants = inputVariants || [inlineOverrides];
      // If variants file exists, merge inline overrides into each variant
      if (Array.isArray(inputVariants)) {
        inputVariants = inputVariants.map((v) => ({ ...v, ...inlineOverrides }));
      }
    }
  }

  const range = Number(args.flags.range || 500);
  const noScore = toBool(args.flags["no-score"]);

  const result = await runx.run({
    pineId,
    symbol: symbols.length === 1 ? symbols[0] : symbols,
    timeframe: timeframes.length === 1 ? timeframes[0] : timeframes,
    inputVariants,
    range,
    score: !noScore,
  });

  // Save to file if requested
  if (args.flags.out) {
    const outPath = path.resolve(process.cwd(), args.flags.out);
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  }

  return {
    success: true,
    data: result,
  };
}

async function cmdBatch(store, client, args) {
  const filePath = args.positional[0];
  if (!filePath) throw new ValidationError("Batch file required");

  const absPath = path.resolve(process.cwd(), filePath);

  try {
    await fs.access(absPath);
  } catch {
    throw new NotFoundError(`Batch file not found: ${filePath}`);
  }

  const content = await fs.readFile(absPath, "utf8");
  const commands = JSON.parse(content);

  if (!Array.isArray(commands)) {
    throw new ValidationError("Batch file must contain array of commands");
  }

  const results = [];

  for (const cmd of commands) {
    try {
      const cmdArgs = parseArgs(cmd.args || []);
      cmdArgs.positional.unshift(cmd.command);

      const result = await executeCommand(store, client, cmdArgs);
      results.push({
        command: cmd.command,
        success: true,
        result,
      });
    } catch (err) {
      results.push({
        command: cmd.command,
        success: false,
        error:
          err instanceof AgentError ? err.toJSON() : { message: err.message },
      });

      if (cmd.stopOnError) break;
    }
  }

  return {
    success: true,
    data: {
      total: commands.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    },
  };
}

// =============================================================================
// COMMAND ROUTER
// =============================================================================

async function executeCommand(store, client, args) {
  const cmd = args.positional[0];
  args.positional = args.positional.slice(1);

  const config = client.config;

  switch (cmd) {
    case "validate":
      config.validate("read");
      return await cmdValidate(config, client);

    case "list":
    case "ls":
      config.validate("read");
      return await cmdList(store, client, args);

    case "search":
    case "find":
      // Search doesn't require auth
      return await cmdSearch(client, args);

    case "create":
    case "new":
      config.validate("create");
      return await cmdCreate(store, client, args);

    case "pull":
      config.validate("read");
      return await cmdPull(store, client, args);

    case "push":
      config.validate("push");
      return await cmdPush(store, client, args);

    case "delete":
    case "rm":
      config.validate("delete");
      return await cmdDelete(store, client, args);

    case "compile":
    case "check":
      config.validate("write");
      return await cmdCompile(client, args);

    case "run":
      config.validate("read");
      return await cmdRun(store, client, args);

    case "scan":
      config.validate("read");
      return await cmdScan(store, client, args);

    case "compare":
      config.validate("read");
      return await cmdCompare(store, client, args);

    case "backtest":
      config.validate("read");
      return await cmdBacktest(store, client, args);

    case "runx":
      config.validate("read");
      return await cmdRunX(store, client, args);

    case "batch":
      config.validate("read");
      return await cmdBatch(store, client, args);

    default:
      throw new ValidationError(`Unknown command: ${cmd}`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

const VERSION = "1.0.0";

const HELP_TEXT = `TradingView AI Agent CLI v${VERSION}

Usage: tvcli.js <command> [options]

Agent-First Commands:
  validate              Check auth & connectivity
  scan <id> <symbol>   Multi-timeframe market screening
  backtest <id> <symbol> Run historical analysis
  compare <id1> <id2> <symbol> Compare indicator performance
  watch <id> <symbol> Stream live updates (WebSocket)
  batch <file.json>     Execute multiple operations

Core Operations:
  list [--remote]       List scripts (local or remote)
  search <query>       Search public scripts (no auth required)
  create <file> --name <name> Create new script
  pull <id>          Pull script from remote
  push <id>          Push script to remote
  run <id> <symbol>   Run indicator analysis
  runx <id> --symbol <sym>  Extended multi-variant execution
       --timeframes 5m,15m,1h  Multiple timeframes
       --variants file.json   Input permutation spec
       --inputs key=val       Inline input overrides
       --range N             Bar count (default: 500)
       --no-score            Skip quality scoring
       --out file.json       Save results
  delete <id> --yes   Delete script
  compile <file>     Check script compilation

Global Flags:
  --format=json|human|yaml|csv  Output format (default: json)
  --compact            Use compact JSON (no whitespace)
  --quiet               Suppress non-essential output
  --version            Show version
  --help               Show this help

Exit Codes:
  0   Success
  1   General error
  2   Authentication error
  3   Validation error
  4   Network error
  5   Not found
  6   Conflict/state error

Environment:
  SESSION, SIGNATURE      TradingView session credentials
  TV_USER             Username (required for write ops)
  TV_DATA_DIR         Local storage directory
  TV_TIMEOUT_MS       Request timeout (default: 120000)
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.help || args.flags.h) {
    console.log(HELP_TEXT);
    process.exit(EXIT_CODES.SUCCESS);
  }

  if (args.flags.version || args.flags.v) {
    console.log(`tvcli.js ${VERSION}`);
    process.exit(EXIT_CODES.SUCCESS);
  }

  const quiet = toBool(args.flags.quiet);
  const format =
    args.flags.format ||
    (args.flags.human ? "human" : args.flags.json ? "json" : "json");
  const compact = toBool(args.flags.compact);
  const formatter = new OutputFormatter(format, compact);

  try {
    const config = new Config();
    const store = new FileStore(process.cwd(), config);
    await store.init();

    const client = new PineClient(config);

    const result = await executeCommand(store, client, args);

    if (!quiet) {
      console.log(formatter.success(result.data));
    } else {
      console.log(JSON.stringify(result.data, null, 2));
    }
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) {
    const errorOutput = formatter.error(err);
    if (!quiet) {
      console.error(errorOutput);
    } else {
      console.log(JSON.stringify(JSON.parse(errorOutput), null, 2));
    }

    if (err instanceof AgentError) {
      process.exit(err.code);
    } else {
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }
  }
}

main();
