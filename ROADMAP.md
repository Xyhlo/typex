# TypeX — Roadmap

_Last updated: 2026-04-18._

## Shipping in v0.1.0 Beta (Windows)

- Markdown editor (Milkdown) with WYSIWYG editing
- Two hand-tuned themes: **Obsidian Ink** (dark), **Ivory Paper** (light)
- Menu bar (File / Edit / View / Insert / Format / Tools / Help) with
  submenus, access keys, keyboard shortcuts
- Tabs with dirty indicator, close-others/close-all, session restore
- File tree sidebar with "Open folder"
- Outline sidebar generated from headings
- Command palette (Ctrl+K)
- Find + Replace (Ctrl+F / Ctrl+H)
- Autosave (opt-in)
- Pandoc-powered import/export (40+ formats) when Pandoc is on PATH
- Reading width toggle (vertical/horizontal), editor font (sans/serif),
  focus mode, typewriter mode, zoom
- **Syntax highlighting in code blocks** (this release)
- File associations: Windows "Open with TypeX" for .md, .docx, .odt, .rtf,
  .html, .epub, .tex, .rst, .adoc, .org, and more
- MSI installer with single-instance behavior (double-clicking another
  file routes into the running window)

## Not in v0.1.0

**Reminders** and **JSX rendering** are planned future pillars — designs
in sections 2 and 3 below — but they do **not** ship in this beta.

---

## Pillars (product vision)

Three features define the product. Everything else is scaffolding.

1. **Notes** — beautiful, fast markdown editing. Shipped in v0.1.0 beta.
2. **Reminders** — live-tied to the operating system, with real permissions
   and notifications that fire whether or not TypeX is open. **Future.**
3. **JSX rendering** — open a `.jsx` / `.tsx` file, see it pixel-perfectly
   rendered like a Claude artifact. State is preserved across sessions.
   **Future.**

Platform order: **Windows first, macOS second, iOS after those two ship.**

---

## 1. Notes

Status: **mostly done**. Markdown editor, two themes, tabs, file tree,
find/replace, Pandoc import/export, autosave, session restore. What's left
to make the Notes pillar feel complete:

- **Daily note** (`Ctrl+Shift+D`) — creates/opens `daily/YYYY-MM-DD.md` in
  the workspace.
- **Pinned notes** — `Ctrl+P` or drag a tab left to pin; pinned tabs
  survive "Close all others."
- **Wikilinks** `[[Page]]` — click to navigate, auto-create missing files,
  back-links panel in the sidebar.
- **Quick capture** — global hotkey (`Ctrl+Alt+N`) opens a small always-on-top
  window, types one note, saves to `inbox/` and closes. No tab, no chrome.
- **Search across notes** — ripgrep when available, Rust fallback otherwise.
  One keystroke result preview.

Everything else in the notes space (plugins, themes API, collaboration) is
deferred until after Reminders and JSX rendering ship.

---

## 2. Reminders

A note can have reminders. Reminders fire through the operating system, so
they work whether TypeX is open, closed, or the machine is locked.

### 2.1 Author model

Two paths for attaching a reminder:

- **Inline syntax** inside a note:
  ```
  - [ ] Follow up with Sarah @remind 2026-04-25 15:00
  - [ ] Draft proposal @remind "next Monday 9am"
  ```
  Parser picks up `@remind <when>` after a task item and turns it into a
  scheduled reminder tied to that line.

- **UI attach**: select a task item → right-click → "Add reminder…" → date
  picker.

Reminders are stored in `<workspace>/.typex/reminders.json`, keyed by
`{file-path, line-index, created-at}`. The note is the source of truth; the
JSON is a cache.

### 2.2 OS integration

Requires actual OS APIs, not just in-process setTimeout. Two-tier approach:

**Tier 1 — in-process (always on).** When TypeX is open, a ticker reads
pending reminders and shows an in-app toast at the right moment. Nothing to
install.

**Tier 2 — OS-native (fires when TypeX is closed).** Per platform:

- **Windows**
  - Notifications via Windows Toast API (`tauri-plugin-notification`
    backends to `windows-rs` `Windows.UI.Notifications`).
  - Scheduling when app is closed: register reminders with **Windows Task
    Scheduler** (`schtasks.exe` or the `taskschd.dll` COM API). Each
    scheduled task invokes TypeX with `--fire-reminder <id>`, which shows
    the toast and marks the reminder.
  - Permission gate: Windows 11 requires the app to be "registered" for
    toast notifications (AppUserModelID + shortcut). Tauri's notification
    plugin handles this for installed builds; dev builds fall back to a
    fallback dialog.

- **macOS**
  - Notifications via `UNUserNotificationCenter` (requires user
    permission prompt once).
  - Scheduling when app is closed: macOS fires scheduled user notifications
    natively — register the reminder with the system and it delivers even
    if TypeX isn't running.
  - Optional **Apple Reminders.app** bridge: write reminders into the
    user's Reminders list via EventKit, so they also appear on iPhone /
    Apple Watch. Opt-in preference.
  - Permission gate: notification permission requested at first reminder
    creation. EventKit permission requested separately only if user opts
    into Apple Reminders bridging.

- **Linux / iOS** — deferred.

### 2.3 Interaction loop

1. User writes `- [ ] Reply to legal @remind tomorrow 9am`.
2. TypeX parses → creates reminder record → registers OS-level schedule.
3. Sidebar "Reminders" panel lists upcoming, sorted by due.
4. At 9 AM tomorrow, the OS fires the notification (even if TypeX is
   closed). Clicking the notification launches TypeX and jumps to the
   originating line.
5. User marks the task `[x]` → reminder is automatically completed and
   the OS schedule is unregistered.

### 2.4 Edge cases

- **Deleted the note** → orphaned reminder. On next startup, TypeX scans
  for orphans, surfaces them in the panel with "open source…" (disabled) and
  "dismiss."
- **Clock drift / timezone change** → reminders store both wall-clock and
  UTC; if the user crosses a timezone, wall-clock wins ("9 AM" means 9 AM
  wherever you are).
- **Snooze** → right-click OS notification → 5 min / 1 hour / tomorrow.
  Re-registers the OS schedule.
- **Multi-device** → not solved for v1. Reminders are per-workspace,
  per-machine. iCloud sync (mac) and OneDrive sync (Windows) carry the
  `.typex/reminders.json` but each machine also schedules its own OS tasks
  for the same reminders, which would double-fire. Solve later.

### 2.5 Phasing

1. Inline syntax parser + `.typex/reminders.json` + sidebar panel.
2. In-process notifications (Tier 1, any platform).
3. Windows Task Scheduler registration.
4. macOS `UNUserNotificationCenter` registration.
5. Click-to-open from notification → jump to source line.
6. Snooze from notification.
7. macOS Apple Reminders bridge (opt-in).
8. Multi-device dedup (later).

---

## 3. JSX rendering

Open a `.jsx` or `.tsx` file in TypeX — see it rendered exactly the way
Claude (or any AI) would show an artifact. Interact with it. Close and
reopen — your interaction state comes back.

### 3.1 Author model

Two entry points:

- **Open a `.jsx` / `.tsx` file** → TypeX detects it by extension and
  renders it full-canvas in the workspace (same area the editor occupies
  for markdown). A small toggle in the toolbar flips between **Render** and
  **Source** for the file.

- **Fenced code block inside a note**:

  ````
  ```jsx render
  export default function Dashboard() {
    return <div className="p-6">...</div>
  }
  ```
  ````

  Renders inline inside the markdown doc (block-level, full content width).

The file's default export is the component being rendered. No build step,
no config.

### 3.2 Runtime environment

Matches Claude's artifact environment so work moves between them without
rewrites:

- **React 18** (not Preact — Claude uses React).
- **Tailwind CSS** pre-bundled and available via `className="..."`.
- **lucide-react** icons available by default.
- **recharts** available by default.
- **shadcn/ui**-style primitives available by default (Button, Card, Input,
  Dialog, etc.).

These are loaded once per TypeX session into an in-memory bundle; per-file
render doesn't redownload. Bundle is ~300 KB gzipped, lazy-loaded on the
first JSX file open so markdown-only users pay nothing.

### 3.3 Rendering pipeline

1. **Parse & transform.** JSX source → JS via `sucrase` (small, fast, no
   config). Errors render as a small red panel with the message and the
   offending line.
2. **Sandbox.** Render inside an `<iframe sandbox="allow-scripts">` with
   `srcdoc` containing the runtime + the transformed user code.
3. **Bridge.** `postMessage` channel between parent and iframe for:
   - state save/restore (next section)
   - height reflow (iframe grows to content)
   - navigation requests (user's component calling `openFile("…")`)
   - error reports

### 3.4 Save state

This is the differentiator. When the user interacts with the rendered
component — types into an input, toggles a tab, expands an accordion, picks
a value from a dropdown — that state is preserved.

Approach:

- The runtime wraps React's `useState` and `useReducer` in a version that
  tags each state cell with a deterministic **state key** built from the
  component tree path + hook index.
- On every state update, the iframe `postMessage`s the full state map to
  the parent, throttled to ~4 Hz.
- Parent writes it to `<workspace>/.typex/state/<file-hash>.json`.
- On next open, the parent passes the saved state map back in before React
  mounts; the wrapped hooks read their initial values from it instead of
  the component's defaults.

Caveats:

- State keys are *structural*. If the user edits the component (adds a
  hook, reorders JSX), the keys shift and old state is dropped. That's
  correct — old state for a different tree is meaningless.
- `useRef`, imperative DOM state, and animation frames are **not** saved;
  only declared state.
- A "Reset state" button in the toolbar wipes the saved file in one click.

### 3.5 Interaction with markdown + notes

- A markdown note can embed a rendered JSX block (see §3.1). Saving the
  note saves the markdown. Saving state of the embedded component saves to
  `<workspace>/.typex/state/<note-hash>/<block-id>.json`.
- Clicking a link inside a rendered component can open a note by filename:
  `<a href="file://note.md">` → TypeX intercepts, opens that note in a new
  tab instead of navigating the iframe.
- Reminders inside a rendered component: a component can call
  `window.typex.addReminder({ at, text })` (host API) to create a reminder
  bound to the current file. Permission-gated.

### 3.6 Security

- Every rendered file/block is in its own iframe sandbox.
- No network by default. A per-file preference can enable
  `allow-same-origin` + an explicit hostname allow-list (for fetching data,
  embedding maps, etc.). Off by default; always visible in the file's
  toolbar.
- The host API available to components (`window.typex.*`) is small and
  explicitly enumerated: `saveState`, `addReminder`, `openNote`,
  `theme`, `fileName`. No FS access, no process spawn, no clipboard write
  without a user gesture.

### 3.7 Phasing

1. Open `.jsx` → render, no state save, no Tailwind. ("Hello world works.")
2. Tailwind + lucide-react in the runtime bundle.
3. shadcn-style primitives + recharts.
4. State save/restore with structural keys.
5. `.md` embedded JSX blocks.
6. Host API (`window.typex.*`) — opens bridge to notes and reminders.
7. Error panel polish + line mapping from source.
8. Network allow-list preference.

---

## 4. Platform order

1. **Windows desktop** — primary target. Ship everything here first.
2. **macOS desktop** — second target. Port after Windows ships. Mostly a
   matter of swapping Task Scheduler for `UNUserNotificationCenter` and
   adding the optional Apple Reminders bridge.
3. **iOS** — after both desktops are shipping stable. iOS loses Pandoc,
   loses arbitrary OS scheduling (has its own equivalent), loses the
   menubar. Separate design pass when we get there.

---

## 5. Out of scope for now

Consciously deferred until the three pillars above ship:

- AI integrations (beyond rendering AI-authored JSX).
- Real-time collaboration / CRDTs.
- Plugin API.
- Community theme marketplace.
- Publishing pipeline (Gist, Medium, etc.).
- Multi-root workspaces.
- Git status in file tree.
- Multiple windows.
- Virtual-scrolling for huge documents.
- Inline code execution (Python, shell).
- Math / Mermaid / syntax-highlighting (currently installed, not wired —
  wire when we have a reason, don't wire speculatively).

---

## 6. Immediate next steps (small, concrete, orderable)

Pick from the top; each item is a day or less.

1. **Daily note command** (`Ctrl+Shift+D`) — 30 min.
2. **Pinned tabs** — state + CSS already exist; wire the toggle — 1 hr.
3. **Wikilinks** — parser + click-to-open + auto-create — half day.
4. **Reminders panel** (sidebar, reads `.typex/reminders.json`) — half
   day.
5. **Inline `@remind` parser** — half day.
6. **Tauri notification plugin + in-process firing** — half day.
7. **Windows Task Scheduler registration** — 1 day (COM API learning curve).
8. **JSX file detection + sucrase transform + iframe render** ("hello
   world works") — 1 day.
9. **Tailwind + lucide + recharts bundle** in the runtime — half day.
10. **State save/restore with structural keys** — 2 days.

After step 10, we have enough of all three pillars to call it a 1.0 preview.
