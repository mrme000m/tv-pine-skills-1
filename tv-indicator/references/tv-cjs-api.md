# tv.cjs — Core TradingView API Library

The library powering all CLI tools. Use for custom programmatic workflows.

## Quick Start

```javascript
const TradingView = require('./tv.cjs');

// WebSocket Client for real-time data
const client = new TradingView.Client({
  token: process.env.SESSION,
  signature: process.env.SIGNATURE,
  location: 'https://www.tradingview.com/',
  debug: false
});
await client.connect();

// Chart Session
const chart = client.createChartSession();
chart.setMarket('OANDA:XAUUSD', { timeframe: '5', range: 500 });

// Quote Session
const quote = client.createQuoteSession();
const market = quote.createMarket('OANDA:XAUUSD');

// Cleanup
await client.end();
```

## Indicator Metadata

```javascript
// Fetch indicator metadata
const indicator = await TradingView.getIndicator(
  'USER;abc123',
  'last',
  process.env.SESSION,
  process.env.SIGNATURE
);

// Configure inputs
indicator.setOption('length', 50);
indicator.setOption('source', 'close');

// Create study on chart
const study = new chart.Study(indicator);
study.onUpdate(() => {
  console.log(study.periods);
  console.log(study.strategyReport);
});
```

## Pine Facade Client (HTTP API)

```javascript
const facade = new TradingView.PineFacadeClient({
  sessionId: process.env.SESSION,
  signature: process.env.SIGNATURE,
  userName: process.env.TV_USER
});

// Compile
const compileResult = await facade.compile(pineSource);

// Save new
const saveResult = await facade.saveNew(pineSource, 'My Strategy');

// Update existing
const updateResult = await facade.saveNext('USER;abc123', pineSource);

// Fetch source
const { source, meta } = await facade.fetch('USER;abc123');

// List saved
const saved = await facade.listSaved();

// Delete
await facade.delete('USER;abc123');
```

## Public Script Discovery (no auth)

```javascript
const publicScripts = await TradingView.listPublicScripts(0);
const suggestions = await TradingView.suggestPublicScripts('RSI');
const searchResults = await TradingView.searchPublicScripts('RSI', {
  scriptType: 'indicators',
  perPage: 24,
  sort: 'recent'
});
```

## Market Data

```javascript
// Search markets
const results = await TradingView.searchMarketV3('BTCUSD', '', 0);

// Get technical analysis
const ta = await TradingView.getTA('OANDA:XAUUSD');

// Fetch historical data
const periods = await client.fetchHistory('OANDA:XAUUSD', '5', 500);
```

## Error Classes

```javascript
TradingView.TradingViewAPIError   // Base error
TradingView.ConnectionError       // WebSocket connection issues
TradingView.ProtocolError         // Protocol parsing errors
TradingView.ValidationError       // Input validation errors
TradingView.AuthenticationError   // Auth/session errors
TradingView.SymbolError           // Symbol resolution errors
TradingView.IndicatorError        // Indicator/study errors
TradingView.SessionError          // Session management errors
```

## PineIndicator Class

```javascript
const indicator = await TradingView.getIndicator(pineId, version, session, signature);

// Properties
indicator.pineId          // Script ID
indicator.pineVersion     // Version string
indicator.description     // Full description
indicator.shortDescription // Short description
indicator.inputs          // Input definitions with defaults
indicator.plots           // Output plot names
indicator.script          // Compiled script template

// Methods
indicator.setOption(key, value);   // Set input value (validates type)
indicator.setType(type);            // Set indicator type
```

## BuiltInIndicator Class

```javascript
const vol = new TradingView.BuiltInIndicator('Volume@tv-basicstudies-241');
vol.setOption('length', 20);
vol.setOption('col_prev_close', false);
```
