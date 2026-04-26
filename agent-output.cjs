/**
 * agent-output.cjs — Deterministic JSON Output for TradingView Skill Runners
 *
 * Problem:
 *   The skill runners interleave emoji logs, progress messages, and table-formatted
 *   console output with the final JSON payload. When an orchestrator captures stdout,
 *   it must perform heuristic extraction (bracket counting, regex) which is fragile.
 *
 * Solution:
 *   1.  A global `--silent` / `--strict-json-stdout` flag suppresses ALL non-JSON
 *       stdout (errors still go to stderr).
 *   2.  Final JSON is emitted as a single compact line between well-known delimiters:
 *       <<<AGENT_JSON_START>>>
 *       {"status":"ok",...}
 *       <<<AGENT_JSON_END>>>
 *   3.  A deterministic parser can scan for the delimiter pair and parse the
 *       enclosed text directly — no bracket counting, no ambiguity.
 *   4.  Pretty-printed JSON is written to disk only (when --out is used); stdout
 *       always receives the compact delimited form when --silent is on.
 *
 * Usage in a skill runner:
 *
 *   const { AgentOutput, enableSilentMode, isSilent } = require('./agent-output.cjs');
 *
 *   // at the top of main() after parseArgs()
 *   if (args.silent || args.agent) enableSilentMode(true);
 *
 *   // replace all console.log / console.warn with:
 *   AgentOutput.info('message');
 *   AgentOutput.warn('warning');
 *
 *   // in the JSON output branch:
 *   if (args.json || args.agent) {
 *     const payload = args.agent ? transformForAgentMode(result, args) : result;
 *     AgentOutput.emit(payload, { outPath: args.out, pretty: !isSilent() });
 *   }
 */

'use strict';

const fs = require('fs');

const DELIMITER_START = '<<<AGENT_JSON_START>>>';
const DELIMITER_END   = '<<<AGENT_JSON_END>>>';
const SCHEMA_VERSION  = 'agent-ready-v2.1.0';

let _silent = false;
let _outputWritten = false;

function enableSilentMode(v = true) {
  _silent = !!v;
}

function isSilent() {
  return _silent;
}

/**
 * Safe console wrappers that respect silent mode.
 * ALWAYS write to stderr for errors so stdout stays pure.
 */
const AgentOutput = {
  info(...args) {
    if (!_silent) console.log(...args);
  },
  warn(...args) {
    if (!_silent) console.warn(...args);
  },
  error(...args) {
    // errors always go to stderr regardless of silent mode
    console.error(...args);
  },

  /**
   * Emit the final deterministic JSON payload.
   *
   * @param {object} payload   The data object to serialize.
   * @param {object} opts
   * @param {string|null} opts.outPath   File path to write pretty JSON.
   * @param {boolean}     opts.pretty    Whether to pretty-print to stdout (default !silent).
   * @param {boolean}     opts.delimit   Wrap stdout line in delimiters (default true).
   */
  emit(payload, opts = {}) {
    if (_outputWritten) {
      AgentOutput.error('AgentOutput.emit() called more than once — payload already written.');
      return;
    }
    _outputWritten = true;

    const outPath = opts.outPath || null;
    const delimit = opts.delimit !== false;
    const pretty  = opts.pretty  !== false && !_silent;

    // Inject schema discriminator so consumers know which parser to use
    const enriched = {
      ...payload,
      _parserMeta: {
        schemaVersion: SCHEMA_VERSION,
        emittedAt: new Date().toISOString(),
        deterministic: true,
      }
    };

    const compact = JSON.stringify(enriched);
    const spaced  = JSON.stringify(enriched, null, 2);

    if (outPath) {
      try {
        fs.writeFileSync(outPath, spaced);
        if (!_silent) console.log(`✅ Saved JSON to ${outPath}`);
      } catch (e) {
        AgentOutput.error(`Failed writing ${outPath}: ${e.message}`);
      }
    }

    if (delimit) {
      console.log(DELIMITER_START);
      console.log(compact);
      console.log(DELIMITER_END);
    } else if (pretty) {
      console.log(spaced);
    } else {
      console.log(compact);
    }
  },

  DELIMITER_START,
  DELIMITER_END,
  SCHEMA_VERSION,
};

/**
 * Backward-compatible heuristic for scripts that still use raw console.log.
 * Scans a string (chunk of stdout) and returns the first valid JSON object.
 *
 * Strategy (in order of preference):
 *   1. Delimited extraction   — search for DELIMITER_START … DELIMITER_END.
 *   2. Line-stream parsing    — try JSON.parse() on every line.
 *   3. Bracket-depth recovery — walk char-by-char tracking {} depth.
 *
 * @param {string} text  Raw stdout/stderr text.
 * @returns {object|null} Parsed payload or null.
 */
function extractPayload(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Delimited extraction (fastest, deterministic)
  const startIdx = text.indexOf(DELIMITER_START);
  const endIdx   = text.indexOf(DELIMITER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonSlice = text
      .slice(startIdx + DELIMITER_START.length, endIdx)
      .replace(/^\s*\n/, '')
      .replace(/\n\s*$/, '');
    try {
      return JSON.parse(jsonSlice);
    } catch (_) { /* fall through */ }
  }

  // 2. Line-stream parsing (for compact single-line JSON without delimiters)
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed[0] !== '{' && trimmed[0] !== '[') continue;
    try {
      return JSON.parse(trimmed);
    } catch (_) { /* next line */ }
  }

  // 3. Bracket-depth recovery (last resort for pretty-printed mixed output)
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          // reject trivial objects that are clearly log fragments
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 2) {
            return parsed;
          }
        } catch (_) { /* continue scanning */ }
        start = -1;
      }
    }
  }

  return null;
}

module.exports = {
  AgentOutput,
  enableSilentMode,
  isSilent,
  extractPayload,
  DELIMITER_START,
  DELIMITER_END,
  SCHEMA_VERSION,
};
