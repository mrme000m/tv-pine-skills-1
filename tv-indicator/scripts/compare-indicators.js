#!/usr/bin/env node
/**
 * Standalone TradingView indicator comparison script
 * Connects directly to TradingView's WebSocket API to run and compare indicators.
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';

// Environment variables
const SESSION = process.env.SESSION || '';
const SIGNATURE = process.env.SIGNATURE || '';
const TV_USER = process.env.TV_USER || '';

// Indicator pineIds
const PINE_ID_EMA_TREND = 'USER;0507f37761bf41ab9fe1239ca27c5013';
const PINE_ID_SUPER_TREND = 'USER;2224bb23239c4232ad2d24593767364a';

const SYMBOL = 'OANDA:XAUUSD';
const TIMEFRAME = '60'; // 1h in minutes
const RANGE = 500;

// TradingView WebSocket URL
const WS_URL = 'wss://data.tradingview.com/socket.io/websocket';

function generateSessionId(prefix = 'qs') {
  return prefix + '_' + crypto.randomBytes(12).toString('hex').substring(0, 12);
}

function createMessage(func, args) {
  const payload = JSON.stringify({ m: func, p: args });
  const length = payload.length;
  return '~m~' + length + '~m~' + payload;
}

function parseMessages(data) {
  const messages = [];
  const regex = /~m~(\d+)~m~/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(data)) !== null) {
    const length = parseInt(match[1], 10);
    const start = match.index + match[0].length;
    const payload = data.substring(start, start + length);
    lastIndex = start + length;
    try {
      messages.push(JSON.parse(payload));
    } catch (e) {
      messages.push({ raw: payload });
    }
  }

  return messages;
}

class TradingViewClient {
  constructor() {
    this.ws = null;
    this.session = generateSessionId('cs');
    this.chartSession = generateSessionId('cs');
    this.studySessionCounter = 0;
    this.messages = [];
    this.resolvers = new Map();
    this.connected = false;
    this.studyData = {};
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL, {
        headers: {
          'Origin': 'https://www.tradingview.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      });

      this.ws.on('open', () => {
        this.connected = true;
        // Send protocol version
        this.ws.send('~m~4~m~~h~0');
        resolve();
      });

      this.ws.on('message', (data) => {
        const text = data.toString();
        if (text.startsWith('~h~')) {
          // Heartbeat - respond
          this.ws.send(text);
          return;
        }
        const messages = parseMessages(text);
        for (const msg of messages) {
          this.handleMessage(msg);
        }
      });

      this.ws.on('error', (err) => {
        reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
      });
    });
  }

  handleMessage(msg) {
    if (!msg || !msg.m) return;

    const { m: method, p: params } = msg;

    if (method === 'protocol_error') {
      console.error('Protocol error:', params);
      return;
    }

    if (method === 'q') {
      // Quote data
      return;
    }

    if (method === 'timescale_update' || method === 'du') {
      // Chart data update
      const sessionId = params[0];
      const data = params[1];
      if (this.resolvers.has('chart_' + sessionId)) {
        this.resolvers.get('chart_' + sessionId)(data);
      }
    }

    if (method === 'study_loading' || method === 'study_error') {
      const studyId = params[1];
      if (method === 'study_error') {
        console.error('Study error:', params);
      }
    }

    if (method === 'study_completed') {
      const studyId = params[1];
      if (this.resolvers.has('study_' + studyId)) {
        this.resolvers.get('study_' + studyId)({ completed: true });
      }
    }

    if (method === 'study_data') {
      const studyId = params[1];
      const data = params[2];
      this.studyData[studyId] = data;
      if (this.resolvers.has('study_' + studyId)) {
        this.resolvers.get('study_' + studyId)(data);
      }
    }
  }

  send(func, args) {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected');
    }
    const msg = createMessage(func, args);
    this.ws.send(msg);
  }

  async authorize() {
    // Try to authorize with session
    if (SESSION) {
      this.send('set_auth_token', ['unauthorized_user_token']);
    } else {
      this.send('set_auth_token', ['unauthorized_user_token']);
    }
  }

  async createChartSession() {
    this.send('chart_create_session', [this.chartSession, '']);
  }

  async resolveSymbol(symbol) {
    const resolveId = generateSessionId('sds');
    this.send('resolve_symbol', [this.chartSession, resolveId, '={"symbol":"' + symbol + '","adjustment":"splits"}']);
    return resolveId;
  }

  async createSeries(resolveId, timeframe, range) {
    const seriesId = generateSessionId('sds');
    this.send('create_series', [this.chartSession, seriesId, 's1', resolveId, timeframe, range]);
    return seriesId;
  }

  async createStudy(pineId, inputs = {}) {
    const studyId = 'st' + (++this.studySessionCounter);
    const studyInput = {
      text: pineId,
      ...(Object.keys(inputs).length > 0 ? { inputs } : {})
    };

    this.send('create_study', [this.chartSession, studyId, 'st1', 's1', studyInput.text, studyInput]);
    return studyId;
  }

  async waitForStudy(studyId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete('study_' + studyId);
        reject(new Error(`Study timeout after ${timeout}ms`));
      }, timeout);

      this.resolvers.set('study_' + studyId, (data) => {
        clearTimeout(timer);
        this.resolvers.delete('study_' + studyId);
        resolve(data);
      });
    });
  }

  async getStudyData(studyId) {
    return this.studyData[studyId] || null;
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}

async function runIndicator(pineId, symbol, timeframe, range) {
  const client = new TradingViewClient();

  try {
    await client.connect();
    await new Promise(r => setTimeout(r, 500));

    await client.authorize();
    await new Promise(r => setTimeout(r, 500));

    await client.createChartSession();
    await new Promise(r => setTimeout(r, 500));

    const resolveId = await client.resolveSymbol(symbol);
    await new Promise(r => setTimeout(r, 1000));

    const seriesId = await client.createSeries(resolveId, timeframe, range);
    await new Promise(r => setTimeout(r, 2000));

    const studyId = await client.createStudy(pineId);
    await new Promise(r => setTimeout(r, 3000));

    // Wait for study data
    let studyData = null;
    try {
      studyData = await client.waitForStudy(studyId, 25000);
    } catch (e) {
      console.log(`  Warning: ${e.message}, checking cached data...`);
      studyData = client.getStudyData(studyId);
    }

    await client.close();
    return { pineId, studyId, data: studyData };

  } catch (err) {
    await client.close();
    throw err;
  }
}

function extractDirectionFromData(data, pineId) {
  if (!data) return { direction: 'UNKNOWN', raw: null };

  // Try to extract from various data formats
  let ns = null;
  let nd = null;

  if (data.ns) ns = data.ns;
  if (data.nd) nd = data.nd;

  // If data is the raw study_data response
  if (typeof data === 'object') {
    // Check for plot values in ns/nd format
    if (data.st && Array.isArray(data.st)) {
      // Time series data
      const lastPoint = data.st[data.st.length - 1];
      if (lastPoint) {
        return { direction: inferDirection(lastPoint), raw: lastPoint };
      }
    }

    // Check for nodes
    if (ns || nd) {
      // Try to find trend/signal values
      const allKeys = Object.keys(data);
      for (const key of allKeys) {
        const val = data[key];
        if (typeof val === 'number') {
          if (key.toLowerCase().includes('trend') || key.toLowerCase().includes('signal') ||
              key.toLowerCase().includes('direction') || key.toLowerCase().includes('supertrend')) {
            return { direction: inferDirection(val), raw: { [key]: val } };
          }
        }
      }
    }
  }

  return { direction: 'UNKNOWN', raw: data };
}

function inferDirection(value) {
  if (value === null || value === undefined) return 'UNKNOWN';

  if (typeof value === 'number') {
    if (value > 0) return 'UP';
    if (value < 0) return 'DOWN';
    return 'NEUTRAL';
  }

  if (typeof value === 'string') {
    const v = value.toUpperCase();
    if (v === 'BUY' || v === 'LONG' || v === 'UP' || v === 'BULLISH') return 'UP';
    if (v === 'SELL' || v === 'SHORT' || v === 'DOWN' || v === 'BEARISH') return 'DOWN';
    return 'NEUTRAL';
  }

  if (typeof value === 'object') {
    // Check common field names
    const keys = Object.keys(value);
    for (const key of keys) {
      const k = key.toLowerCase();
      if (k.includes('signal') || k.includes('trend') || k.includes('direction') ||
          k.includes('supertrend') || k.includes('ema')) {
        return inferDirection(value[key]);
      }
    }
  }

  return 'UNKNOWN';
}

async function main() {
  console.log('========================================');
  console.log('TradingView Indicator Comparison');
  console.log('========================================');
  console.log(`Symbol: ${SYMBOL}`);
  console.log(`Timeframe: 1h`);
  console.log('');

  let result1, result2;

  try {
    console.log('Running SHA_EMA_Trend_MTF...');
    console.log(`  pineId: ${PINE_ID_EMA_TREND}`);
    result1 = await runIndicator(PINE_ID_EMA_TREND, SYMBOL, TIMEFRAME, RANGE);
    console.log('  Done.');
  } catch (err) {
    console.error('  Error:', err.message);
    result1 = { pineId: PINE_ID_EMA_TREND, data: null, error: err.message };
  }

  // Small delay between runs
  await new Promise(r => setTimeout(r, 2000));

  try {
    console.log('');
    console.log('Running SHA_SuperTrend_v1...');
    console.log(`  pineId: ${PINE_ID_SUPER_TREND}`);
    result2 = await runIndicator(PINE_ID_SUPER_TREND, SYMBOL, TIMEFRAME, RANGE);
    console.log('  Done.');
  } catch (err) {
    console.error('  Error:', err.message);
    result2 = { pineId: PINE_ID_SUPER_TREND, data: null, error: err.message };
  }

  // Extract directions
  const dir1 = extractDirectionFromData(result1.data, PINE_ID_EMA_TREND);
  const dir2 = extractDirectionFromData(result2.data, PINE_ID_SUPER_TREND);

  const agreement = dir1.direction === dir2.direction && dir1.direction !== 'UNKNOWN';

  console.log('');
  console.log('========================================');
  console.log('RESULTS');
  console.log('========================================');
  console.log(`SHA_EMA_Trend_MTF:   ${dir1.direction}`);
  console.log(`SHA_SuperTrend_v1:   ${dir2.direction}`);
  console.log('');
  console.log(`AGREEMENT: ${agreement ? 'YES' : 'NO'}`);
  console.log('');

  if (dir1.direction !== 'UNKNOWN') {
    console.log('SHA_EMA_Trend_MTF raw data:', JSON.stringify(dir1.raw, null, 2));
  }
  console.log('');
  if (dir2.direction !== 'UNKNOWN') {
    console.log('SHA_SuperTrend_v1 raw data:', JSON.stringify(dir2.raw, null, 2));
  }

  // Full data dump for debugging
  console.log('');
  console.log('=== Full result1.data ===');
  console.log(JSON.stringify(result1.data, null, 2));
  console.log('');
  console.log('=== Full result2.data ===');
  console.log(JSON.stringify(result2.data, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
