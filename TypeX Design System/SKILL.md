---
name: typex-design
description: Use this skill to generate well-branded interfaces and assets for TypeX, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for protoyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation
- `colors_and_type.css` is the single drop-in stylesheet. Link it and use the CSS vars + `.type-*` utility classes.
- `reference/styles/` is the real TypeX app CSS — read it to understand how a given component is actually built.
- `ui_kits/editor/` shows the desktop editor in both themes (Obsidian Ink dark, Ivory Paper light).
- `ui_kits/marketing/` shows the product marketing page.
- `preview/*.html` are small self-contained specimens suitable for embedding, screenshotting, or copy-pasting.

## Principles to preserve
- Typography-first. Content is the subject. Chrome recedes.
- Two themes sharing the same semantic tokens — never hardcode colors.
- Warm neutrals. Never pure white, never pure black. Never clinical gray.
- Indigo accent: `#8b7cff` on dark, `#5b4de0` on light. The same hue, retuned for contrast.
- Shortcuts are first-class UI. Show `Ctrl+K`-style hints next to every command.
- Sentence case. Third person for the product. No emoji, no exclamation points.
