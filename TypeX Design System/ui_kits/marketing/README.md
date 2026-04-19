# TypeX marketing site UI kit

A recreation of the product page at https://amptis.com/typex. Single-page
layout with nav + sticky theme toggle, hero + in-window preview, feature grid,
themes split, format chips, install terminal, and footer.

## Files
- `index.html` — mount point.
- `site.css` — all marketing-site styles. Depends on `../../colors_and_type.css`.
- `app.jsx` — single file with `Nav`, `Hero`, `HeroWindow`, `Features`,
  `Themes`, `Formats`, `Download`, `Footer`. Icons inline via `<Icon name=…>`.

## Interactions
- Theme toggle in the nav (sun/moon icon) swaps between Obsidian Ink and
  Ivory Paper. Persisted in localStorage.
- Anchor links (`#features`, `#themes`, `#formats`, `#download`) scroll.
- All buttons are visual only.

## Intentionally stubbed
- No real download link. The `.msi` button points to `#`.
- No analytics, no forms, no newsletter.
