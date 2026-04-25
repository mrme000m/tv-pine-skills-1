# Volume Gaps & Imbalances (Zeiierman) — Technical Analysis Reference

Pine ID: `PUB;ff1a0136336340f38e908eeb12ea33aa`

This is a deep technical reference for how the indicator renders its graphics into TradingView's `study.graphic.dwgboxes` stream, and how the runner/parser interprets them.

## Key Fact: Zero Standard Plots

The indicator outputs **0 standard plots** (`study.periods` is empty). Every visual element is drawn via `box.new()` — which goes into the graphics stream (`ns.d` field of the WebSocket data) and is parsed by `tv.cjs` into `study.graphic.dwgboxes`.

The parser detects box type by reading the `bc` (border color) integer and `c` (fill color) fields, which correspond to the Pine Script color constants the author assigned to each element.

## Box Type Legend

| `bc` | `c` | `st` (style) | `ex` (extend) | Visual Element | Trading Meaning |
|------|-----|--------------|---------------|----------------|-----------------|
| `7` | `null` | `solid` (`sol`) | `none` (`n`) | **Zero-volume gap** — thin horizontal rectangle with purple border, no fill | True untraded void. Price moved through without any trades. Deeper than FVG because it spans the entire lookback, not just 3 candles. |
| `5` | `419430417` | `solid` | `none` | **Bear volume row** — orange/amber horizontal bar | Sellers dominated this price row (bars where close <= open). The width of the bar is proportional to bearish volume at that price level. |
| `6` | `419430417` | `solid` | `none` | **Bull volume row** — green/teal horizontal bar | Buyers dominated this price row (bars where close > open). Width proportional to bullish volume. |
| `14` | `1291845649` | `solid` | `none` | **Delta panel background** — blue-ish translucent fill box | Container for a delta section. The panel itself. |
| `13` | `3422552081` | `solid` | `none` | **Delta sell bar** — red fill with negative Δ text | Sell pressure in this vertical sector. Text shows `Δ -X.X%`. |
| `12` | `3422552081` | `solid` | `none` | **Delta buy bar** — green fill with positive Δ text | Buy pressure in this vertical sector. Text shows `Δ +X.X%`. |
| `null` | `2147483665` | `dot` | `none` | **Background boundary** — dotted outline, no fill | Optional overlay/anchor reference (cosmetic). |

## Reading the Boxes

### x1/x2 (Horizontal Position)

Boxes extend to the right of the price chart:
- Profile rows: x1 varies (starts near current bar and extends right to `profilePlacement`)
- Delta panel: x2 is further right (offset by `gapFromProfile`)
- x coordinates are bar indices, not pixels

### y1/y2 (Vertical/Price Position)

These are actual price levels. Each box represents one "row" — a horizontal price slice:
- `height = abs(y1 - y2)` = height of the price bin
- Bin size = (lookback_high - lookback_low) / rows

### Text Field (`t`)

Only delta boxes have text: `t: "Δ -45.4%"`

## Data Flow

```
Pine Script (box.new calls)
  → TradingView WebSocket (ns.d JSON field)
     → tv.cjs _parseGraphic() 
        → this._graphic.dwgboxes[id] = {x1, x2, y1, y2, c, bc, st, ex, w, t, tc, ...}
           → runner.cjs parseOutput()
              → struct: {profile, gaps, delta, summary}
```

## Why Gaps Matter More Than FVGs

Candle-based Fair Value Gaps identify immediate single-candle inefficiencies. Volume Gaps identify **structural** inefficiencies that persist across the entire lookback — true zero-volume price regions. This means:

- Gaps span larger price ranges (typically 20–300+ USDT)
- Gaps represent institutional absence, not just missing wicks
- Price tends to return to test these voids because liquidity was never established there
- They act as both targets (during displacement) and rejections (during retracement)

## Delta Sector Logic

The profile is cut vertically into `Summary Sections`. Each section computes:

```
Δ = (ΣBullVol − ΣBearVol) / ΣTotalVol × 100%
```

- If Δ > 0 → green bar (buy dominance)
- If Δ < 0 → red bar (sell dominance)
- Width of the bar is proportional to `|Δ|`, with `deltaMinSize` as a visual floor

**Reading the delta panel top-to-bottom:**
1. Look for the section with the **strongest absolute value** — that's where the most aggressive flow exists
2. Check if the **top sections** (high prices) are bearish → selling into highs
3. Check if the **bottom sections** (low prices) are bullish → buying into lows
4. The **middle** sections tell you where equilibrium is

## Preset Configurations

### Default (Intraday)
```json
{"lookback":200, "rows":50, "summarySections":20, ...}
```
Balanced granularity. 50 rows gives ~17 USDT/bin on a 850 USDT range. 20 delta sections gives 2.5-row vertical sectors.

### Scalping
```json
{"lookback":100, "rows":30, "summarySections":10, ...}
```
Lower lookback = more responsive to recent structure. Fewer rows = broader bins = less noise. Fewer sections = broader directional reads.

### Swing
```json
{"lookback":1000, "rows":150, "summarySections":25, ...}
```
High lookback captures large structure. Many rows for fine-grained detail. Many sections for nuanced delta reading.

## Special Cases

### No gaps detected
- Increase lookback (the range may be too compressed)
- Market may be in consolidation mode (churning in same range, filling all bins)
- Low-volume asset may naturally have fewer voids

### All rows same direction
- Very strong trend — profile shows overwhelming bull or bear dominance
- Delta panel will also show extreme values
- This is a high-confidence signal in that direction

### Gaps near current price
- Most actionable: price is currently testing or nearing a void
- Clean breakout through a gap = strong displacement
- Rejection off a gap = reversal zone to watch

### Delta near zero across all sections
- Balanced market, no institutional pressure
- Avoid directional trading until imbalance emerges
- Consider the gaps as range-bound targets
