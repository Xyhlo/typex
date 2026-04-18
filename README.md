# TypeX

> A Markdown editor that puts typography first.

TypeX is a WYSIWYG Markdown editor with two hand-tuned themes, a real menu bar,
and Pandoc-powered import/export for 40+ formats. Built on Tauri + Milkdown,
so it ships as a ~44 MB installer that launches in a few hundred milliseconds.

**Website**: <https://amptis.com/typex>
**Status**: v0.1.0 beta — Windows only for now.

---

## What it does

- **Live WYSIWYG markdown.** Built on ProseMirror. Markdown syntax transforms
  into real formatting as you type — no separate preview pane.
- **Two hand-tuned themes.** *Obsidian Ink* (dark) and *Ivory Paper* (light).
  Warm neutrals, a confident indigo accent, typography tuned for long-form
  writing.
- **40+ formats, one editor.** Open `.docx`, `.odt`, `.epub`, `.rtf`, `.tex`,
  `.rst`, `.adoc`, `.org`, `.html`, and more. Save back to any of them. Pandoc
  is bundled — nothing to install.
- **Syntax-highlighted code.** Lowlight AST + ProseMirror decorations: your
  code gets colored without mutating the DOM, so cursor and selection stay
  honest during edits.
- **Real menu bar.** File / Edit / View / Insert / Format / Tools / Help with
  Alt-accelerators, submenus, checkmarks, and shortcut hints — not a dressed-up
  popover.
- **Command palette.** `Ctrl+K` opens every action in the app.
- **File associations.** Registers TypeX as an "Open with" option for 17 format
  groups on Windows. Single-instance routing: double-clicking another file sends
  it to the running window instead of spawning a second copy.
- **Focus mode, typewriter mode, reading width, zoom** — the usual writer
  comforts, done properly.
- **Find + Replace** via the CSS Highlight API (no DOM mutation, so ProseMirror
  stays in sync).
- **Autosave + session restore** — closes and reopens where you left off.

---

## Install

**Windows 10 or 11, x64.** [Download the latest MSI][latest].

The installer includes:

- TypeX itself (~3.5 MB)
- Pandoc 3.9 (bundled; ~220 MB on disk, ~40 MB inside the MSI)
- WebView2 bootstrapper (auto-installs on first run if not already present)

Total download: ~44 MB. After install, TypeX appears in Windows' "Open with…"
menu for Markdown, Word, OpenDocument, EPUB, LaTeX, reStructuredText, AsciiDoc,
Org mode, and more.

[latest]: https://github.com/Xyhlo/typex/releases/latest

---

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New document | `Ctrl+N` |
| Open file | `Ctrl+O` |
| Open folder | `Ctrl+Shift+O` |
| Save / Save as / Save all | `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+Alt+S` |
| Close tab | `Ctrl+W` |
| Find / Replace | `Ctrl+F` / `Ctrl+H` |
| Command palette | `Ctrl+K` |
| Preferences | `Ctrl+,` |
| Toggle theme | `Ctrl+Shift+L` |
| Toggle reading width | `Ctrl+Shift+W` |
| Toggle sidebar / focus | `Ctrl+\` / `Ctrl+.` |
| Bold / Italic / Strike | `Ctrl+B` / `Ctrl+I` / `Ctrl+D` |
| Inline code | `` Ctrl+` `` |
| Heading 1–6 / paragraph | `Ctrl+1–6` / `Ctrl+0` |
| Zoom in / out / reset | `Ctrl+=` / `Ctrl+-` / `Ctrl+9` |
| Fullscreen | `F11` |

Every shortcut also has a menu entry and a command-palette entry.

---

## Development

```bash
# Install JS deps
npm install

# Download the bundled Pandoc binary for the current host
npm run fetch-pandoc

# Dev loop — hot-reloads the webview, compiles Rust once
npm run tauri:dev

# Production build (produces the MSI on Windows)
npm run tauri:build
```

### Tech stack

- **[Tauri 2](https://tauri.app)** — Rust backend, native webview, small bundle.
- **[Milkdown](https://milkdown.dev)** — ProseMirror-based WYSIWYG markdown.
- **TypeScript** — strict mode, all the trimmings on.
- **[Lowlight](https://github.com/wooorm/lowlight)** — highlight.js AST without
  the DOM mutations.
- **[Pandoc](https://pandoc.org)** — bundled as a sidecar binary for format
  conversion. Invoked as a separate process so the GPL stays at the Pandoc
  boundary.

### Project structure

```
src-tauri/        Rust backend: Tauri commands, Pandoc wrapper, single-instance
  ├─ src/lib.rs   Command registration + single-instance hooks
  ├─ src/pandoc.rs  Pandoc sidecar resolution + conversion commands
  └─ binaries/    Pandoc binary (gitignored; fetched by `npm run fetch-pandoc`)

src/              TypeScript frontend
  ├─ editor/      Milkdown setup + custom PM plugins
  │    ├─ editor.ts            Factory + command dispatch
  │    ├─ markdown-paste.ts    Treat pasted text as markdown (handleDOMEvents)
  │    ├─ syntax-highlight.ts  Lowlight → PM decorations
  │    └─ view-hooks.ts        Focus mode + typewriter caret tracking
  ├─ fs/          File I/O + Pandoc bridge + launch-path handling
  ├─ ui/          Menubar, tabs, file-tree, findbar, modal, palette, sidebar
  ├─ styles/      Design tokens + themes + component styles
  └─ main.ts      Wires it all together

ROADMAP.md        Beta scope + future pillars
```

### Build pipeline notes

- `npm install` on Windows from Git Bash: set Node on cmd's PATH before
  running, otherwise esbuild's postinstall can't find `node`.
  ```
  set PATH=C:\Program Files\nodejs;%PATH%
  npm install
  ```
- `npm run fetch-pandoc` calls the GitHub API for Pandoc's latest release,
  picks the right asset for the host platform, and writes the binary to
  `src-tauri/binaries/pandoc-<target-triple>[.exe]` for Tauri's `externalBin`
  to pick up.
- Placeholder app icons are generated by `scripts/generate-icons.mjs` (pure
  Node, no native deps). Replace with commissioned artwork before any release.

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full product vision. In short:

- **Shipped in 0.1.0 beta** — the markdown editor pillar, Pandoc integration,
  syntax highlighting, file associations, MSI installer.
- **Future** — Reminders tied to the OS (Windows Task Scheduler + macOS
  UNUserNotificationCenter), and JSX rendering (open a `.jsx` / `.tsx` file,
  see it rendered like a Claude artifact, with interaction state persisted).
- **Platform order** — Windows → macOS → iOS.

---

## License

[MIT](./LICENSE). TypeX bundles Pandoc, which is GPL — Pandoc is invoked as a
separate executable (sidecar), so the GPL applies to Pandoc itself but does
not propagate to TypeX. You can replace the bundled Pandoc with any compatible
binary at `<install-dir>/pandoc.exe`.

---

## Credits

Built by [Amptis](https://amptis.com). Pandoc credit belongs to
[John MacFarlane and contributors](https://pandoc.org/). Milkdown by
[Milkdown contributors](https://milkdown.dev). ProseMirror by
[Marijn Haverbeke](https://prosemirror.net).
