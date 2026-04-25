---
name: video-integration-2026-04-25
description: NotebookLM integration with Zeiierman's volume gap strategy video
type: reference
---

## Video Integration Summary

**Date:** 2026-04-25
**Video URL:** https://www.youtube.com/watch?v=cmJY6o4ymp4
**Title:** "How Banks Trade via Volume Gap Strategy" (Zeiierman channel)
**NotebookLM Source ID:** dc9f3333-adbf-4ec5-8ad2-79b8c89bb877

## Key Learnings Integrated into SKILL.md

### 1. Optimized Indicator Settings (Video Recommendations)

| Setting | Default | Optimized (Video) | Rationale |
|---------|---------|-------------------|-----------|
| Lookback | 200 | **100** | Balances recent action with structural context; cleaner picture |
| Rows | 50 | **20** | Reduces noise; clearer visual profile representation |
| Profile Placement | — | **50** | Moves volume profile closer to price candles for monitoring |

### 2. Enhanced Buy Trade Setup (Rejection Method)

**Video's 5-Step Method:**
1. Identify purple true volume gap *below current price*
2. Wait for retracement *into* the gap
3. Monitor delta panel for *green shift* (buyer pressure building)
4. Wait for rejection candle (specifically **bullish engulfing**)
5. Confirm with profile (more blue bars than orange)

**Key Insight:** Video emphasizes waiting for delta to *shift in your favor BEFORB* the candle rejection forms ("soft confirmation") to avoid false setups.

### 3. Enhanced Sell Trade Setup (Two Methods)

**Method A - Rejection:** Same logic reversed (bearish engulfing, red delta, orange profile bars)

**Method B - Breakout:** Wait for strong bearish candle to *break and close below* a purple gap (not just touch it)

### 4. Risk Management Refinements

**Stop Loss:** Edge of or just outside the inefficiency gap (purple zone)

**Take Profit - Two Options:**
- 1:2 risk-to-reward ratio (conservative)
- Target *next inefficiency gap* (structurally optimal - price tends to "rebalance" at untraded voids)

### 5. Delta Panel Reading (Video Clarifications)

- **Green = buyer control / absorption**
- **Red = seller control / dominance**
- Monitor for *percentages changing* as price pulls back into gaps
- Look for *color shifts* in the delta panel before candle rejection

## Implementation Notes

- Added "Optimized (from video)" preset row to presets table
- Added new section "Step-by-Step Trading Methodology (From Video - 'Zeiierman' Channel)" with detailed methodology
- Updated SETTINGS REFERENCE with "Optimized Settings (Recommended by Video)" subsection
- Added video to SOURCES section with YouTube link
- Video source is indexed in NotebookLM for future queries

## questions to explore in future queries:

1. How to properly backtest these settings historically?
2. What timeframes work best for which settings?
3. How to identify institutional-realm gaps vs retail trader gaps?
4. Advanced delta panel reading - reading multiple timeframes?
5. Combining with other indicators (FVG, institutional stops)?