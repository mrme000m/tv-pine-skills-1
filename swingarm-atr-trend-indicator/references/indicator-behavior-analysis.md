# SwingArm ATR Trend Indicator - Behavior Analysis

## Source Material
- **TradingView Script**: [SwingArm ATR Trend Indicator](https://www.tradingview.com/script/Dxc0Pi3n-SwingArm-ATR-Trend-Indicator/) (Pine ID: `PUB;GdkmXaTINI8knwuCrctQD1pB5dFaRnyr`)
- **Tutorial Video**: [YouTube: SwingArm ATR Trend Indicator](https://www.youtube.com/watch?v=lMPTI-ndomw)
- **Input Definition**: `/tmp/indicator-inputs.json`
- **Full Indicator Details**: `/tmp/indicator-full.json`

## Core Indicator Behavior (Video Transcript Summary)
The SwingArm ATR Trend Indicator is an ATR-based trend following tool that visualizes trend direction through chart background coloring and trailing stop levels:
1. **Background Coloring**:
   - GREEN background = Bullish trend (price trading above ATR-based trailing stop)
   - RED background = Bearish trend (price trading below ATR-based trailing stop)
2. **Signal Generation**:
   - **BUY Signal**: GREEN background + price closes above green trailing stop area
   - **SELL Signal**: RED background + price closes below red trailing stop area
3. **Key Configuration**:
   - ATR Period: Default 28, **video recommends 21** for improved responsiveness
   - ATR Factor: Multiplier for ATR distance (default 5)
   - Trailtype: `modified` (smoothed ATR) or `unmodified` (standard ATR)

## TradingView Input Specifications
From `/tmp/indicator-inputs.json`:
| Input ID | Name | Type | Default | Options | Description |
|----------|------|------|---------|---------|-------------|
| `in_4` | Indicator Timeframe | resolution | "" | - | Override indicator timeframe (blank = chart timeframe) |
| `in_0` | Trailtype | text | "modified" | ["modified", "unmodified"] | ATR calculation method |
| `in_1` | ATR Period | integer | 28 | 1-100 | Period for ATR calculation (recommended: 21) |
| `in_2` | ATR Factor | integer | 5 | - | Multiplier for ATR distance |
| `in_3` | Show Fib Entries? | bool | true | - | Show Fibonacci entry levels |

## Plot Outputs (from `/tmp/indicator-full.json`)
The indicator outputs the following visual elements:
| Plot ID | Name | Type | Purpose |
|---------|------|------|---------|
| `plot_0` | Trailingstop | Line | Core trailing stop level |
| `plot_1` | Trailingstop_colorer | Color | Colors the trailing stop line |
| `plot_2` | Extremum | Point | Swing high/low points |
| `plot_3` | Extremum_colorer | Color | Colors extremum points |
| `plot_4`-`plot_6` | Fib1-Fib3 | Line | Fibonacci levels |
| `plot_7` | l100 | Line | 100% level? |
| `plot_8`-`plot_10` | fill_0_colorer-fill_2_colorer | Fill | Background color fills (green/red) |
| `plot_11`-`plot_13` | LS1-LS3 | Label | Long (buy) Swing Fib entries |
| `plot_14`-`plot_16` | SS1-SS3 | Label | Short (sell) Swing Fib entries |
| `plot_17`-`plot_19` | crossoverFib1-3 | Label | Crossover Fib levels |
| `plot_20`-`plot_22` | crossunderFib1-3 | Label | Crossunder Fib levels |
| `plot_23` | StopLineChange | Event | Trailing stop level change marker |

## Calculation Logic (Inferred)
1. **ATR Calculation**: Compute ATR over `ATR Period` (default 28, recommended 21)
2. **Trailing Stop**:
   - `modified` mode: Smoothed ATR calculation with `ATR Factor` multiplier
   - `unmodified` mode: Standard ATR * `ATR Factor`
3. **Background Fill**:
   - When price > trailing stop: Green fill (bullish)
   - When price < trailing stop: Red fill (bearish)
4. **Fib Entries** (optional): Plots LS (Long Swing) and SS (Short Swing) levels at Fibonacci retracements of recent swings.

## Signal Confirmation Rules
Per video tutorial:
1. Wait for background color to persist for 1-2 bars (avoid false signals)
2. Enter only when price clearly breaks above/below trailing stop area
3. Use ATR Period 21 for faster signals, 28 for more stable trends
4. Combine with other indicators for confluence (not a standalone system)

## Known Limitations
- Background color changes can lag during high volatility
- Trailing stop may whipsaw in ranging markets
- Fib entry levels are optional and not core to trend signals
- Indicator works best on 15m, 1h, and 4h timeframes per tutorial
