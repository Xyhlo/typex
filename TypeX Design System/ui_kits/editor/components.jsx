// Shared editor UI kit components. Exports to window.
const { useState, useEffect, useRef } = React;

// -- ICONS --
const I = {
  Caret: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>),
  Folder: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>),
  File: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>),
  Search: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>),
  Settings: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>),
  Save: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>),
  Plus: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>),
  X: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>),
  Moon: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>),
  Sun: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>),
  ArrowUp: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 15 7-7 7 7"/></svg>),
  ArrowDown: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 9 7 7 7-7"/></svg>),
  Replace: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v4a2 2 0 0 0 2 2h11"/><path d="m12 9 4-4-4-4"/></svg>),
  Check: () => (<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3 3 7-7"/></svg>),
};

// -- TITLEBAR --
function Titlebar({ menuOpen, setMenuOpen, altHeld, docName }) {
  const items = [
    { label: "File", acc: "F" }, { label: "Edit", acc: "E" }, { label: "View", acc: "V" },
    { label: "Insert", acc: "I" }, { label: "Format", acc: "O" }, { label: "Tools", acc: "T" }, { label: "Help", acc: "H" },
  ];
  return (
    <div className={`titlebar ${altHeld ? "alt" : ""}`}>
      <div className="titlebar__brand">
        <div className="titlebar__mark"/><span>TypeX</span>
      </div>
      <div className="titlebar__menu">
        {items.map(it => (
          <div key={it.label}
               className={`titlebar__menu-item ${menuOpen === it.label ? "open" : ""}`}
               onClick={() => setMenuOpen(menuOpen === it.label ? null : it.label)}>
            {it.label.split("").map((c, i) => i === 0 ? <span key={i} className="acc">{c}</span> : c)}
          </div>
        ))}
      </div>
      <div className="titlebar__title">{docName} — TypeX</div>
      <div className="titlebar__win">
        <button>—</button><button>▢</button><button className="close">✕</button>
      </div>
    </div>
  );
}

// -- FILE MENU POPOVER --
function FileMenu({ onClose, onCommand }) {
  const items = [
    { label: "New document", sc: "Ctrl+N" },
    { label: "Open file…", sc: "Ctrl+O" },
    { label: "Open recent", sub: true },
    { sep: true },
    { label: "Save", sc: "Ctrl+S" },
    { label: "Save as…", sc: "Ctrl+Shift+S" },
    { label: "Export", sub: true },
    { sep: true },
    { label: "Close tab", sc: "Ctrl+W" },
    { label: "Exit", sc: "Alt+F4" },
  ];
  return (
    <div className="menu-pop" style={{ left: 84 }}>
      {items.map((it, i) => it.sep
        ? <div key={i} className="menu-pop__sep"/>
        : <div key={i} className="menu-pop__item" onClick={() => { onCommand?.(it.label); onClose(); }}>
            <span className="check"><I.Check/></span>
            <span>{it.label}</span>
            {it.sc && <span className="sc">{it.sc}</span>}
            {it.sub && <span className="sc">▸</span>}
          </div>
      )}
    </div>
  );
}

// -- TABS --
function Tabs({ tabs, active, onActivate, onClose, onNew }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <div key={t.id}
             className={`tab ${active === t.id ? "active" : ""}`}
             onClick={() => onActivate(t.id)}>
          {t.dirty && <div className="dot"/>}
          <span className="name">{t.name}</span>
          <span className="close" onClick={(e) => { e.stopPropagation(); onClose(t.id); }}>×</span>
        </div>
      ))}
      <div className="tabs__plus" onClick={onNew}><I.Plus/></div>
    </div>
  );
}

// -- SIDEBAR --
function Sidebar({ activeFile, onSelect }) {
  const [expanded, setExpanded] = useState({ drafts: true, notes: false });
  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const Row = ({ icon, name, id, indent = 0, caret = false, expanded: ex, onToggle, active }) => (
    <div className={`tree__row ${active ? "active" : ""} ${ex ? "expanded" : ""} ${indent ? (indent === 2 ? "tree__indent l2" : "tree__indent") : ""}`}
         onClick={() => { onToggle?.(); if (id) onSelect(id); }}>
      {caret ? <span className="tree__caret"><I.Caret/></span> : <span className="tree__caret"/>}
      <span className="tree__icon">{icon}</span>
      <span className="tree__name">{name}</span>
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar__section">Files <span className="plus"><I.Plus/></span></div>
      <div className="sidebar__tree">
        <Row icon={<I.Folder/>} name="notes" caret expanded={expanded.notes} onToggle={() => toggle("notes")}/>
        <Row icon={<I.Folder/>} name="drafts" caret expanded={expanded.drafts} onToggle={() => toggle("drafts")}/>
        {expanded.drafts && <>
          <Row icon={<I.File/>} name="field-notes.md" id="field-notes" indent={1}/>
          <Row icon={<I.File/>} name="quiet-things.md" id="quiet-things" indent={1} active={activeFile === "quiet-things"}/>
          <Row icon={<I.File/>} name="roadmap.md" id="roadmap" indent={1}/>
        </>}
        <Row icon={<I.Folder/>} name="sources" caret/>
        <Row icon={<I.File/>} name="README.md" id="readme"/>
        <Row icon={<I.File/>} name="changelog.md" id="changelog"/>
      </div>
      <div className="sidebar__footer">
        <div className="icon-btn" title="Search files (Ctrl+P)"><I.Search/></div>
        <div className="icon-btn" title="Settings"><I.Settings/></div>
        <div className="icon-btn" style={{ marginLeft: "auto" }} title="New file"><I.Plus/></div>
      </div>
    </aside>
  );
}

// -- EDITOR --
function EditorPane({ file }) {
  const content = {
    "quiet-things": <QuietThings/>,
    "field-notes": <FieldNotes/>,
    "roadmap": <Roadmap/>,
    "readme": <Readme/>,
    "changelog": <Changelog/>,
  }[file] || <QuietThings/>;
  return (
    <main className="editor">
      <div className="editor__page">{content}</div>
    </main>
  );
}

function QuietThings() {
  return <>
    <h1>Field Notes on Quiet Things</h1>
    <p>A short reader to stress-test the typographic system — headings, inline marks, code, quotes, and the spaces between.</p>
    <p>Good tools recede; they make the page feel like paper and the keyboard feel like ink. <em>Inline italics lean the right amount.</em> <mark>A mark highlights the point.</mark> A link to the <a href="#">home folder</a> stays underlined but quiet. Inline <code>code</code> keeps its width.</p>
    <blockquote>"The best words in the best order." — Coleridge</blockquote>
    <h2>Code, with taste</h2>
    <pre><code>
<span className="hl-c">{`// Painted via ProseMirror decorations, never DOM mutation.`}</span>{"\n"}
<span className="hl-k">type</span> <span className="hl-t">Mood</span> = <span className="hl-s">"blank"</span> | <span className="hl-s">"flowing"</span> | <span className="hl-s">"done"</span>;{"\n\n"}
<span className="hl-k">const</span> <span className="hl-f">advance</span> = (m: <span className="hl-t">Mood</span>): <span className="hl-t">Mood</span> =&gt; {`{`}{"\n"}
{"  "}<span className="hl-k">return</span> <span className="hl-s">"flowing"</span>;{"\n"}
{`};`}
    </code></pre>
    <h2>Lists keep their rhythm</h2>
    <ul>
      <li>Headings are em-based, so zoom scales every level proportionally.</li>
      <li>Body copy is 16.5&nbsp;px at 1.75 line-height, capped at 72 characters.</li>
      <li>Code blocks carry an 8&nbsp;px radius and a 1&nbsp;px warm border.</li>
    </ul>
    <h3>Subheads for paragraphs</h3>
    <p>Smaller moments deserve quieter type. Subheads use the same scale, one step down, with the same tracking.</p>
  </>;
}

function FieldNotes() {
  return <>
    <h1>Field Notes</h1>
    <p>Loose observations from the week. Keep them short — long-form lives in <a href="#">drafts</a>.</p>
    <h2>Monday</h2>
    <p>Woke to a soft, cold rain. The kind that makes paper feel warmer than usual.</p>
    <h2>Tuesday</h2>
    <p>Read Coleridge on the train. <em>The best words in the best order.</em> Marked the margin.</p>
  </>;
}
function Roadmap() {
  return <>
    <h1>Roadmap</h1>
    <h2>v0.2 — Typography II</h2>
    <ul><li>Serif editor mode</li><li>Custom line-height per document</li><li>Outline pane</li></ul>
    <h2>v0.3 — Export</h2>
    <ul><li>Pandoc template picker</li><li>Bulk export folder</li><li>PDF with Iowan</li></ul>
  </>;
}
function Readme() {
  return <>
    <h1>TypeX</h1>
    <p>A Markdown editor that puts typography first. Built on Tauri + Milkdown.</p>
    <h2>Install</h2>
    <pre><code><span className="hl-c">{`# Windows`}</span>{"\n"}winget install Amptis.TypeX</code></pre>
  </>;
}
function Changelog() {
  return <>
    <h1>Changelog</h1>
    <h2>0.1.0 — April 2026</h2>
    <ul><li>Initial beta. Windows only.</li><li>Obsidian Ink + Ivory Paper themes.</li><li>Pandoc export for 40+ formats.</li></ul>
  </>;
}

// -- STATUSBAR --
function Statusbar({ docName, words, chars, dirty, theme, onToggleTheme }) {
  return (
    <div className="statusbar">
      <span>{docName}</span>
      {dirty && <span className="dirty">●</span>}
      <span className="sep">·</span>
      <span>Markdown</span>
      <div className="right">
        <span>{words} WORDS</span><span className="sep">·</span>
        <span>{chars} CHARS</span><span className="sep">·</span>
        <span>{Math.max(1, Math.round(words / 200))} MIN</span>
        <span className="sep">·</span>
        <span>UTF-8</span><span className="sep">·</span>
        <span>LF</span>
        <span className="theme-switch" onClick={onToggleTheme}>
          {theme === "dark" ? "◐ INK" : "◑ PAPER"}
        </span>
      </div>
    </div>
  );
}

// -- COMMAND PALETTE --
function CommandPalette({ open, onClose, onRun }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  const all = [
    { cmd: "Save file", sc: ["Ctrl","S"] },
    { cmd: "Save as…", sc: ["Ctrl","Shift","S"] },
    { cmd: "Save all", sc: ["Ctrl","Alt","S"] },
    { cmd: "Open file…", sc: ["Ctrl","O"] },
    { cmd: "Toggle theme", sc: ["Ctrl","Shift","T"] },
    { cmd: "Toggle focus mode", sc: ["Ctrl","."] },
    { cmd: "Find in document", sc: ["Ctrl","F"] },
    { cmd: "Export as .docx" },
    { cmd: "Export as .epub" },
    { cmd: "Export as .tex" },
    { cmd: "Export as .pdf" },
  ];
  const filtered = all.filter(x => x.cmd.toLowerCase().includes(q.toLowerCase()));
  if (!open) return null;
  const run = (x) => { onRun?.(x.cmd); onClose(); };
  return (
    <div className="palette-backdrop open" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} placeholder="Run command, search files…" value={q}
               onChange={e => { setQ(e.target.value); setSel(0); }}
               onKeyDown={e => {
                 if (e.key === "ArrowDown") { setSel(s => Math.min(filtered.length-1, s+1)); e.preventDefault(); }
                 if (e.key === "ArrowUp") { setSel(s => Math.max(0, s-1)); e.preventDefault(); }
                 if (e.key === "Enter" && filtered[sel]) run(filtered[sel]);
                 if (e.key === "Escape") onClose();
               }}/>
        <ul>
          {filtered.map((x, i) => (
            <li key={x.cmd} className={i === sel ? "sel" : ""} onMouseEnter={() => setSel(i)} onClick={() => run(x)}>
              <I.Save/><span className="label">{x.cmd}</span>
              {x.sc && <span className="sc">{x.sc.map(k => <kbd key={k}>{k}</kbd>)}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// -- FINDBAR --
function Findbar({ open, onClose }) {
  const [q, setQ] = useState("quiet");
  if (!open) return null;
  return (
    <div className="findbar open">
      <I.Search/>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find in document…"/>
      <span className="count">{q ? "1 / 3" : "0 / 0"}</span>
      <div className="icon-btn" title="Previous"><I.ArrowUp/></div>
      <div className="icon-btn" title="Next"><I.ArrowDown/></div>
      <div className="icon-btn" title="Replace"><I.Replace/></div>
      <div className="icon-btn" title="Close" onClick={onClose}><I.X/></div>
    </div>
  );
}

Object.assign(window, { I, Titlebar, FileMenu, Tabs, Sidebar, EditorPane, Statusbar, CommandPalette, Findbar });
