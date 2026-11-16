# DeskGlass – DESIGN

Dark glass, Windows 11 feel. Real desktop blur comes from the OS (`backgroundMaterial: 'acrylic'`);
CSS only adds a faint tint, border and type. CSS `backdrop-filter` is NOT used for the desktop blur.

## Tokens (`src/renderer/styles/tokens.css`)
| Token | Value | Use |
|---|---|---|
| `--bg-tint` | `rgba(20,22,28,.35)` | Over acrylic, keeps text legible |
| `--bg-card` | `rgba(255,255,255,.06)` | Inner rows/cards |
| `--bg-card-hover` | `rgba(255,255,255,.10)` | Hover |
| `--border` | `rgba(255,255,255,.12)` | 1px window + card border |
| `--text` | `rgba(255,255,255,.92)` | Primary |
| `--text-dim` | `rgba(255,255,255,.62)` | Secondary |
| `--text-faint` | `rgba(255,255,255,.38)` | Labels, n/a |
| `--accent` | `#60cdff` | Win11 dark accent; bars, links, focus |
| `--ok / --warn / --bad` | `#6ccb5f / #fce100 / #ff7a7a` | Meter thresholds (<70 / <90 / >=90 %) |
| `--radius` | `12px` window, `8px` cards | Matches Win11 rounding |
| `--space-1..5` | `4 8 12 16 24px` | Only these spacings |

## Type
`"Segoe UI Variable Display","Segoe UI Variable Text","Segoe UI",Inter,system-ui`. Sizes: clock 56/600, title 13/600 uppercase-faint,
body 13/400, small 11/400. Tabular numerals for all live numbers.

## Layout rules
- Widget = 16px padding, header row (title + status dot), content, no scrollbars (thin custom scrollbar in lists).
- Window border: 1px `--border` inset + soft shadow; unlocked mode adds 1px dashed `--accent` outline.
- Motion: entrance fade+rise 220ms `cubic-bezier(.2,.8,.2,1)`, hover bg 120ms, meter width 400ms. `prefers-reduced-motion` disables all.
- Focus: 2px `--accent` ring. Contrast >= 4.5:1 for body text on the tinted acrylic.

## Widgets (size px)
Default (M) sizes: clock 300x150 · stats 300x320 · weather 300x270 · agenda 340x400 · music 360x150 · chat 380x480 · settings 540x600 (normal window).
S/M/L presets and min/max limits live in `src/shared/types.ts`. All widgets are resizable: use `cq*` units / container queries, never fixed pixel layouts.

## Music widget
Cover art left, title/artist/progress/controls right; blurred cover as backdrop (opacity .4) and the cover's average colour as accent (`--accent-m`, brightened for contrast). At small heights the artist/times collapse; at small widths the cover hides.

## Edit mode
Unlocked: dashed accent outline and a 18 px diagonal-grip resize handle bottom-right. Locked: neither outline nor handle; nothing else changes (widgets stay clickable and behind all windows).
