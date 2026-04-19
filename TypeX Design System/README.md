# TypeX Design System

> **Typography-first. The editor content is always the subject; chrome recedes.**

TypeX is a WYSIWYG Markdown editor by [Amptis](https://amptis.com), built on
Tauri + Milkdown. It ships as a ~44 MB Windows installer that launches in
~200ms. Two hand-tuned themes share the same semantic tokens (never the same
literals), a real menu bar with Alt-accelerators, bundled Pandoc for 40+
formats, ProseMirror-based editing, and syntax-highlighted code blocks.

**Website:** https://amptis.com/typex
**Repo:** https://github.com/Xyhlo/typex
**License:** MIT (bundled Pandoc is GPL; invoked as sidecar)
**Status:** v0.1.0 beta — Windows only for now

---

## Index

```
README.md                   ← you are here
SKILL.md                    Agent skill manifest (for Claude Code)
colors_and_type.css         All design tokens — the file to copy into new work

assets/                     Logos, wordmarks, reference SVG
preview/                    Design-system cards (registered for the DS tab)
reference/styles/           Verbatim source CSS from Xyhlo/typex (14 files)

ui_kits/
  editor/                   The TypeX desktop editor — Obsidian Ink & Ivory Paper
    index.html              Mount point (React + Babel)
    editor.css              Component styles
    components.jsx          Titlebar, Tabs, Sidebar, EditorPane, Statusbar,
                             CommandPalette, Findbar, FileMenu, icons
    app.jsx                 Top-level App + keyboard shortcuts
    README.md               Kit notes
  marketing/                The amptis.com/typex product page
    index.html              Mount point
    site.css                Marketing-site styles
    app.jsx                 Nav, Hero, Features, Themes, Formats, Download, Footer
    README.md               Kit notes
```

## Quick start

1. Link `colors_and_type.css` from any new HTML — it sets up both themes
   via `data-theme="dark"` (default) and `data-theme="light"` on `<html>`.
2. Use semantic classes: `.type-hero`, `.type-h1`, `.type-body`, `.type-mono`,
   `.type-kbd`, `.type-code-inline`. Everything consumes the token vars.
3. Build chrome around `var(--bg-shell|app|content|raised|overlay|elevated)`
   surfaces. Text always comes from `var(--fg|fg-heading|fg-muted|fg-subtle)`.
4. Accent the one thing that matters. Use `var(--accent-muted)` for
   selected rows; the solid `var(--accent)` for a single primary action.

---

## Sources

- **Uploaded reference SVG:** `assets/design-system-reference.svg` — a complete
  1400×3000 poster of brand mark, color systems (dark + light), typography
  scale, components, and a full app preview. This is the canonical visual
  reference when a token feels ambiguous.
- **GitHub repo:** `Xyhlo/typex` — the living source of truth for tokens is
  `src/styles/themes.css` and `src/styles/tokens.css`. The 14 CSS files
  from that folder are mirrored verbatim in `reference/styles/` so the system
  stays grounded in the real app.
- **Living landing page:** https://amptis.com/typex (not fetched here; if
  iterating, cross-check copy and layout there).

---

## Content fundamentals

**Voice.** Quiet, considered, a little literary. TypeX is a tool for people
who take writing seriously — so the product itself writes carefully.

**Sentence shape.** Short, declarative. Rhythm matters. The README repeatedly
pairs a claim with a specific detail: *"Two hand-tuned themes. Obsidian Ink
(dark) and Ivory Paper (light). Warm neutrals, a confident indigo accent,
typography tuned for long-form writing."* Use this pattern — statement, then
the details that make it true — rather than marketing adjectives.

**Person.** Third person for the product ("TypeX appears in Windows' Open
with menu"). Second person only in help/empty states ("Open a file to get
started"). Never "we" in product copy.

**Casing.** Sentence case everywhere — menu items, buttons, headings, tab
labels. Title Case only in proper names: *Obsidian Ink, Ivory Paper, TypeX,
Amptis, Pandoc, Milkdown, ProseMirror, Tauri*. `.docx`, `.epub`, `.tex` —
lowercase extensions with the dot.

**Punctuation.** Em-dashes — unspaced on web, with spaces in body prose.
Em-dashes are load-bearing: they join claim to reason. Ellipses close menu
items that open dialogs (`Save as…`, `Find in document…`). Oxford commas. Real
apostrophes and quotes, never straight ones. Key names in backticks in docs
(`Ctrl+K`).

**Examples of TypeX phrasing** (copy, don't paraphrase):
- Tagline: *"A Markdown editor that puts typography first."*
- Feature intros: *"Live WYSIWYG markdown. Built on ProseMirror."* then one
  sentence of detail.
- Description of theming: *"Two hand-tuned themes sharing the same semantic
  tokens, never the same literals."*
- Sample body copy inside mocks: *"Field Notes on Quiet Things"* / *"A short
  reader to stress-test the typographic system — headings, inline marks,
  code, quotes, and the spaces between."*
- Coleridge epigraph used in reference SVG: *"The best words in the best
  order."*

**What to avoid.** No emoji in chrome. No exclamation points. No "powerful,"
"seamless," "intuitive," "revolutionary." No "⚡ Blazing fast." Avoid
"delightful." If a sentence sounds like a landing page, rewrite it as a
spec.

**Status strings.** Always precise: `342 WORDS · 2 MIN · MARKDOWN`, `0 / 0`
for find count, `Untitled` for an unsaved doc with `●` as the dirty marker.

---

## Visual foundations

### Color philosophy

Two themes sharing **the same semantic tokens, different literals.** Nothing
is hardcoded — every surface, border, and text color is a var. The indigo
accent reads as "the same hue" in both themes but is tuned for the background
(`#8b7cff` on dark, `#5b4de0` on light) so contrast stays legible.

**Dark — Obsidian Ink.** Warm charcoal surfaces with a slight purple cast.
Surfaces layer `#0f0e12 → #141318 → #17161c → #1d1c24 → #24222c → #2b2934`
(shell → app → content → raised → overlay → elevated). Body text is
`#ebe7dd` (off-white, not pure white) — *parchment, not paper.*

**Light — Ivory Paper.** Cream, not white. Surfaces are `#eeebe4 → #f5f2eb →
#fbfaf6 → #ffffff`. Text is `#1c1b22` (warm near-black, never `#000`).

### Typography

- **UI + editor body:** Inter with `-apple-system`, `Segoe UI Variable`, and
  Segoe UI fallbacks. Heading tracking `-0.014em`, hero title `-0.02em`.
- **Code:** JetBrains Mono with SF Mono / Cascadia Code / Fira Code /
  Menlo / Consolas fallbacks. OpenType features `calt` *off* in inline code
  to prevent ligature surprises.
- **Optional serif:** `Iowan Old Style` / Palatino Linotype / Baskerville /
  Georgia for users who want an editor serif.
- **Em-based heading scale.** H1 = 2em, H2 = 1.6em, H3 = 1.3em, H4 = 1.1em,
  H6 = 0.85em uppercase eyebrow. Zoom scales every level proportionally.
- **Body metrics.** `16.5px` with line-height `1.75`, max-width `72ch` (wide
  reading mode `110ch`). Paragraph rhythm is `sp-4 / sp-3` — never just
  `margin-bottom: 1em`.

### Spacing, radii, motion

- **4px grid.** `sp-1` through `sp-10` (4, 8, 12, 16, 20, 24, 32, 40, 56, 72).
- **Radii.** `3 / 5 / 8 / 12 / 16` px + pill. Code blocks and modals use
  `8 / 12`. Pills are reserved for toggles and format chips.
- **Motion durations.** `90 / 160 / 220 / 320 / 480 ms` on
  `cubic-bezier(0.2, 0, 0, 1)`. `prefers-reduced-motion` drops them all to 0.
  Hover transitions fade `color + background` together at `--dur-sm`; menus
  animate in at `--dur-sm` with the emphasized cubic; palette uses `--dur-md`.

### Surfaces, borders, shadows

- **No flat blobs.** Surfaces always layer: shell < app < content < raised
  < overlay < elevated. The sidebar rail uses `--bg-app` against a
  `--bg-raised` content area so it's obviously distinct without a hard line.
- **Borders are low-contrast by default.** `rgba(255,255,255,0.07)` on dark,
  `rgba(28,26,32,0.09)` on light. Focus rings upgrade to the accent color
  with `0 0 0 3px var(--accent-ring)`.
- **Shadows are warm and directional.** Dark shadows are deep (`alpha 0.45`);
  light shadows are airy with colored tints (`rgba(28,26,32,0.08)`). There's
  also a `--shadow-glow` that wraps the accent — reserved for the brand mark
  and preferences-level focus.

### Interaction states

- **Hover.** Chrome elements swap to `--bg-overlay` and upgrade text from
  `--fg-muted` to `--fg`. Links grow their underline from 1px to 2px (body
  copy uses a `linear-gradient` background trick, not `text-decoration`).
- **Active / press.** Buttons translate down 1px or scale to 0.94; the
  primary button additionally darkens one step via `--accent-active`. No
  colour flash on release.
- **Selected.** `--accent-muted` (rgba indigo at 10–15%) for rows and menu
  items; the sidebar's active tab gets a solid 2px accent rail on the left
  edge.
- **Focus.** `outline: 2px solid var(--border-focus)` with a 2px offset for
  keyboard users; inputs additionally get a `0 0 0 3px var(--accent-ring)`
  halo.

### Backgrounds & imagery

- **No gradients in chrome** except the brand mark (a radial indigo) and the
  H1 underline (`linear-gradient(90deg, var(--accent), transparent)`).
- **No background images, illustrations, or textures.** The product is
  almost entirely solid surfaces; the only "decoration" is the 36×2px
  gradient rule under H1 and the indigo radial in the brand mark.
- **Imagery for marketing** should be product screenshots — warm-neutral
  matching the chrome, never photography.

### Transparency & blur

Used sparingly and purposefully:
- **Modal + command-palette backdrops** use `backdrop-filter: blur(6px)
  saturate(140%)` over `rgba(0,0,0,0.38)` (dark) / `rgba(28,26,32,0.22)` (light).
- **Selection** is always translucent (`rgba` at 18–32% of accent).
- **`mark` highlights** use a `linear-gradient(180deg, transparent 62%,
  var(--accent-muted) 62%)` highlighter-pen trick, not a solid fill.

### Cards, inputs, buttons

- **Cards.** `var(--bg-raised)` fill, `1px solid var(--border)`, `radius-md`
  (8px), `--shadow-sm`. Never a colored left-border accent — if a card needs
  an indigo hit, use a full indigo rail inside (e.g. blockquotes).
- **Inputs.** `var(--bg-inset)` fill, `1px solid var(--border)`, `radius-sm`
  (5px). Focus swaps to `--border-focus` with the `--accent-ring` halo.
- **Primary button.** Solid `--accent`, `fg-on-accent` label,
  `radius-md` (8px), `shadow-xs` + inset 1px `--accent-active` for the
  subtle top-highlight. Hover → `--accent-hover` + `shadow-sm`.
- **Ghost button.** No fill, `fg-muted` text, hover to `--bg-overlay`.

### Keyboard as first-class UI

Shortcut hints appear *everywhere* — on menu items
(`Ctrl+Shift+S`), in command-palette rows, in tooltips. Alt-accelerators are
underlined in the menubar when Alt is held. `kbd` is a real styled element
(border-bottom 2px, `font-mono`), not parentheses around text.

---

## Iconography

See [ICONOGRAPHY.md](#iconography-1) below. Short version: TypeX uses
**inline SVG icons drawn as a 24×24 viewBox stroke system** — `stroke-width
1.6` in the sidebar rail, `1.8` everywhere else, `stroke-linecap: round`,
`stroke-linejoin: round`, `fill: none`, `stroke: currentColor`. This matches
Lucide / Feather conventions. Emoji appears only in one place: the pinned-tab
indicator (📌) — and even that is tentative. No icon font.

## Iconography

- **System.** Inline SVGs, 16/18×18 or 24×24 viewBox, stroke-based,
  `currentColor`. Close to Lucide / Feather style — if you need icons not in
  the `reference/styles/` + `index.html` vocabulary, pull from Lucide
  (https://lucide.dev) and keep the stroke convention consistent.
- **Stroke weights.** 1.6 for sidebar-rail icons, 1.8 for toolbar and menu
  icons, 2.0 for find-bar small icons.
- **Fill icons.** Only one: the checkbox checkmark (a 2px-stroked rotated
  square, drawn with CSS borders). No filled glyphs elsewhere.
- **Logos & marks.** See `assets/logo-mark-dark.svg`,
  `assets/logo-mark-light.svg`, `assets/wordmark-dark.svg`,
  `assets/wordmark-light.svg`. The mark is a rounded square (radius ≈
  22% of side length: 128→28, 64→14, 32→7, 16→4) filled with a radial
  indigo gradient. Never outlined, never on a colored chip.
- **Emoji.** Don't. The one exception (📌 on pinned tabs) is tentative.
- **Unicode as icon.** Used sparingly for math/arrows in submenus (`▸`,
  `✓`), never for brand moments.

---

## Caveats

- Fonts are specified by family name with fallbacks. **No TTF/WOFF files
  are bundled in this design system** — for mocks we rely on Google Fonts
  Inter + JetBrains Mono (loaded via CDN in preview cards) and fall back to
  system fonts otherwise. If you need pixel-perfect Windows rendering, pair
  this system with the real Segoe UI Variable stack on a Windows host.
- `Iowan Old Style` (the preferred serif) is Apple-only and has no Google
  Fonts equivalent; we substitute **Palatino / Georgia** with no visible
  import. Flagged — swap to a commissioned serif if precision matters.
- The Pandoc / Windows-native bits (MSI, file associations, `.docx` round-
  trip) are not representable in HTML mocks. The editor UI kit shows the
  surface, not the format round-tripping.
