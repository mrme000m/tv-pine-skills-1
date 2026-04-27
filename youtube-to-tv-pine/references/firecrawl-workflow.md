# Firecrawl Workflow — Video Page Scraping

When NotebookLM cannot identify the indicator (e.g., generic video, no clear name),
this skill falls back to Firecrawl scraping the YouTube video page for TradingView links.

## Prerequisites

```bash
# Install firecrawl CLI if not already installed
npm install -g @mendable/firecrawl
# or use npx
npx firecrawl --version
```

## Scraping the Video Page

```bash
# Scrape video description (main content only, skip comments)
firecrawl scrape "https://www.youtube.com/watch?v=VIDEO_ID" \
  --only-main-content \
  -o .firecrawl/video-desc.md

# Search for TradingView links
grep -iE "tradingview\.com/script/[a-zA-Z0-9]+" .firecrawl/video-desc.md

# Extract with jq if using JSON output
firecrawl scrape "https://www.youtube.com/watch?v=VIDEO_ID" \
  --format markdown,links \
  -o .firecrawl/video.json

jq -r '.links[] | select(. | test("tradingview.com/script"))' .firecrawl/video.json
```

## TradingView Link Patterns

| Pattern | Example | Extracted ID |
|---------|---------|--------------|
| Script URL | `tradingview.com/script/AbCdEfGh-Indicator-Name/` | `PUB;AbCdEfGh` |
| Direct mention | "PUB;ff1a0136336340f38e908eeb12ea33aa" | `PUB;ff1a0136336340f38e908eeb12ea33aa` |
| Chart URL | `tradingview.com/chart/?symbol=...` | None (not a script) |

## Extraction Script

```javascript
// extract-tv-link.js — standalone helper
const fs = require('fs');

const content = fs.readFileSync(process.argv[2], 'utf8');

// Pattern 1: Direct script URLs
const urlMatch = content.match(/tradingview\.com\/script\/(\w+)/i);
if (urlMatch) {
  console.log(`PUB;${urlMatch[1]}`);
  process.exit(0);
}

// Pattern 2: Raw PUB;... IDs
const idMatch = content.match(/(PUB;[a-f0-9]+)/i);
if (idMatch) {
  console.log(idMatch[1]);
  process.exit(0);
}

// Pattern 3: Script name in description — pass to search phase
console.log('NO_DIRECT_LINK');
```

## Fallback: Search by Video Title

If no link is found in the description, extract the video title and search:

```bash
# Get title from scraped markdown
TITLE=$(grep -m1 "^#" .firecrawl/video-desc.md | sed 's/^# //')

# Search TradingView public scripts
node tv-indicator/scripts/publist.cjs search "$TITLE" --limit 5 --json
```

## Rate Limiting

- Firecrawl free tier: ~500 credits/month
- YouTube pages: 1 credit per scrape
- Add `--wait-for 2000` if the page loads dynamically

## Tips

- **Prefer NLM over Firecrawl**: NLM understands video content; Firecrawl only sees the description/comments
- **Use `--only-main-content`**: YouTube comments are noisy and consume tokens
- **Cache results**: Save `.firecrawl/` files to avoid re-scraping
