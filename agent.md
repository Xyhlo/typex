# TypeX Agent Handbook

Last reviewed: 2026-04-26

This is the shared handoff file for AI agents working on TypeX. Keep it current,
practical, and signed. The goal is that any future agent can open this file and
quickly understand the product, the codebase, the current status, and what was
changed most recently.

## Agent Contribution Rule

Every AI that edits this file must identify itself in every entry it adds or
updates.

Required identity fields:
- Agent name: the model or assistant name the agent is operating under.
- Self-assigned ID: a stable ID for that work session, for example
  `Codex-TX-20260426-001`.
- Date: use an absolute date.
- Scope: what section or files were updated.

Use this format for progress entries:

```md
### YYYY-MM-DD - Short title
- Agent: Name
- ID: SelfAssigned-ID
- Files touched: `path`, `path`
- Summary: What changed and why.
- Verification: Commands or manual checks performed.
- Next: Follow-up work or `None`.
```

Do not remove another agent's signed entry unless the user explicitly asks for
cleanup. If an old entry becomes inaccurate, add a new signed correction and
point to the outdated section.

## Project Summary

TypeX is a native desktop WYSIWYG Markdown editor by Amptis. It is built with
Tauri 2, a Rust backend, and a strict vanilla TypeScript frontend. The editor
uses Milkdown and ProseMirror for live Markdown editing, Pandoc as a bundled
sidecar for document conversion, and a token-driven CSS design system for two
themes.

Current package/app version: `0.4.0`

Primary product pillars:
- Live WYSIWYG Markdown editing with CommonMark and GFM.
- Pandoc-powered import/export for Word, ODT, RTF, EPUB, HTML, LaTeX, Org,
  reStructuredText, AsciiDoc, and more.
- Native Windows desktop app with MSI packaging and file associations.
- Tabs, command palette, real menu bar, find/replace, focus mode, typewriter
  mode, and session restore.
- AI writing features through API and CLI providers.
- Git status, gutter, autocommit, autopush, and pull-on-focus.
- Vault-style workspace indexing for tags, backlinks, wikilinks, and
  frontmatter properties.

## Repository Map

Important paths:
- `src/`: strict TypeScript frontend.
- `src/main.ts`: app bootstrap, command wiring, save/open/export flow, prefs.
- `src/state.ts`: central observer store and tab/workspace state.
- `src/commands.ts`: command registry and command palette filtering.
- `src/editor/`: Milkdown setup and ProseMirror plugins.
- `src/fs/`: file dialogs, filesystem bridge, Pandoc frontend bridge, watchers.
- `src/fs/file-types.ts`: central file-type resolver for Markdown, code,
  plain text, document-conversion targets, images, and known binaries.
- `src/ui/`: menu bar, tabs, sidebars, modals, status bar, panels.
- `src/ui/code-preview.ts`: syntax-highlighted read surface for code/text tabs.
- `src/ai/`: AI provider manager, secrets, autocomplete, CLI bridge.
- `src/git/`: frontend Git API, status cache, autosync.
- `src/vault/`: workspace index for Markdown metadata.
- `src/styles/`: design tokens, themes, layout, component styles.
- `src-tauri/src/`: Rust Tauri backend commands.
- `src-tauri/src/lib.rs`: command registration, single-instance handling.
- `src-tauri/src/pandoc.rs`: Pandoc sidecar resolution and conversion.
- `src-tauri/src/git.rs`: Git command execution.
- `src-tauri/src/watcher.rs`: filesystem watcher.
- `src-tauri/src/secrets.rs`: OS keyring wrapper.
- `src-tauri/src/cli_runner.rs`: spawned CLI provider bridge.
- `src-tauri/capabilities/default.json`: Tauri plugin permissions.
- `src-tauri/tauri.conf.json`: Tauri app and bundle configuration.
- `design-system/`: living brand/design-system gallery.
- `docs/release-notes/`: release note documents.

## How To Use And Build

Install dependencies:

```powershell
npm install
```

Fetch the bundled Pandoc sidecar:

```powershell
npm run fetch-pandoc
```

Run the desktop dev loop:

```powershell
npm run tauri:dev
```

Build the frontend only:

```powershell
npm run build
```

Check Rust:

```powershell
cd src-tauri
cargo check
```

Build the production MSI:

```powershell
npm run tauri:build
```

Latest verified MSI output path:

```text
src-tauri/target/release/bundle/msi/TypeX_0.4.0_x64_en-US.msi
```

## Architecture Notes

State:
- No React, Vue, or Angular. State lives in `src/state.ts`.
- `getState()` returns the current app state.
- `setState(patch)` merges shallowly and notifies subscribers.
- Tabs are represented by `DocTab`.
- Dirty state is `tab.content !== tab.savedContent`.

Editor:
- There is one Milkdown/ProseMirror editor instance.
- Switching tabs swaps content into the same editor.
- Call `editor.cancelStream()` before tab/content swaps if a stream may be
  active.
- Programmatic content changes must be guarded so editor `onChange` does not
  accidentally mark external loads as user edits.

File I/O and conversion:
- Markdown and text files use Tauri FS read/write directly.
- Non-Markdown formats are converted with Pandoc through Rust commands.
- Pandoc is a separate sidecar executable. Do not link Pandoc libraries into
  the Rust binary.
- File watcher events are suppressed for recent TypeX writes through
  `markOwnWrite()`.

AI:
- Providers are registered in `src/ai/manager.ts`.
- API providers store keys through the OS keyring.
- CLI providers use `src/ai/cli-runner.ts`, which invokes Rust
  `cli_runner.rs`.
- CLI detection runs at startup and when Preferences opens.

Git:
- Rust shells out to the user's configured `git`.
- Git commands are intentionally non-interactive.
- Autosync lives in `src/git/autosync.ts`.
- Pull-on-focus uses `git pull --ff-only` and should not create merge commits.

Vault:
- `src/vault/index.ts` scans Markdown files in workspace roots.
- It extracts titles, tags, wikilinks, backlinks, and frontmatter.
- It supports multiple workspace roots and dedupes nested-root paths.

Styling:
- CSS is token-driven and split by surface in `src/styles/`.
- Current themes are Obsidian Ink and Ivory Paper.
- Keep UI changes aligned with existing tokens and vanilla DOM patterns.

## Important Constraints

- Preserve user changes. Do not reset, checkout, or revert files unless the user
  explicitly asks.
- Prefer existing project patterns over new abstractions.
- Keep edits narrowly scoped.
- Strict TypeScript is enabled. Unused variables or parameters can fail builds.
- On Windows, every Rust subprocess using `std::process::Command` or
  `tokio::process::Command` must hide console windows with `CREATE_NO_WINDOW`.
- Broad filesystem access currently depends on the Tauri FS scope in
  `src-tauri/capabilities/default.json`.
- Release notes belong in `docs/release-notes/`, not the repository root.

## Verification Checklist

For most code changes, run the smallest relevant set:
- `npm run build`
- `cargo check` from `src-tauri`

For packaging, installer, Tauri capability, sidecar, or Windows integration
changes, also run:
- `npm run tauri:build`

For UI-heavy changes, run the app and inspect the affected screen manually.

## Current Status

Verified on 2026-04-26:
- `cargo check` passes.
- `npm run build` passes.
- `npm run tauri:build` passes.
- Production MSI builds successfully at
  `src-tauri/target/release/bundle/msi/TypeX_0.4.0_x64_en-US.msi`.

Current working changes at the time this handbook was created:
- Windows subprocess console-window suppression in `src-tauri/src/cli_runner.rs`.
- Windows default-app launcher console-window suppression in `src-tauri/src/lib.rs`.
- Broad Tauri FS scope in `src-tauri/capabilities/default.json`.
- Root `agent.md` created.
- Release notes moved to `docs/release-notes/`.
- Old `kimi.md/` handoff folder removed after migration.
- Universal code/text file opening and read/write mode support is implemented
  in the current worktree.

## Plans And Open Items

Near-term:
- Install and manually smoke-test the generated MSI.
- Open and save a file from another drive, such as `D:\`, in the installed app.
- Check whether the broad `fs:scope` of `**` is the right long-term security
  posture for a document editor.
- Consider adding a subprocess-spawn audit test or lint note for Windows
  `CREATE_NO_WINDOW`.

Product roadmap from the existing project docs:
- Windows desktop first.
- macOS and iOS later.
- Future OS reminders integration.
- Future JSX/TSX rendered artifact support.

## Progress Log

### 2026-04-26 - Universal code/text viewer and writer mode
- Agent: Codex
- ID: Codex-TX-20260426-001
- Files touched: `src/fs/file-types.ts`, `src/ui/code-preview.ts`,
  `src/main.ts`, `src/state.ts`, `src/ui/tabs.ts`, `src/ui/view-mode.ts`,
  `src/ui/statusbar.ts`, `src/fs/files.ts`, `src/export.ts`, `src/styles/editor.css`,
  `src/styles/shell.css`, `index.html`, `src-tauri/tauri.conf.json`,
  `agent.md`
- Summary: Implemented TypeX-native universal text/code opening. Tabs now carry
  a document kind and optional syntax language. Markdown and Pandoc-converted
  documents continue through Milkdown, while code/text files open as raw text,
  render in a syntax-highlighted read surface with line numbers, and use the
  existing raw pane as write mode. Save, Save As, autosave, revert, find/replace,
  raw export, file-tree visibility, status labels, and Windows file associations
  were updated around the new document-kind boundary.
- Verification: `npm run build`, `cargo check`, and `npm run tauri:build`
  passed. The production MSI was rebuilt at
  `src-tauri/target/release/bundle/msi/TypeX_0.4.0_x64_en-US.msi`.
- Next: Manual installed-app smoke test for `.py`, `.bat`, `.json`, `.txt`,
  Markdown export, and code raw export.

### 2026-04-26 - Agent handbook and repo organization
- Agent: Codex
- ID: Codex-TX-20260426-001
- Files touched: `agent.md`, `docs/release-notes/*`, `kimi.md/*`
- Summary: Migrated the useful shared context from the old `kimi.md/` folder
  into this root `agent.md`, added explicit AI contribution identity rules,
  documented the current app architecture and verification state, and moved
  root release-note files into `docs/release-notes/`.
- Verification: Confirmed `agent.md` exists at the repo root, `kimi.md/` is
  removed, release notes are under `docs/release-notes/`, and `git status
  --short` shows the expected source changes plus new docs.
- Next: None.

### 2026-04-26 - Verification of Kimi fixes
- Agent: Codex
- ID: Codex-TX-20260426-001
- Files touched: none
- Summary: Read the previous Kimi notes, inspected the Rust/Tauri changes, and
  confirmed the intended fixes are present in the codebase.
- Verification: `cargo check`, `npm run build`, and `npm run tauri:build`
  passed. The build produced
  `src-tauri/target/release/bundle/msi/TypeX_0.4.0_x64_en-US.msi`.
- Next: Manual installed-app smoke test is still recommended.

### 2026-04-23 - CMD window spam and cross-drive file access fixes
- Agent: Kimi
- ID: Kimi-TX-20260423-001
- Files touched: `src-tauri/src/cli_runner.rs`,
  `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`
- Summary: Added `CREATE_NO_WINDOW` handling to CLI provider detection and
  streaming subprocesses, added the same pattern to the Windows default-app
  settings launcher, and expanded the Tauri FS scope so files outside standard
  user folders can be opened and saved.
- Verification: Kimi reported `cargo check` passed. Codex later verified with
  `cargo check`, `npm run build`, and `npm run tauri:build`.
- Next: Manual MSI smoke test and cross-drive open/save test.

### 2026-04-23 - Initial project map
- Agent: Kimi
- ID: Kimi-TX-20260423-001
- Files touched: `kimi.md/agent.md`, `kimi.md/progress.md`
- Summary: Explored the codebase and documented the TypeX structure, core
  architecture, major subsystems, and Windows subprocess requirement.
- Verification: Documentation-only update.
- Next: Migrated into this root `agent.md` on 2026-04-26.
