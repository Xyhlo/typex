# TypeX Design System

_The living spec for how TypeX looks, reads, and moves._

This folder is the single source of truth for color, type, motion, chrome, and
brand. Everything else — the app's stylesheets, the marketing page, the Figma
sheet — either references these tokens directly or mirrors them.

## What's here

```
design-system/
├── foundations/
│   ├── colors_and_type.css    # --tx-bg-*, --tx-fg-*, --tx-accent-*, --tx-hl-*,
│   │                          # font stacks, sizes, weights, line-heights
│   ├── spacing.css            # --tx-sp-0 … --tx-sp-10 (4px grid)
│   ├── radii.css              # --tx-radius-xs/sm/md/lg/xl/pill
│   ├── shadows.css            # --tx-shadow-xs/sm/md/lg/glow per theme
│   └── animations.css         # --tx-dur-xs/sm/md/lg/xl + --tx-ease-* + intent aliases
├── components/
│   ├── buttons.css            # .tx-btn, .tx-btn--primary/ghost/subtle/danger/icon
│   ├── cards.css              # .tx-card, .tx-card--floating/flat/hover, .tx-notice
│   ├── inputs.css             # .tx-input, .tx-checkbox, .tx-toggle, .tx-segmented, .tx-kbd, .tx-chip
│   └── navigation.css         # .tx-topbar, .tx-menubar, .tx-menu, .tx-tabs, .tx-sidebar-item
├── brand/
│   ├── logo.svg               # Primary mark (64×64, radial indigo gradient)
│   ├── logo-variations.svg    # Sizes, lockups, monochrome, favicon
│   └── loading-animations.html # 20 branded loaders
└── index.html                 # Design system overview with theme toggle
```

## Using it

Open **`index.html`** in a browser to browse tokens, components, and loaders.
Click "Flip theme" in the top right to toggle Obsidian Ink ↔ Ivory Paper —
every token rebinds in-place so you see exactly what both themes do with the
same markup.

In code, consume tokens via the `--tx-*` CSS custom properties:

```css
.my-button {
  background: var(--tx-accent);
  color: var(--tx-fg-on-accent);
  padding: var(--tx-sp-3) var(--tx-sp-5);
  border-radius: var(--tx-radius-md);
  box-shadow: var(--tx-shadow-sm);
  transition: background var(--tx-motion-press);
}
.my-button:hover { background: var(--tx-accent-hover); }
```

Or drop in the component classes:

```html
<button class="tx-btn tx-btn--primary tx-btn--lg">Download</button>
```

## Naming convention

All tokens and components are prefixed `tx-` to avoid collision with host
projects (marketing page, dashboard, whatever else lives alongside TypeX).

| Prefix | What it is |
|---|---|
| `--tx-bg-*` | surfaces (shell / app / content / raised / overlay / elevated / inset) |
| `--tx-fg-*` | text (fg / heading / muted / subtle / faint / on-accent) |
| `--tx-border*` | strokes (normal / strong / subtle / focus) |
| `--tx-accent*` | indigo (base / hover / active / muted / soft / ring) |
| `--tx-success/warning/danger/info` | semantic feedback |
| `--tx-hl-*` | syntax highlighting (keyword, string, number, comment, func, type, tag, attr, meta, punc) |
| `--tx-font-*` | font stacks (ui / editor / serif / mono) |
| `--tx-fs-* / --tx-lh-* / --tx-fw-* / --tx-ls-*` | font size, line height, weight, letter-spacing |
| `--tx-sp-*` | spacing scale (4px grid) |
| `--tx-radius-*` | border radii |
| `--tx-shadow-*` | elevation |
| `--tx-dur-* / --tx-ease-*` | motion |
| `--tx-motion-*` | intent-based motion aliases (hover / press / panel / reveal / hero) |

## Design rules

1. **Typography first.** The editor content is the subject. Chrome recedes.
2. **Two themes, one semantic contract.** Every `--tx-*` token exists in both
   Obsidian Ink and Ivory Paper. Never fork per-theme tokens.
3. **One accent.** Indigo — `#8b7cff` dark, `#5b4de0` light — used sparingly.
   Never secondary or tertiary brand colors; only neutrals + accent +
   semantic (success/warn/danger/info).
4. **4px grid, always.** All spacing lands on `--tx-sp-*` stops.
5. **Radii progress slowly.** 3 → 5 → 8 → 12 → 16 → pill. Don't invent in-betweens.
6. **Motion is restrained.** `--tx-dur-xs/sm` for feedback, `--tx-dur-md` for
   panels, `--tx-dur-lg+` only for hero/scroll reveals.
   `prefers-reduced-motion: reduce` zeros everything.
7. **No gradients in chrome.** Gradients are reserved for the brand mark and
   the heading-underline flourish beneath `h1` inside the editor.
8. **Warm neutrals only.** Never cool-black or pure white.

## Iterating with save points

See `.save-points/README.md` at the repo root for how to iterate on the
design system and marketing page without losing context between sessions.
