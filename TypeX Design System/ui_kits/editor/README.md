# TypeX editor UI kit

A hi-fi recreation of the TypeX desktop editor — Windows chrome with a real
menu bar, tabs, file sidebar, the ProseMirror-flavored content area, and
statusbar. Both themes (Obsidian Ink dark, Ivory Paper light) are wired up;
toggle with the INK/PAPER switch in the statusbar or `Ctrl+Shift+T`.

## Files
- `index.html` — mount point, loads React + Babel + stylesheet.
- `editor.css` — all component styles. Depends on `../../colors_and_type.css`.
- `components.jsx` — `Titlebar`, `FileMenu`, `Tabs`, `Sidebar`, `EditorPane`
  (with per-file content components `QuietThings` / `FieldNotes` / …),
  `Statusbar`, `CommandPalette`, `Findbar`, icon set `I`.
- `app.jsx` — the top-level `App`, keyboard shortcuts, tab state.

## Interactions
- Click a tab to switch; click × to close; click + to open a new file.
- Click files in the left sidebar to open them in a tab.
- Click **File** in the menubar to open the File menu (checkmarks + Alt-accels).
- `Ctrl+K` / `Ctrl+P` — command palette.
- `Ctrl+F` — find bar.
- `Ctrl+Shift+T` — toggle theme.
- Hold `Alt` to reveal menu-bar accelerators (underlined).

## Intentionally stubbed
- No real filesystem, no real ProseMirror. Content is static React components.
- Export targets in the palette are decorative — clicking them just closes.
- Window chrome buttons (— ▢ ✕) are non-functional.
