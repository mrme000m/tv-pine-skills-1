/**
 * TradingView API - JavaScript Implementation
 * A library to interact with TradingView's websocket API for real-time market data and indicators.
 * 
 * @module tradingview-api
 * @version 1.0.0
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const zlib = require('zlib');

// Lazy-load optional WebSocket dependencies (only needed for real-time Client)
let _ws, _socksProxyAgent;
function _requireWebSocket() {
  if (!_ws) {
    try { _ws = require('ws'); } catch (e) {
      throw new Error('WebSocket support requires "ws" package: npm install ws');
    }
  }
  return _ws;
}
function _requireSocksProxyAgent() {
  if (!_socksProxyAgent) {
    try { _socksProxyAgent = require('socks-proxy-agent'); } catch (e) {
      throw new Error('SOCKS proxy support requires "socks-proxy-agent" package: npm install socks-proxy-agent');
    }
  }
  return _socksProxyAgent;
}

// ============================================================================
// UTILS
// ============================================================================

function genSessionId(prefix = "xs") {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomStr = '';
  for (let i = 0; i < 12; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${randomStr}`;
}

function extractCookieValue(inputStr = "", cookieName = "") {
  if (!inputStr) return "";
  
  if (inputStr.includes(`${cookieName}=`)) {
    const match = inputStr.match(new RegExp(`${cookieName}=([^;\\s]+)`));
    return match ? match[1] : "";
  }
  
  return String(inputStr);
}

function genAuthCookies(sessionId = "", signature = "") {
  const sid = extractCookieValue(sessionId, "sessionid");
  const sig = extractCookieValue(signature, "sessionid_sign");
  
  if (!sid) return "";
  if (!sig) return `sessionid=${sid}`;
  return `sessionid=${sid};sessionid_sign=${sig}`;
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options
    };
    
    if (options.agent) {
      reqOptions.agent = options.agent;
    }
    
    const req = lib.request(parsedUrl, reqOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data,
          cookies: res.headers['set-cookie'] || []
        });
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// ============================================================================
// CONFIG
// ============================================================================

const _config = {
  debug: false
};

function setDebug(value) {
  if (typeof value !== 'boolean') {
    throw new TypeError("Debug value must be a boolean");
  }
  _config.debug = value;
}

function isDebugEnabled() {
  return _config.debug;
}

// ============================================================================
// ERRORS
// ============================================================================

class TradingViewAPIError extends Error {
  constructor(message, errorType = "unknown", details = null) {
    super(message);
    this.name = this.constructor.name;
    this.type = errorType;
    this.details = details;
  }
}

class ConnectionError extends TradingViewAPIError {
  constructor(message, details = null) {
    super(message, "connection", details);
  }
}

class ProtocolError extends TradingViewAPIError {
  constructor(message, details = null) {
    super(message, "protocol", details);
  }
}

class ValidationError extends TradingViewAPIError {
  constructor(message, field = null, details = null) {
    super(message, "validation", details);
    this.field = field;
  }
}

class AuthenticationError extends TradingViewAPIError {
  constructor(message, details = null) {
    super(message, "authentication", details);
  }
}

class SymbolError extends TradingViewAPIError {
  constructor(message, symbol = null, details = null) {
    super(message, "symbol", details);
    this.symbol = symbol;
  }
}

class IndicatorError extends TradingViewAPIError {
  constructor(message, indicatorId = null, details = null) {
    super(message, "indicator", details);
    this.indicatorId = indicatorId;
  }
}

class SessionError extends TradingViewAPIError {
  constructor(message, details = null) {
    super(message, "session", details);
  }
}

// ============================================================================
// PROTOCOL
// ============================================================================

class Protocol {
  static cleanerRgx = /~h~/g;
  static splitterRgx = /~m~\d+~m~/;
  
  static parseWSPacket(data) {
    const cleaned = data.replace(Protocol.cleanerRgx, "");
    const parts = cleaned.split(Protocol.splitterRgx);
    
    const result = [];
    for (const part of parts) {
      if (!part) continue;
      try {
        result.push(JSON.parse(part));
      } catch (e) {
        if (isDebugEnabled()) {
          console.warn(`ProtocolError: Failed to parse WebSocket chunk: ${e.message}`);
          console.warn(`Chunk preview: ${part.substring(0, 200)}`);
        }
        if (/^\d+$/.test(part)) {
          result.push(parseInt(part, 10));
        }
      }
    }
    return result;
  }
  
  static formatWSPacket(packet) {
    const msg = typeof packet === 'object' ? JSON.stringify(packet) : String(packet);
    return `~m~${msg.length}~m~${msg}`;
  }
  
  static async parseCompressed(data) {
    try {
      const buffer = Buffer.from(data, 'base64');
      const decompressed = zlib.unzipSync(buffer);
      return JSON.parse(decompressed.toString());
    } catch (e) {
      throw new ProtocolError("Failed to parse compressed data", {
        originalError: e.message,
        dataLength: data ? data.length : 0
      });
    }
  }
}

// ============================================================================
// HTTP / PINE helpers
// ============================================================================

async function getIndicator(id, version = "last", session = "", signature = "") {
  const indicId = id.replace(/[ %]/g, "%25");
  const url = `https://pine-facade.tradingview.com/pine-facade/translate/${indicId}/${version}`;
  
  const headers = { "Origin": "https://www.tradingview.com" };
  if (session || signature) {
    headers["Cookie"] = genAuthCookies(session, signature);
  }
  
  const response = await httpRequest(url, { headers });
  let data;
  
  try {
    data = JSON.parse(response.data);
  } catch (e) {
    throw new Error(`Unexpected response from translate endpoint: ${e.message}\n${response.data.substring(0, 500)}`);
  }
  
  if (typeof data === 'string') {
    throw new Error(`API returned error: ${data}`);
  }
  
  if (!data.success || !data.result?.metaInfo?.inputs) {
    throw new Error(`Inexistent or unsupported indicator: ${data.reason}`);
  }
  
  const meta = data.result.metaInfo;
  const inputs = {};
  
  for (const inp of (meta.inputs || [])) {
    if (['text', 'pineId', 'pineVersion'].includes(inp.id)) continue;
    
    const inlineName = inp.name.replace(/[^a-zA-Z0-9_]/g, '').replace(/ /g, '_');
    inputs[inp.id] = {
      name: inp.name,
      inline: inp.inline || inlineName,
      internalID: inp.internalID || inlineName,
      tooltip: inp.tooltip,
      type: inp.type,
      value: inp.defval,
      isHidden: Boolean(inp.isHidden),
      isFake: Boolean(inp.isFake)
    };
    
    if (inp.options) {
      inputs[inp.id].options = inp.options;
    }
  }
  
  const plots = {};
  for (const [pid, style] of Object.entries(meta.styles || {})) {
    let title = style.title.replace(/[^a-zA-Z0-9_]/g, '').replace(/ /g, '_');
    if (Object.values(plots).includes(title)) {
      let i = 2;
      const base = title;
      while (Object.values(plots).includes(`${base}_${i}`)) {
        i++;
      }
      title = `${base}_${i}`;
    }
    plots[pid] = title;
  }
  
  for (const p of (meta.plots || [])) {
    if (!p.target) continue;
    const parent = plots[p.target] || p.target;
    plots[p.id] = `${parent}_${p.type}`;
  }
  
  const options = {
    pineId: meta.scriptIdPart || indicId,
    pineVersion: meta.pine?.version || version,
    description: meta.description,
    shortDescription: meta.shortDescription,
    inputs,
    plots,
    script: data.result?.ilTemplate || ""
  };
  
  return new PineIndicator(options);
}

async function loginUser(username, password, remember = true, UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36") {
  const loginPageUrl = "https://www.tradingview.com/";
  const headers = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };
  
  let response = await httpRequest(loginPageUrl, { headers });
  
  const csrfMatch = response.cookies.find(c => c.startsWith('csrftoken='));
  const csrfToken = csrfMatch ? csrfMatch.split('=')[1].split(';')[0] : '';
  
  const payload = new URLSearchParams({
    username,
    password,
    ...(remember && { remember: 'on' })
  });
  
  const loginHeaders = {
    "referer": "https://www.tradingview.com/",
    "origin": "https://www.tradingview.com",
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": UA,
    "X-CSRFToken": csrfToken
  };
  
  response = await httpRequest("https://www.tradingview.com/accounts/signin/", {
    method: 'POST',
    headers: loginHeaders,
    body: payload.toString()
  });
  
  const sessionCookie = response.cookies.find(c => c.startsWith('sessionid='));
  const signatureCookie = response.cookies.find(c => c.startsWith('sessionid_sign='));
  
  const session = sessionCookie ? sessionCookie.split('=')[1].split(';')[0] : '';
  const signatureVal = signatureCookie ? signatureCookie.split('=')[1].split(';')[0] : '';
  
  if (!session) {
    throw new Error(`Login failed: ${response.data.substring(0, 500)}`);
  }
  
  return { session, signature: signatureVal };
}

async function getUser(session, signature = "", location = "https://www.tradingview.com/", _redirectDepth = 0) {
  const maxRedirects = 10;
  if (_redirectDepth > maxRedirects) {
    throw new Error("Too many redirects while fetching TradingView user");
  }
  
  const headers = {
    "Cookie": genAuthCookies(session, signature),
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  };
  
  const response = await httpRequest(location, { headers });
  
  if (response.data.includes("auth_token")) {
    const parseIntSafe = (s, def = 0) => {
      const val = parseInt(s, 10);
      return isNaN(val) ? def : val;
    };
    
    const parseFloatSafe = (s, def = 0) => {
      const val = parseFloat(s);
      return isNaN(val) ? def : val;
    };
    
    const idMatch = response.data.match(/"id":([0-9]{1,10}),/);
    const usernameMatch = response.data.match(/"username":"(.*?)"/);
    const firstNameMatch = response.data.match(/"first_name":"(.*?)"/);
    const lastNameMatch = response.data.match(/"last_name":"(.*?)"/);
    const reputationMatch = response.data.match(/"reputation":(.*?),/);
    const followingMatch = response.data.match(/,"following":([0-9]*?),/);
    const followersMatch = response.data.match(/,"followers":([0-9]*?),/);
    const sessionHashMatch = response.data.match(/"session_hash":"(.*?)"/);
    const privateChannelMatch = response.data.match(/"private_channel":"(.*?)"/);
    const authTokenMatch = response.data.match(/"auth_token":"(.*?)"/);
    const dateJoinedMatch = response.data.match(/"date_joined":"(.*?)"/);
    
    return {
      id: parseIntSafe(idMatch?.[1]),
      username: usernameMatch?.[1] || "",
      firstName: firstNameMatch?.[1] || "",
      lastName: lastNameMatch?.[1] || "",
      reputation: parseFloatSafe(reputationMatch?.[1]),
      following: parseIntSafe(followingMatch?.[1]),
      followers: parseIntSafe(followersMatch?.[1]),
      session,
      signature,
      sessionHash: sessionHashMatch?.[1] || "",
      privateChannel: privateChannelMatch?.[1] || "",
      authToken: authTokenMatch?.[1] || "",
      joinDate: dateJoinedMatch?.[1] ? new Date(dateJoinedMatch[1]) : new Date()
    };
  }
  
  if ([301, 302, 307, 308].includes(response.status) && response.headers.location) {
    const newLocation = response.headers.location;
    if (newLocation !== location) {
      return await getUser(session, signature, newLocation, _redirectDepth + 1);
    }
  }
  
  throw new AuthenticationError("Wrong or expired sessionid/signature");
}

async function searchMarketV3(search, filterType = "", offset = 0) {
  const splittedSearch = search.toUpperCase().replace(/ /g, "+").split(":");
  
  const params = new URLSearchParams({
    text: splittedSearch[splittedSearch.length - 1],
    start: offset
  });
  
  if (filterType) params.set("search_type", filterType);
  if (splittedSearch.length === 2) params.set("exchange", splittedSearch[0]);
  
  const headers = { "Origin": "https://www.tradingview.com" };
  const response = await httpRequest(
    `https://symbol-search.tradingview.com/symbol_search/v3?${params}`,
    { headers }
  );
  
  const data = JSON.parse(response.data);
  const results = [];
  
  for (const s of (data.symbols || [])) {
    const exchange = (s.exchange || "").split(" ")[0];
    const prefix = s.prefix;
    const symbol = s.symbol || "";
    const idStr = prefix ? `${prefix}:${symbol}` : `${exchange.toUpperCase()}:${symbol}`;
    
    results.push({
      id: idStr,
      exchange,
      fullExchange: s.exchange || "",
      symbol,
      description: s.description || "",
      type: s.type || "",
      getTA: () => getTA(idStr)
    });
  }
  
  return results;
}

async function getTA(id) {
  const indicators = ["Recommend.Other", "Recommend.All", "Recommend.MA"];
  const cols = [];
  
  for (const t of ["1", "5", "15", "60", "240", "1D", "1W", "1M"]) {
    for (const i of indicators) {
      cols.push(t === "1D" ? i : `${i}|${t}`);
    }
  }
  
  const response = await httpRequest("https://scanner.tradingview.com/global/scan", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: [id] },
      columns: cols
    })
  });
  
  const data = JSON.parse(response.data);
  if (!data.data?.[0]) return {};
  
  const advice = {};
  const values = data.data[0].d || [];
  
  for (let i = 0; i < values.length; i++) {
    const col = cols[i];
    const parts = col.split("|");
    const name = parts[0];
    const period = parts[1] || "1D";
    
    if (!advice[period]) advice[period] = {};
    advice[period][name.split(".").pop()] = Math.round(values[i] * 1000) / 500;
  }
  
  return advice;
}

// ============================================================================
// PINE FACADE CLIENT
// ============================================================================

class PineFacadeClient {
  constructor({
    sessionId = "",
    signature = "",
    baseUrl = "https://pine-facade.tradingview.com/pine-facade",
    timeout = 120000,
    userName = ""
  } = {}) {
    this.sessionId = sessionId;
    this.signature = signature;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout;
    this.userName = userName;
  }
  
  _headers() {
    const headers = {
      "Origin": "https://www.tradingview.com",
      "Referer": "https://www.tradingview.com/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "X-Requested-With": "XMLHttpRequest"
    };
    
    if (this.sessionId || this.signature) {
      headers["Cookie"] = genAuthCookies(this.sessionId, this.signature);
    }
    
    return headers;
  }
  
  async compile(source, user = "") {
    const url = `${this.baseUrl}/translate_light?v=3${user ? `&user_name=${user}` : ''}`;
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36);
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\n${source}\r\n--${boundary}--`;
    
    const headers = {
      ...this._headers(),
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    };
    
    const response = await httpRequest(url, {
      method: 'POST',
      headers,
      body
    });
    
    try {
      return JSON.parse(response.data);
    } catch {
      return { raw: response.data };
    }
  }
  
  async saveNew(source, name, user = "") {
    if (!user) throw new Error("save_new requires a user name");
    
    const url = `${this.baseUrl}/save/new?name=${encodeURIComponent(name)}&user_name=${user}&allow_overwrite=true`;
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36);
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\n${source}\r\n--${boundary}--`;
    
    const headers = {
      ...this._headers(),
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    };
    
    const response = await httpRequest(url, {
      method: 'POST',
      headers,
      body
    });
    
    try {
      return JSON.parse(response.data);
    } catch {
      return { raw: response.data };
    }
  }
  
  async saveNext(pineId, source, user = "") {
    if (!user) throw new Error("save_next requires a user name");
    
    const pine = pineId.replace(/%3B/g, ';');
    const url = `${this.baseUrl}/save/next/${encodeURIComponent(pine)}?user_name=${user}`;
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36);
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\n${source}\r\n--${boundary}--`;
    
    const headers = {
      ...this._headers(),
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    };
    
    const response = await httpRequest(url, {
      method: 'POST',
      headers,
      body
    });
    
    try {
      return JSON.parse(response.data);
    } catch {
      return { raw: response.data };
    }
  }
  
  async delete(pineId, user = "") {
    if (!user) throw new Error("delete requires a user name");
    
    const pine = pineId.replace(/%3B/g, ';');
    const url = `${this.baseUrl}/delete/${encodeURIComponent(pine)}?user_name=${user}`;
    
    const response = await httpRequest(url, {
      method: 'POST',
      headers: this._headers()
    });
    
    try {
      return JSON.parse(response.data);
    } catch {
      return response.data;
    }
  }
  
  async listSaved() {
    const url = `${this.baseUrl}/list?filter=saved`;
    const response = await httpRequest(url, { headers: this._headers() });
    
    try {
      return JSON.parse(response.data);
    } catch {
      return response.data;
    }
  }
  
  async fetch(pineId, version = null) {
    const pine = pineId.replace(/%3B/g, ';');
    const target = version || 'last';
    const url = `${this.baseUrl}/translate/${encodeURIComponent(pine)}/${encodeURIComponent(target)}`;
    
    const response = await httpRequest(url, { headers: this._headers() });
    
    let data;
    try {
      data = JSON.parse(response.data);
    } catch {
      data = response.data;
    }
    
    return this._parseFetchResponse(data);
  }
  
  async get(pineId, version = null) {
    const pine = pineId.replace(/%3B/g, ';');
    let resolvedVersion = version && version !== '-1' ? version : null;
    
    if (!resolvedVersion) {
      resolvedVersion = await this._resolveLatestVersion(pine);
    }
    
    const targetVersion = resolvedVersion || 'last';
    
    if (resolvedVersion) {
      const result = await this._tryGetVersion(pine, resolvedVersion);
      if (result?.source) return result;
    }
    
    return await this.fetch(pineId, targetVersion);
  }
  
  async _resolveLatestVersion(pineId) {
    try {
      const url = `${this.baseUrl}/versions/${encodeURIComponent(pineId)}`;
      const response = await httpRequest(url, { headers: this._headers() });
      
      if (response.status !== 200) return null;
      
      const data = JSON.parse(response.data);
      const versions = this._normalizeVersionEntries(data);
      const candidates = versions.map(e => this._extractVersionFromEntry(e)).filter(v => v);
      
      return this._chooseHighestVersion(candidates);
    } catch {
      return null;
    }
  }
  
  _normalizeVersionEntries(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object') {
      if (Array.isArray(data.versions)) return data.versions;
      if (Array.isArray(data.result?.versions)) return data.result.versions;
      if (Array.isArray(data.data)) return data.data;
    }
    return [];
  }
  
  _extractVersionFromEntry(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
      return entry.version || entry.result?.version || entry.metaInfo?.version || 
             entry.scriptVersion || entry.sourceVersion || null;
    }
    return null;
  }
  
  _chooseHighestVersion(versions) {
    let best = null;
    for (const candidate of versions) {
      if (!candidate) continue;
      if (!best || this._compareVersions(candidate, best) > 0) {
        best = candidate;
      }
    }
    return best;
  }
  
  _compareVersions(a, b) {
    const normalize = v => String(v || '').trim();
    const toParts = value => normalize(value).split('.').map(p => /^\d+$/.test(p) ? parseInt(p, 10) : 0);
    
    const aParts = toParts(a);
    const bParts = toParts(b);
    const maxLen = Math.max(aParts.length, bParts.length);
    
    for (let i = 0; i < maxLen; i++) {
      const aVal = i < aParts.length ? aParts[i] : 0;
      const bVal = i < bParts.length ? bParts[i] : 0;
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
    }
    return 0;
  }
  
  async _tryGetVersion(pineId, version) {
    const url = `${this.baseUrl}/get/${encodeURIComponent(pineId)}/${encodeURIComponent(version)}`;
    
    try {
      const response = await httpRequest(url, { headers: this._headers() });
      if (response.status !== 200) return null;
      
      let data;
      try {
        data = JSON.parse(response.data);
      } catch {
        data = response.data;
      }
      
      const result = this._parseFetchResponse(data);
      if (result.source) return result;
      
      const meta = result.meta;
      if (meta?.version && meta.version !== version) {
        const url2 = `${this.baseUrl}/get/${encodeURIComponent(pineId)}/${encodeURIComponent(meta.version)}`;
        const response2 = await httpRequest(url2, { headers: this._headers() });
        
        if (response2.status === 200) {
          let data2;
          try {
            data2 = JSON.parse(response2.data);
          } catch {
            data2 = response2.data;
          }
          
          const result2 = this._parseFetchResponse(data2);
          if (result2.source) return result2;
        }
      }
    } catch {
      return null;
    }
    
    return null;
  }
  
  _parseFetchResponse(data) {
    if (typeof data === 'string') {
      return { source: data, meta: null };
    }
    
    if (typeof data === 'object' && data !== null) {
      const source = data.source || data.scriptSource || data.result?.scriptSource || '';
      let meta = null;
      
      if (data.metaInfo || data.result?.metaInfo) {
        meta = data.metaInfo || data.result.metaInfo;
      }
      
      return { source, meta };
    }
    
    return { source: '', meta: null };
  }
}

// ============================================================================
// INDICATORS
// ============================================================================

class PineIndicator {
  constructor(options) {
    this._options = options;
    this._type = "Script@tv-scripting-101!";
  }
  
  get pineId() { return this._options.pineId || ""; }
  get pineVersion() { return this._options.pineVersion || ""; }
  get description() { return this._options.description || ""; }
  get shortDescription() { return this._options.shortDescription || ""; }
  get inputs() { return this._options.inputs || {}; }
  get plots() { return this._options.plots || {}; }
  get script() { return this._options.script || ""; }
  get type() { return this._type; }
  
  setType(indicatorType = "Script@tv-scripting-101!") {
    this._type = indicatorType;
  }
  
  setOption(key, value) {
    let propId = "";
    
    if (`in_${key}` in this.inputs) {
      propId = `in_${key}`;
    } else if (key in this.inputs) {
      propId = key;
    } else {
      for (const [inputId, inputData] of Object.entries(this.inputs)) {
        if (inputData.inline === key || inputData.internalID === key) {
          propId = inputId;
          break;
        }
      }
    }
    
    if (!propId || !(propId in this.inputs)) {
      throw new Error(`Input '${key}' not found`);
    }
    
    const inputDef = this.inputs[propId];
    
    const types = {
      bool: "Boolean", boolean: "Boolean",
      integer: "Number", int: "Number", float: "Number",
      text: "String", string: "String"
    };
    
    const expectedType = types[inputDef.type];
    if (expectedType) {
      const actualType = typeof value;
      let typeValid = false;
      
      if (expectedType === "Boolean" && typeof value === 'boolean') typeValid = true;
      else if (expectedType === "Number" && typeof value === 'number') typeValid = true;
      else if (expectedType === "String" && typeof value === 'string') typeValid = true;
      
      if (!typeValid) {
        throw new TypeError(`Input '${inputDef.name}' (${propId}) must be a ${expectedType}!`);
      }
    }
    
    if (inputDef.options && !inputDef.options.includes(value)) {
      throw new Error(`Input '${inputDef.name}' (${propId}) must be one of these values: ${inputDef.options.join(', ')}`);
    }
    
    inputDef.value = value;
  }
}

class BuiltInIndicator {
  static DEFAULT_VALUES = {
    "Volume@tv-basicstudies-241": {
      length: 20,
      col_prev_close: false
    },
    "VbPFixed@tv-basicstudies-241": {
      rowsLayout: "Number Of Rows",
      rows: 24,
      volume: "Up/Down",
      vaVolume: 70,
      subscribeRealtime: false,
      first_bar_time: NaN,
      last_bar_time: null,
      extendToRight: false,
      mapRightBoundaryToBarStartTime: true
    }
  };
  
  constructor(indicatorType) {
    if (!indicatorType) {
      throw new Error(`Wrong built-in indicator type '${indicatorType}'`);
    }
    
    this._type = indicatorType;
    this._options = { ...(BuiltInIndicator.DEFAULT_VALUES[indicatorType] || {}) };
  }
  
  get type() { return this._type; }
  get options() { return this._options; }
  
  setOption(key, value, force = false) {
    if (force) {
      this._options[key] = value;
      return;
    }
    
    const defaults = BuiltInIndicator.DEFAULT_VALUES[this._type] || {};
    
    if (key in defaults) {
      const requiredType = typeof defaults[key];
      let convertedValue = value;
      
      if (requiredType === 'number' && typeof value === 'number' && Number.isInteger(defaults[key]) === false) {
        convertedValue = parseFloat(value);
      }
      
      if (typeof convertedValue !== requiredType && !(requiredType === 'number' && typeof value === 'number')) {
        if (!(typeof defaults[key] === 'number' && typeof value === 'number' && isNaN(value))) {
          throw new TypeError(`Wrong '${key}' value type '${typeof value}' (must be '${requiredType}')`);
        }
      }
    } else if (Object.keys(defaults).length > 0) {
      throw new Error(`Option '${key}' is denied with '${this._type}' indicator`);
    }
    
    this._options[key] = value;
  }
}

// ============================================================================
// CHART STUDY
// ============================================================================

function parseTrades(trades) {
  const result = [];
  for (const trade of [...trades].reverse()) {
    result.push({
      entry: {
        name: trade.e?.c || "",
        type: trade.e?.tp?.[0] === "s" ? "short" : "long",
        value: trade.e?.p || 0,
        time: trade.e?.tm || 0
      },
      exit: {
        name: trade.x?.c || "",
        value: trade.x?.p || 0,
        time: trade.x?.tm || 0
      },
      quantity: trade.q || 0,
      profit: trade.tp || {},
      cumulative: trade.cp || {},
      runup: trade.rn || {},
      drawdown: trade.dd || {}
    });
  }
  return result;
}

class ChartStudy {
  constructor(chartSession, indicator) {
    if (!(indicator instanceof PineIndicator || indicator instanceof BuiltInIndicator)) {
      throw new IndicatorError(
        "Indicator argument must be an instance of PineIndicator or BuiltInIndicator. " +
        "Please use 'getIndicator(...)' function.",
        null,
        { receivedType: typeof indicator }
      );
    }
    
    this._studId = genSessionId("st");
    this._chartSession = chartSession;
    this.instance = indicator;
    this._periods = {};
    this._cachedPeriods = null;
    this._periodsModified = false;
    this._indexes = [];
    this._graphic = {};
    this._strategyReport = {
      trades: [],
      history: {},
      performance: {}
    };
    this._callbacks = {
      studyCompleted: [],
      update: [],
      error: [],
      event: []
    };
    
    chartSession.studyListeners[this._studId] = this._onData.bind(this);
    
    const inputs = this._getInputs(indicator);
    chartSession.send("create_study", [
      chartSession.sessionID,
      this._studId,
      "st1",
      "s1",
      indicator.type,
      inputs
    ]);
  }
  
  _getInputs(indicator) {
    if (indicator instanceof PineIndicator) {
      const pineInputs = { text: indicator.script };
      
      if (indicator.pineId) pineInputs.pineId = indicator.pineId;
      if (indicator.pineVersion) pineInputs.pineVersion = indicator.pineVersion;
      
      for (const [inputId, inputData] of Object.entries(indicator.inputs)) {
        if (["pineFeatures", "__profile"].includes(inputId)) continue;
        
        let value = inputData.value;
        if (inputData.type === "color") {
          value = Object.keys(indicator.inputs).indexOf(inputId);
        }
        
        pineInputs[inputId] = {
          v: value,
          f: inputData.isFake || false,
          t: inputData.type
        };
      }
      
      return pineInputs;
    }
    
    return indicator.options;
  }
  
  _onData(packet) {
    if (packet.type === "study_completed") {
      this._triggerEvent("studyCompleted");
      this._triggerEvent("event", "studyCompleted");
      return;
    }
    
    if (["timescale_update", "du"].includes(packet.type)) {
      const changes = [];
      const data = packet.data[1][this._studId] || {};
      
      if (data.st) {
        for (const p of data.st) {
          const period = {};
          
          for (let i = 0; i < p.v.length; i++) {
            if (!this.instance.plots || Object.keys(this.instance.plots).length === 0) {
              const plotName = i === 0 ? "$time" : `plot_${i - 1}`;
              period[plotName] = p.v[i];
            } else {
              const plotName = i === 0 ? "$time" : this.instance.plots[`plot_${i - 1}`];
              if (plotName && !(plotName in period)) {
                period[plotName] = p.v[i];
              } else {
                period[`plot_${i - 1}`] = p.v[i];
              }
            }
          }
          
          this._periods[p.v[0]] = period;
        }
        
        this._periodsModified = true;
        changes.push("plots");
      }
      
      const ns = data.ns || {};
      if (ns.d) {
        const rawData = ns.d;
        let parsed;
        
        try {
          parsed = JSON.parse(rawData);
        } catch {
          parsed = null;
        }
        
        if (parsed) {
          if (parsed.graphicsCmds) {
            const cmds = parsed.graphicsCmds;
            
            if (cmds.erase) {
              for (const instr of cmds.erase) {
                if (instr.action === "all") {
                  if (!instr.type) {
                    for (const drawType of Object.keys(this._graphic)) {
                      this._graphic[drawType] = {};
                    }
                  } else {
                    delete this._graphic[instr.type];
                  }
                  continue;
                }
                
                if (instr.action === "one") {
                  if (this._graphic[instr.type]) {
                    delete this._graphic[instr.type][instr.id];
                  }
                }
              }
            }
            
            if (cmds.create) {
              for (const [drawType, groups] of Object.entries(cmds.create)) {
                if (!this._graphic[drawType]) this._graphic[drawType] = {};
                for (const group of groups) {
                  for (const item of (group.data || [])) {
                    this._graphic[drawType][item.id] = item;
                  }
                }
              }
            }
            
            changes.push("graphic");
          }
          
          if (parsed.report) {
            const report = parsed.report;
            if (report.currency) {
              this._strategyReport.currency = report.currency;
              changes.push("report.currency");
            }
            if (report.settings) {
              this._strategyReport.settings = report.settings;
              changes.push("report.settings");
            }
            if (report.performance) {
              this._strategyReport.performance = report.performance;
              changes.push("report.perf");
            }
            if (report.trades) {
              this._strategyReport.trades = parseTrades(report.trades);
              changes.push("report.trades");
            }
            if (report.equity) {
              this._strategyReport.history = {
                buyHold: report.buyHold,
                buyHoldPercent: report.buyHoldPercent,
                drawDown: report.drawDown,
                drawDownPercent: report.drawDownPercent,
                equity: report.equity,
                equityPercent: report.equityPercent
              };
              changes.push("report.history");
            }
          }
        }
      }
      
      let compressedData = ns.dCompressed;
      if (!compressedData && ns.d) {
        try {
          const dParsed = JSON.parse(ns.d);
          if (dParsed?.dataCompressed) {
            compressedData = dParsed.dataCompressed;
          }
        } catch {}
      }
      
      if (compressedData) {
        (async () => {
          try {
            const parsed = await Protocol.parseCompressed(compressedData);
            if (parsed?.report) {
              const report = parsed.report;
              if (report.currency) this._strategyReport.currency = report.currency;
              if (report.settings) this._strategyReport.settings = report.settings;
              if (report.performance) this._strategyReport.performance = report.performance;
              if (report.trades) this._strategyReport.trades = parseTrades(report.trades);
              if (report.equity) {
                this._strategyReport.history = {
                  buyHold: report.buyHold,
                  buyHoldPercent: report.buyHoldPercent,
                  drawDown: report.drawDown,
                  drawDownPercent: report.drawDownPercent,
                  equity: report.equity,
                  equityPercent: report.equityPercent
                };
              }
              this._triggerEvent("update", ["report.compressed"]);
            }
          } catch (e) {
            if (isDebugEnabled()) {
              console.error(`Error processing compressed data: ${e.message}`);
            }
          }
        })();
      }
      
      if (ns.indexes && (Array.isArray(ns.indexes) || typeof ns.indexes === 'object')) {
        this._indexes = ns.indexes;
      }
      
      this._triggerEvent("update", changes);
      this._triggerEvent("event", "update", changes);
      return;
    }
    
    if (packet.type === "study_error") {
      const error = new IndicatorError(
        packet.data[3] || "Study error",
        this.instance.pineId,
        packet.data[4]
      );
      this._triggerEvent("error", error);
      this._triggerEvent("event", "error", error);
    }
  }
  
  _triggerEvent(event, ...args) {
    for (const callback of (this._callbacks[event] || [])) {
      try {
        callback(...args);
      } catch (e) {
        if (isDebugEnabled()) {
          console.error(`Error in callback: ${e.message}`);
        }
      }
    }
  }
  
  get periods() {
    if (this._periodsModified || !this._cachedPeriods) {
      this._cachedPeriods = Object.values(this._periods).sort((a, b) => b.$time - a.$time);
      this._periodsModified = false;
    }
    return this._cachedPeriods;
  }
  
  get graphic() {
    return this._graphic;
  }
  
  get strategyReport() {
    return this._strategyReport;
  }
  
  setIndicator(indicator) {
    if (!(indicator instanceof PineIndicator || indicator instanceof BuiltInIndicator)) {
      throw new IndicatorError(
        "Indicator argument must be an instance of PineIndicator or BuiltInIndicator.",
        null,
        { receivedType: typeof indicator }
      );
    }
    
    this.instance = indicator;
    const inputs = this._getInputs(indicator);
    
    this._chartSession.send("modify_study", [
      this._chartSession.sessionID,
      this._studId,
      "st1",
      inputs
    ]);
  }
  
  onReady(callback) {
    this._callbacks.studyCompleted.push(callback);
    return () => this._removeCallback("studyCompleted", callback);
  }
  
  onUpdate(callback) {
    this._callbacks.update.push(callback);
    return () => this._removeCallback("update", callback);
  }
  
  onError(callback) {
    this._callbacks.error.push(callback);
    return () => this._removeCallback("error", callback);
  }
  
  onEvent(callback) {
    this._callbacks.event.push(callback);
    return () => this._removeCallback("event", callback);
  }
  
  _removeCallback(event, callback) {
    const idx = this._callbacks[event].indexOf(callback);
    if (idx !== -1) {
      this._callbacks[event].splice(idx, 1);
    }
  }
  
  remove() {
    this._chartSession.send("remove_study", [
      this._chartSession.sessionID,
      this._studId
    ]);
    delete this._chartSession.studyListeners[this._studId];
  }
}

// ============================================================================
// CHART SESSION
// ============================================================================

class ChartSession {
  static CHART_TYPES = {
    HeikinAshi: "BarSetHeikenAshi@tv-basicstudies-60!",
    Renko: "BarSetRenko@tv-prostudies-40!",
    LineBreak: "BarSetPriceBreak@tv-prostudies-34!",
    Kagi: "BarSetKagi@tv-prostudies-34!",
    PointAndFigure: "BarSetPnF@tv-prostudies-34!",
    Range: "BarSetRange@tv-basicstudies-72!"
  };
  
  constructor(client) {
    this._chartSessionId = genSessionId("cs");
    this._replaySessionId = genSessionId("rs");
    this._client = client;
    this.studyListeners = {};
    this._periods = {};
    this._cachedPeriods = null;
    this._periodsModified = false;
    this._infos = {};
    this._callbacks = {
      symbolLoaded: [],
      update: [],
      error: [],
      event: [],
      replayLoaded: [],
      replayPoint: [],
      replayResolution: [],
      replayEnd: []
    };
    this._seriesCreated = false;
    this._currentSeries = 0;
    this._indexes = {};
    this._replayMode = false;
    this._replayOkCallbacks = {};
    
    client._sessions[this._chartSessionId] = {
      type: "chart",
      onData: this._onData.bind(this)
    };
    
    client._sessions[this._replaySessionId] = {
      type: "replay",
      onData: this._onReplayData.bind(this)
    };
    
    client.send("chart_create_session", [this._chartSessionId]);
  }
  
  get sessionID() { return this._chartSessionId; }
  
  send(...args) {
    this._client.send(...args);
  }
  
  _onData(packet) {
    if (packet.type === "symbol_resolved") {
      this._infos = {
        series_id: packet.data[1],
        ...packet.data[2]
      };
      this._triggerEvent("symbolLoaded");
      this._triggerEvent("event", "symbolLoaded");
      return;
    }
    
    if (["timescale_update", "du"].includes(packet.type)) {
      const changes = [];
      const data = packet.data[1];
      
      for (const key of Object.keys(data)) {
        changes.push(key);
        
        if (key === "$prices" || (data[key]?.s && Array.isArray(data[key].s))) {
          const seriesData = key === "$prices" ? data.$prices : data[key];
          if (seriesData?.s) {
            for (const p of seriesData.s) {
              this._indexes[p.i] = p.v[0];
              this._periods[p.v[0]] = {
                time: p.v[0],
                open: p.v[1],
                close: p.v[4],
                max: p.v[2],
                min: p.v[3],
                volume: Math.round(p.v[5] * 100) / 100
              };
            }
          }
          this._periodsModified = true;
        } else if (key in this.studyListeners) {
          this.studyListeners[key](packet);
        }
      }
      
      this._triggerEvent("update", changes);
      this._triggerEvent("event", "update", changes);
      return;
    }
    
    if (packet.type === "symbol_error") {
      const error = new SymbolError(
        packet.data[2] || "Symbol error",
        packet.data[1]
      );
      this._triggerEvent("error", error);
      this._triggerEvent("event", "error", error);
      return;
    }
    
    if (packet.type === "series_error") {
      const error = new SessionError(packet.data[3] || "Series error");
      this._triggerEvent("error", error);
      this._triggerEvent("event", "error", error);
      return;
    }
    
    if (packet.type === "critical_error") {
      const name = packet.data[1] || "Unknown";
      const description = packet.data[2] || "";
      const error = new SessionError(`Critical error: ${name}`, description);
      this._triggerEvent("error", error);
      this._triggerEvent("event", "error", error);
      return;
    }
    
    if (packet.type === "study_error") {
      const studyId = packet.data[1];
      if (studyId && studyId in this.studyListeners) {
        this.studyListeners[studyId](packet);
      }
      return;
    }
    
    if (packet.type === "study_completed") {
      const studyId = packet.data[1];
      if (studyId && studyId in this.studyListeners) {
        this.studyListeners[studyId](packet);
      }
    }
  }
  
  _onReplayData(packet) {
    if (packet.type === "replay_ok") {
      const reqId = packet.data[1];
      if (reqId && reqId in this._replayOkCallbacks) {
        this._replayOkCallbacks[reqId]();
        delete this._replayOkCallbacks[reqId];
      }
      return;
    }
    
    if (packet.type === "replay_instance_id") {
      this._triggerEvent("replayLoaded", packet.data[1]);
      this._triggerEvent("event", "replayLoaded", packet.data[1]);
      return;
    }
    
    if (packet.type === "replay_point") {
      this._triggerEvent("replayPoint", packet.data[1]);
      this._triggerEvent("event", "replayPoint", packet.data[1]);
      return;
    }
    
    if (packet.type === "replay_resolutions") {
      this._triggerEvent("replayResolution", packet.data[1], packet.data[2]);
      this._triggerEvent("event", "replayResolution", packet.data[1], packet.data[2]);
      return;
    }
    
    if (packet.type === "replay_data_end") {
      this._triggerEvent("replayEnd");
      this._triggerEvent("event", "replayEnd");
      return;
    }
    
    if (packet.type === "critical_error") {
      const name = packet.data[1] || "Unknown";
      const description = packet.data[2] || "";
      const error = new SessionError(`Critical error: ${name}`, description);
      this._triggerEvent("error", error);
      this._triggerEvent("event", "error", error);
    }
  }
  
  _triggerEvent(event, ...args) {
    for (const callback of (this._callbacks[event] || [])) {
      try {
        callback(...args);
      } catch (e) {
        if (isDebugEnabled()) {
          console.error(`Error in callback: ${e.message}`);
        }
      }
    }
  }
  
  get periods() {
    if (this._periodsModified || !this._cachedPeriods) {
      this._cachedPeriods = Object.values(this._periods).sort((a, b) => b.time - a.time);
      this._periodsModified = false;
    }
    return this._cachedPeriods;
  }
  
  get infos() {
    return this._infos;
  }
  
  setMarket(symbol, options = {}) {
    this._periods = {};
    this._periodsModified = true;
    
    if (this._replayMode && !options.replay) {
      this._replayMode = false;
      this._client.send("replay_delete_session", [this._replaySessionId]);
    }
    
    const symbolInit = {
      symbol: symbol || "BTCEUR",
      adjustment: options.adjustment || "splits"
    };
    
    if (options.backadjustment) symbolInit.backadjustment = "default";
    if (options.session) symbolInit.session = options.session;
    if (options.currency) symbolInit['currency-id'] = options.currency;
    
    if (options.replay) {
      if (!this._replayMode) {
        this._replayMode = true;
        this._client.send("replay_create_session", [this._replaySessionId]);
      }
      
      this._client.send("replay_add_series", [
        this._replaySessionId,
        "req_replay_addseries",
        `=${JSON.stringify(symbolInit)}`,
        options.timeframe || "240"
      ]);
      
      this._client.send("replay_reset", [
        this._replaySessionId,
        "req_replay_reset",
        options.replay
      ]);
    }
    
    const chartType = options.type;
    const isComplex = chartType || options.replay;
    
    let chartInit;
    if (isComplex) {
      chartInit = {};
      if (options.replay) chartInit.replay = this._replaySessionId;
      chartInit.symbol = symbolInit;
      if (chartType) {
        chartInit.type = ChartSession.CHART_TYPES[chartType] || chartType;
        if (options.inputs) chartInit.inputs = { ...options.inputs };
      }
    } else {
      chartInit = symbolInit;
    }
    
    this._currentSeries++;
    
    this._client.send("resolve_symbol", [
      this._chartSessionId,
      `ser_${this._currentSeries}`,
      `=${JSON.stringify(chartInit)}`
    ]);
    
    this.setSeries(
      options.timeframe || "240",
      options.range || 100,
      options.to
    );
  }
  
  setSeries(timeframe = "240", rangeVal = 100, reference = null) {
    if (!this._currentSeries) {
      throw new SessionError("Please set the market before setting series");
    }
    
    const calcRange = reference === null ? rangeVal : ["bar_count", reference, rangeVal];
    this._periods = {};
    this._periodsModified = true;
    
    this._client.send(
      this._seriesCreated ? "modify_series" : "create_series",
      [
        this._chartSessionId,
        "s1",
        "s1",
        `ser_${this._currentSeries}`,
        timeframe,
        this._seriesCreated ? "" : calcRange
      ]
    );
    
    this._seriesCreated = true;
  }
  
  setTimezone(timezone) {
    this._periods = {};
    this._periodsModified = true;
    this._client.send("switch_timezone", [this._chartSessionId, timezone]);
  }
  
  fetchMore(number = 1) {
    this._client.send("request_more_data", [this._chartSessionId, "s1", number]);
  }
  
  async replayStep(number = 1) {
    if (!this._replayMode) {
      throw new SessionError("No replay session");
    }
    
    const reqId = genSessionId("rsq_step");
    
    return new Promise((resolve) => {
      this._replayOkCallbacks[reqId] = resolve;
      this._client.send("replay_step", [this._replaySessionId, reqId, number]);
    });
  }
  
  async replayStart(interval = 1000) {
    if (!this._replayMode) {
      throw new SessionError("No replay session");
    }
    
    const reqId = genSessionId("rsq_start");
    
    return new Promise((resolve) => {
      this._replayOkCallbacks[reqId] = resolve;
      this._client.send("replay_start", [this._replaySessionId, reqId, interval]);
    });
  }
  
  async replayStop() {
    if (!this._replayMode) {
      throw new SessionError("No replay session");
    }
    
    const reqId = genSessionId("rsq_stop");
    
    return new Promise((resolve) => {
      this._replayOkCallbacks[reqId] = resolve;
      this._client.send("replay_stop", [this._replaySessionId, reqId]);
    });
  }
  
  async fetchHistory(count = 100, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._removeCallback("update", onUpdate);
        reject(new Error(`Timed out waiting for ${count} bars`));
      }, timeout);
      
      const onUpdate = () => {
        if (this.periods.length >= count) {
          clearTimeout(timer);
          this._removeCallback("update", onUpdate);
          resolve(this.periods.slice(0, count));
        }
      };
      
      this.onUpdate(onUpdate);
    });
  }
  
  onSymbolLoaded(callback) {
    this._callbacks.symbolLoaded.push(callback);
    return () => this._removeCallback("symbolLoaded", callback);
  }
  
  onUpdate(callback) {
    this._callbacks.update.push(callback);
    return () => this._removeCallback("update", callback);
  }
  
  onError(callback) {
    this._callbacks.error.push(callback);
    return () => this._removeCallback("error", callback);
  }
  
  onEvent(callback) {
    this._callbacks.event.push(callback);
    return () => this._removeCallback("event", callback);
  }
  
  onReplayLoaded(callback) {
    this._callbacks.replayLoaded.push(callback);
    return () => this._removeCallback("replayLoaded", callback);
  }
  
  onReplayPoint(callback) {
    this._callbacks.replayPoint.push(callback);
    return () => this._removeCallback("replayPoint", callback);
  }
  
  onReplayResolution(callback) {
    this._callbacks.replayResolution.push(callback);
    return () => this._removeCallback("replayResolution", callback);
  }
  
  onReplayEnd(callback) {
    this._callbacks.replayEnd.push(callback);
    return () => this._removeCallback("replayEnd", callback);
  }
  
  _removeCallback(event, callback) {
    const idx = this._callbacks[event].indexOf(callback);
    if (idx !== -1) {
      this._callbacks[event].splice(idx, 1);
    }
  }
  
  createStudy(indicator) {
    return this.Study(indicator);
  }
  
  Study(indicator) {
    return new ChartStudy({
      sessionID: this._chartSessionId,
      studyListeners: this.studyListeners,
      indexes: this._indexes,
      send: this._client.send.bind(this._client)
    }, indicator);
  }
  
  getStudies() {
    return Object.keys(this.studyListeners).map(id => ({ id }));
  }
  
  removeStudy(studyId) {
    if (!(studyId in this.studyListeners)) return false;
    
    this._client.send("remove_study", [this._chartSessionId, studyId]);
    delete this.studyListeners[studyId];
    return true;
  }
  
  async removeAllStudies() {
    const studyIds = Object.keys(this.studyListeners);

    for (const studyId of studyIds) {
      this._client.send("remove_study", [this._chartSessionId, studyId]);
      delete this.studyListeners[studyId];
    }

    return studyIds.length;
  }
  
  delete() {
    if (this._replayMode) {
      this._client.send("replay_delete_session", [this._replaySessionId]);
    }
    this._client.send("chart_delete_session", [this._chartSessionId]);
    delete this._client._sessions[this._chartSessionId];
    delete this._client._sessions[this._replaySessionId];
    this._replayMode = false;
  }
}

// ============================================================================
// QUOTE SESSION
// ============================================================================

class QuoteMarket {
  constructor(quoteSession, symbol, session = "regular") {
    this._quoteSession = quoteSession;
    this._symbol = symbol;
    this._session = session;
    this._symbolKey = `=${JSON.stringify({ session, symbol })}`;
    this._lastData = {};
    this._callbacks = {
      loaded: [],
      data: [],
      error: []
    };
    
    if (!(this._symbolKey in quoteSession.symbolListeners)) {
      quoteSession.symbolListeners[this._symbolKey] = [];
      quoteSession.send("quote_add_symbols", [quoteSession.sessionID, this._symbolKey]);
    }
    
    this._listenerId = quoteSession.symbolListeners[this._symbolKey].length;
    quoteSession.symbolListeners[this._symbolKey].push(this._onData.bind(this));
  }
  
  _onData(packet) {
    if (packet.type === "quote_completed") {
      this._triggerEvent("loaded");
      return;
    }
    
    if (packet.type === "qsd" && packet.data[1]?.s === "ok") {
      Object.assign(this._lastData, packet.data[1].v || {});
      this._triggerEvent("data", this._lastData);
    }
  }
  
  _triggerEvent(event, ...args) {
    for (const callback of (this._callbacks[event] || [])) {
      callback(...args);
    }
  }
  
  onLoaded(callback) {
    this._callbacks.loaded.push(callback);
  }
  
  onData(callback) {
    this._callbacks.data.push(callback);
  }
  
  onError(callback) {
    this._callbacks.error.push(callback);
  }
  
  close() {
    this._quoteSession.send("quote_remove_symbols", [
      this._quoteSession.sessionID,
      this._symbolKey
    ]);
  }
}

class QuoteSession {
  constructor(client, options = {}) {
    this._sessionId = genSessionId("qs");
    this._client = client;
    this.symbolListeners = {};
    
    client._sessions[this._sessionId] = {
      type: "quote",
      onData: this._onData.bind(this)
    };
    
    client.send("quote_create_session", [this._sessionId]);
    
    const fields = options.customFields || this._getQuoteFields(options.fields || "all");
    client.send("quote_set_fields", [this._sessionId, ...fields]);
  }
  
  get sessionID() { return this._sessionId; }
  
  send(...args) {
    this._client.send(...args);
  }
  
  _getQuoteFields(fieldsType) {
    if (fieldsType === "price") return ["lp"];
    
    return [
      "base-currency-logoid", "ch", "chp", "currency-logoid",
      "currency_code", "current_session", "description",
      "exchange", "format", "fractional", "is_tradable",
      "lp", "lp_time", "minmov", "minmove2", "original_name",
      "pricescale", "pro_name", "short_name", "type",
      "volume", "ask", "bid", "high_price", "low_price",
      "open_price", "prev_close_price"
    ];
  }
  
  _onData(packet) {
    if (packet.type === "quote_completed") {
      const symbolKey = packet.data[1];
      if (symbolKey in this.symbolListeners) {
        for (const handler of this.symbolListeners[symbolKey]) {
          handler(packet);
        }
      }
    }
    
    if (packet.type === "qsd") {
      const symbolKey = packet.data[1]?.n;
      if (symbolKey in this.symbolListeners) {
        for (const handler of this.symbolListeners[symbolKey]) {
          handler(packet);
        }
      }
    }
  }
  
  createMarket(symbol, session = "regular") {
    return new QuoteMarket({
      sessionID: this._sessionId,
      symbolListeners: this.symbolListeners,
      send: this._client.send.bind(this._client)
    }, symbol, session);
  }
  
  delete() {
    this._client.send("quote_delete_session", [this._sessionId]);
    delete this._client._sessions[this._sessionId];
  }
}

// ============================================================================
// CLIENT
// ============================================================================

class Client {
  constructor(options = {}) {
    this._ws = null;
    this._logged = false;
    this._handshakeReceived = false;
    this._isShuttingDown = false;
    this._sessions = {};
    this._sendQueue = [];
    this._callbacks = {
      connected: [],
      disconnected: [],
      logged: [],
      ping: [],
      data: [],
      log: [],
      error: [],
      event: []
    };
    this._server = options.server || "data";
    this._token = options.token;
    this._signature = options.signature || "";
    this._location = options.location || "https://www.tradingview.com/";
    this._proxy = options.proxy;
    this._running = false;
    this._connected = false;
    
    if (options.debug !== undefined) setDebug(options.debug);
    if (options.DEBUG !== undefined) setDebug(options.DEBUG);
  }
  
  get isLogged() {
    return this._logged;
  }
  
  get isOpen() {
    if (!this._ws) return false;
    return this._ws.readyState === _requireWebSocket().OPEN;
  }
  
  _removeCallback(event, callback) {
    const idx = this._callbacks[event].indexOf(callback);
    if (idx !== -1) {
      this._callbacks[event].splice(idx, 1);
    }
  }
  
  _handleEvent(event, ...args) {
    for (const callback of (this._callbacks[event] || [])) {
      try {
        callback(...args);
      } catch (e) {
        if (isDebugEnabled()) {
          console.error(`Error in event callback: ${e.message}`);
        }
      }
    }
    
    for (const callback of (this._callbacks.event || [])) {
      try {
        callback(event, ...args);
      } catch (e) {
        if (isDebugEnabled()) {
          console.error(`Error in event callback: ${e.message}`);
        }
      }
    }
  }
  
  _handleError(...msgs) {
    const errorObj = msgs[0] instanceof Error ? msgs[0] : new Error(msgs.join(" "));
    if (this._callbacks.error.length === 0) {
      console.error(`Error: ${errorObj.message}`);
    } else {
      this._handleEvent("error", errorObj, ...msgs.slice(1));
    }
  }
  
  async connect() {
    if (this._isShuttingDown) return;
    
    const uri = `wss://${this._server}.tradingview.com/socket.io/websocket?type=chart`;
    const WebSocket = _requireWebSocket();
    
    const wsOptions = {
      headers: {
        "Origin": this._location.replace(/\/$/, ''),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
      }
    };
    
    let authToken = "unauthorized_user_token";
    if (this._token) {
      try {
        const user = await getUser(this._token, this._signature, this._location);
        authToken = user.authToken || this._token;
      } catch (e) {
        const error = new AuthenticationError("Credentials error", e.message);
        this._handleError(error);
        throw error;
      }
    }
    
    if (this._token || this._signature) {
      wsOptions.headers["Cookie"] = genAuthCookies(this._token, this._signature);
    }
    
    if (this._proxy) {
      wsOptions.agent = new (_requireSocksProxyAgent())(this._proxy);
      if (isDebugEnabled()) {
        console.log(`[DEBUG] Using proxy: ${this._proxy}`);
      }
    }
    
    try {
      this._ws = new WebSocket(uri, wsOptions);
    } catch (e) {
      throw new ConnectionError(`Failed to connect: ${e.message}`);
    }
    
    this._running = true;
    
    this._ws.on('open', () => {
      this._sendQueue.unshift(Protocol.formatWSPacket({
        m: "set_auth_token",
        p: [authToken]
      }));
      this._logged = true;
      this._handleEvent("connected");
      this._sendQueued();
      this._listen();
    });
    
    this._ws.on('error', (err) => {
      this._handleEvent("error", err);
    });
  }
  
  async waitForConnected(timeoutMs = 15000) {
    if (this._connected) return true;

    return new Promise((resolve) => {
      const onConnect = () => {
        const idx = this._callbacks.connected.indexOf(onConnect);
        if (idx !== -1) this._callbacks.connected.splice(idx, 1);
        resolve(true);
      };
      this._callbacks.connected.push(onConnect);
      setTimeout(() => {
        const idx = this._callbacks.connected.indexOf(onConnect);
        if (idx !== -1) this._callbacks.connected.splice(idx, 1);
        resolve(false);
      }, timeoutMs);
    });
  }
  
  _listen() {
    this._connected = true;
    
    this._ws.on('message', async (message) => {
      if (isDebugEnabled()) {
        console.log(`[DEBUG] Received: ${message.toString().substring(0, 200)}...`);
      }
      await this._parsePacket(message.toString());
    });
    
    this._ws.on('close', () => {
      this._connected = false;
      this._logged = false;
      this._running = false;
      this._handleEvent("disconnected");
    });
  }
  
  async _parsePacket(data) {
    if (!this.isOpen) return;
    
    const packets = Protocol.parseWSPacket(data);
    
    for (const packet of packets) {
      if (isDebugEnabled()) {
        console.log(`[DEBUG] Packet:`, packet);
      }
      
      if (typeof packet === 'number') {
        this._ws.send(Protocol.formatWSPacket(`~h~${packet}`));
        this._handleEvent("ping", packet);
        continue;
      }
      
      if (!this._handshakeReceived && typeof packet === 'object' && packet.session_id) {
        this._handshakeReceived = true;
        this._handleEvent("logged", packet);
        continue;
      }
      
      if (!this._logged) continue;
      
      if (typeof packet === 'object') {
        if (packet.m === "protocol_error") {
          const error = new ConnectionError("Client protocol error", packet.p);
          this._handleError(error, packet.p);
          this._ws.close();
          continue;
        }
        
        if (packet.m && packet.p) {
          const parsed = {
            type: packet.m,
            data: packet.p
          };
          
          const sessionId = packet.p[0];
          if (sessionId && sessionId in this._sessions) {
            this._sessions[sessionId].onData(parsed);
            continue;
          }
        }
        
        this._handleEvent("data", packet);
      }
    }
  }
  
  send(msgType, params = []) {
    const packet = Protocol.formatWSPacket({ m: msgType, p: params });
    this._sendQueue.push(packet);
    this._sendQueued();
  }
  
  _sendQueued() {
    while (this.isOpen && this._logged && this._sendQueue.length > 0) {
      try {
        const packet = this._sendQueue.shift();
        this._ws.send(packet);
        if (isDebugEnabled()) {
          console.log(`[DEBUG] Sent: ${packet.substring(0, 100)}...`);
        }
      } catch (e) {
        if (isDebugEnabled()) {
          console.error(`[DEBUG] Send error: ${e.message}`);
        }
        this._logged = false;
        break;
      }
    }
  }
  
  onConnected(callback) {
    this._callbacks.connected.push(callback);
    return () => this._removeCallback("connected", callback);
  }
  
  onDisconnected(callback) {
    this._callbacks.disconnected.push(callback);
    return () => this._removeCallback("disconnected", callback);
  }
  
  onLogged(callback) {
    this._callbacks.logged.push(callback);
    return () => this._removeCallback("logged", callback);
  }
  
  onPing(callback) {
    this._callbacks.ping.push(callback);
    return () => this._removeCallback("ping", callback);
  }
  
  onData(callback) {
    this._callbacks.data.push(callback);
    return () => this._removeCallback("data", callback);
  }
  
  onLog(callback) {
    this._callbacks.log.push(callback);
    return () => this._removeCallback("log", callback);
  }
  
  onError(callback) {
    this._callbacks.error.push(callback);
    return () => this._removeCallback("error", callback);
  }
  
  onEvent(callback) {
    this._callbacks.event.push(callback);
    return () => this._removeCallback("event", callback);
  }
  
  createChartSession() {
    return new ChartSession(this);
  }
  
  createQuoteSession(options = {}) {
    return new QuoteSession(this, options);
  }
  
  get Session() {
    const self = this;
    return {
      Chart: function ChartSessionFactory() {
        return new ChartSession(self);
      },
      Quote: function QuoteSessionFactory(options = {}) {
        return new QuoteSession(self, options);
      }
    };
  }
  
  Study() {
    throw new Error("Use chart.Study(indicator) instead of client.Study()");
  }
  
  async fetchHistory(symbol, timeframe = "240", count = 100, to = null, timeout = 20000) {
    const chart = this.createChartSession();
    chart.setMarket(symbol, { timeframe, range: count, to });
    
    try {
      const periods = await chart.fetchHistory(count, timeout);
      return periods;
    } finally {
      try {
        chart.delete();
      } catch {}
    }
  }
  
  async end() {
    this._isShuttingDown = true;
    
    // Send delete messages for all active sessions so TradingView's
    // server can clean up studies before the socket closes.
    for (const [sessionId, sessionData] of Object.entries(this._sessions)) {
      try {
        if (sessionData.type === 'chart') {
          this.send('chart_delete_session', [sessionId]);
        } else if (sessionData.type === 'replay') {
          this.send('replay_delete_session', [sessionId]);
        } else if (sessionData.type === 'quote') {
          this.send('quote_delete_session', [sessionId]);
        }
      } catch {}
    }
    
    // Allow a minimal tick for delete messages to be transmitted.
    await new Promise(resolve => setTimeout(resolve, 50));
    
    for (const sessionId of Object.keys(this._sessions)) {
      delete this._sessions[sessionId];
    }
    
    this._sendQueue = [];
    
    if (!this._ws) return;
    if (this._ws.readyState === _requireWebSocket().CLOSED) return;
    
    try {
      this._ws.close();
    } catch {}
    
    this._running = false;
    this._logged = false;
  }
  
  async close() {
    await this.end();
  }
}

// ============================================================================
// PUBLIC SCRIPTS
// ============================================================================

/**
 * List public scripts from TradingView pubscripts library endpoint.
 * Matches browser endpoint: /pubscripts-library/?offset=<n>
 * @param {number} [offset=0] - Pagination offset (must be >= 0)
 * @returns {Promise<object>} JSON response with results array
 */
async function listPublicScripts(offset = 0) {
  if (offset < 0) throw new Error('offset must be >= 0');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: '*/*',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Language': 'en',
    Origin: 'https://www.tradingview.com',
    Referer: 'https://www.tradingview.com/pubscripts-library/',
  };

  const url = `https://www.tradingview.com/pubscripts-library/?offset=${offset}`;
  const response = await httpRequest(url, { headers });
  return JSON.parse(response.data);
}

/**
 * Search public scripts via TradingView suggest endpoint.
 * Matches browser endpoint: /pubscripts-suggest-json/?search=<q>
 * @param {string} search - Search query string
 * @returns {Promise<object>} JSON response with results array
 */
async function suggestPublicScripts(search) {
  const q = String(search || '').trim();
  if (!q) throw new Error('search is required');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Language': 'en',
    Origin: 'https://www.tradingview.com',
    Referer: 'https://www.tradingview.com/',
  };

  const url = `https://www.tradingview.com/pubscripts-suggest-json/?search=${encodeURIComponent(q)}`;
  const response = await httpRequest(url, { headers });
  return JSON.parse(response.data);
}

async function searchPublicScripts(search, opts = {}) {
  const q = String(search || '').trim();
  if (!q) throw new Error('search is required');

  const scriptType = String(opts.scriptType ?? 'indicators');
  const scriptAccess = String(opts.scriptAccess ?? 'open');
  const perPage = Number.isFinite(Number(opts.perPage)) ? Number(opts.perPage) : 24;
  const sort = String(opts.sort ?? 'recent');
  const page = Number.isFinite(Number(opts.page)) && Number(opts.page) > 1 ? Number(opts.page) : 1;

  const queryPath = encodeURIComponent(q).replace(/%20/g, '+');
  const pageSuffix = page > 1 ? `page-${page}/` : '';
  const url = `https://www.tradingview.com/scripts/search/${queryPath}/${pageSuffix}?component-data-only=1&script_type=${encodeURIComponent(scriptType)}&script_access=${encodeURIComponent(scriptAccess)}&per_page=${perPage}&sort=${encodeURIComponent(sort)}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Language': 'en',
    Origin: 'https://www.tradingview.com',
    Referer: `https://www.tradingview.com/scripts/search/${queryPath}/`,
  };

  const response = await httpRequest(url, { headers });
  const json = JSON.parse(response.data);
  const ideas = json?.data?.ideas?.data;

  if (!ideas || !Array.isArray(ideas.items)) {
    throw new Error(`Unexpected search response for query: ${q}`);
  }

  return {
    total: ideas.total ?? 0,
    next: ideas.next ?? null,
    items: ideas.items,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main classes
  Client,
  ChartSession,
  ChartStudy,
  QuoteSession,
  QuoteMarket,
  PineIndicator,
  BuiltInIndicator,
  PineFacadeClient,

  // Protocol and utilities
  Protocol,
  genSessionId,
  genAuthCookies,

  // HTTP API functions
  getIndicator,
  getUser,
  getTA,
  searchMarketV3,
  loginUser,
  listPublicScripts,
  suggestPublicScripts,
  searchPublicScripts,

  // Configuration
  setDebug,
  isDebugEnabled,

  // Error classes
  TradingViewAPIError,
  ConnectionError,
  ProtocolError,
  ValidationError,
  AuthenticationError,
  SymbolError,
  IndicatorError,
  SessionError
};