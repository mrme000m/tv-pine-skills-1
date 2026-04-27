# Public Script Discovery (publist.cjs)

Browse and search public TradingView scripts **without authentication**.
This is the **only** tool in the suite that works without TradingView credentials.

## Commands

```bash
# List public scripts (paginated)
node publist.cjs list --offset 0 --limit 20
node publist.cjs list --json

# Search public scripts
node publist.cjs search "RSI" --limit 20
node publist.cjs search "moving average" --limit 10 --json

# Fetch top scripts and save to file
node publist.cjs top --limit 100 --output top_scripts.json
node publist.cjs top --limit 200
```

## Verified Output Example

```bash
$ node publist.cjs search "RSI" --limit 2 --json
{
  "query": "RSI",
  "limit": 2,
  "count": 2,
  "next": "/scripts/search/RSI/page-2/",
  "results": [
    {
      "scriptIdPart": "PUB;2d0fdca6350e44788b96b3ed2dc84d62",
      "title": "Regime Pressure Trail [ArisCodes]",
      "author": { "id": null, "username": "" },
      "type": "indicator",
      "access": 1,
      "version": "1",
      "agreeCount": 0,
      "isRecommended": false,
      "imageUrl": "AakfZyUp",
      "url": "https://www.tradingview.com/script/AakfZyUp-Regime-Pressure-Trail-ArisCodes/"
    }
  ]
}
```

## Response Fields

| Field | Meaning |
|-------|---------|
| `scriptIdPart` | Pine ID (e.g., `PUB;abc123`) — use this to pull/run |
| `title` | Display title |
| `author.username` | Script author |
| `type` | `indicator` or `strategy` |
| `access` | 1=open, 2=private |
| `agreeCount` | Number of likes/agrees |
| `isRecommended` | TradingView recommended flag |
| `imageUrl` | Thumbnail image code |
| `url` | Direct link to script page |
