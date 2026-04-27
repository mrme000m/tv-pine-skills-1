# TradingView Script Discovery

This phase searches TradingView public scripts and resolves the exact Pine ID.

## Auth Requirements

| Tool | Auth Required | Operations |
|------|--------------|------------|
| `publist.cjs` | **No** | `list`, `search`, `top` |
| `tv-cli.js` | **Yes** (SESSION + SIGNATURE) | `pull`, `push`, `create`, `delete` |
| `tv.cjs` `getIndicator()` | **Yes** | Fetch Pine source + metadata |

## Search Commands

### Public Search (Auth-Free)

```bash
# Search by keyword
node tv-indicator/scripts/publist.cjs search "Volume Gaps" --limit 10 --json

# List top scripts
node tv-indicator/scripts/publist.cjs top --limit 20 --json

# Suggest by partial name (fuzzy)
node -e "const tv=require('./tv.cjs'); tv.suggestPublicScripts('volume gap').then(r=>console.log(JSON.stringify(r,null,2)))"
```

### Authenticated Search

```bash
# tvcli.js has richer search but requires SESSION
node tv-indicator/scripts/tvcli.js search "Volume Gaps" --limit 10 --json
```

## Normalized Output Schema

`publist.cjs` returns normalized items:

```json
{
  "scriptIdPart": "ff1a0136336340f38e908eeb12ea33aa",
  "title": "Volume Gaps & Imbalances (Zeiierman)",
  "scriptName": "Volume Gaps & Imbalances (Zeiierman)",
  "shortTitle": "VG&I",
  "author": { "id": "...", "username": "Zeiierman" },
  "type": "indicator",
  "access": "open_source",
  "agreeCount": 1247,
  "isRecommended": true,
  "url": "https://www.tradingview.com/script/ff1a0136336340f38e908eeb12ea33aa-Volume-Gaps-Imbalances-Zeiierman/"
}
```

## Pine ID Resolution

From a search result, the Pine ID is:

```
PUB;<scriptIdPart>
```

Example:
- `scriptIdPart`: `ff1a0136336340f38e908eeb12ea33aa`
- `Pine ID`: `PUB;ff1a0136336340f38e908eeb12ea33aa`

## Matching Strategy

1. **Exact Pine ID from video**: Use directly
2. **Script URL from video**: Extract `scriptIdPart` from path
3. **Indicator name only**: Search → rank by `agreeCount` + `isRecommended` + author match
4. **Multiple matches**: Present top 3 to user; use `--auto` to pick top

## Pulling Source Code

```bash
# Using tv-cli.js (creates .tv-meta.json tracking)
node tv-indicator/scripts/tv-cli.js pull PUB;ff1a0136336340f38e908eeb12ea33aa

# Using tv.cjs programmatically
node -e "
  const tv = require('./tv.cjs');
  tv.getIndicator('PUB;ff1a0136336340f38e908eeb12ea33aa', 'last', process.env.SESSION, process.env.SIGNATURE)
    .then(ind => console.log(JSON.stringify(ind, null, 2)));
"
```

The `getIndicator()` result contains:
- `pineScript` — full Pine source code
- `inputs` — input definitions with types and defaults
- `shortDescription` — author description
