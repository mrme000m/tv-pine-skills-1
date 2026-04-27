# NotebookLM Workflow — Video → Indicator Name

This skill uses the `nlm` CLI to ingest a YouTube video and query its content.

## Prerequisites

```bash
# Install nlm if not already installed
npm install -g @notebooklm/cli
# or
npx @notebooklm/cli --version

# Authenticate (required before any operation)
nlm login
# Session lasts ~20 minutes; re-run if commands fail with auth errors
```

## Phase 1: Add YouTube Source

```bash
# Create a notebook (or reuse existing)
NLM_NOTEBOOK=$(nlm notebook create "YouTube Indicator Extractor" --json | jq -r '.id')

# Add the YouTube video as a source
nlm source add "$NLM_NOTEBOOK" --url "https://www.youtube.com/watch?v=VIDEO_ID"

# List sources to confirm indexing
nlm source list "$NLM_NOTEBOOK"
```

**Indexing time**: 30–120 seconds for a 10–30 minute video.

## Phase 2: Query for Indicator Name

```bash
# Primary query — ask for exact indicator name
nlm notebook query "$NLM_NOTEBOOK" \
  "What is the exact name of the TradingView indicator discussed in this video? \
   Return ONLY the indicator name, nothing else."

# Secondary query — ask for Pine ID if visible
nlm notebook query "$NLM_NOTEBOOK" \
  "Does the video mention a TradingView script URL or Pine ID? \
   Look for links like tradingview.com/script/... or IDs like PUB;..."

# Tertiary query — ask for author and key features
nlm notebook query "$NLM_NOTEBOOK" \
  "Who created this indicator and what are its 3 main features?"
```

## Phase 3: Handle Ambiguity

If NLM returns multiple possible names or is uncertain:

```bash
# Ask for ranking
nlm notebook query "$NLM_NOTEBOOK" \
  "Rank the possible indicator names by likelihood. \
   Format: 1. Name (confidence: HIGH/MEDIUM/LOW)"
```

The orchestrator then passes all candidates to the **TV Discovery** phase,
which searches each and presents matches to the user.

## Reusing Notebooks

For batch processing multiple videos, reuse the same notebook:

```bash
nlm notebook list --json | jq -r '.[] | select(.title | contains("Indicator")) | .id'
```

Or pass an existing notebook ID to the script:

```bash
node scripts/youtube-to-tv-pine.cjs "<url>" --nlm-notebook-id "$NLM_NOTEBOOK"
```

## Error Recovery

| Error | Cause | Solution |
|-------|-------|----------|
| "Cookies have expired" | NLM session timeout | `nlm login` |
| "Source not found" | Indexing not complete | Wait 30s, retry `nlm source list` |
| "No indicator mentioned" | Video is generic | Fall back to Firecrawl scrape |
| Multiple indicators | Video compares tools | Use `--interactive` to let user pick |
