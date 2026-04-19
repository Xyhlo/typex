const { useState, useEffect } = React;

function Icon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    type: <><path d="M4 6V4h16v2M9 20h6M12 4v16"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>,
    zap: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>,
    command: <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3z"/>,
    code: <><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></>,
    export: <><path d="M12 15V3M7 8l5-5 5 5M20 21H4"/></>,
    keyboard: <><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M20 21H4"/></>,
    arrowR: <path d="m9 6 6 6-6 6"/>,
    github: <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-2c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.2-4.5-1.1-4.5-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.5 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Nav({ theme, setTheme }) {
  return (
    <nav className="nav">
      <div className="page" style={{ display: "flex", alignItems: "center", gap: 32, width: "100%" }}>
        <a href="#" className="nav__brand">
          <div className="nav__mark"/> TypeX
        </a>
        <div className="nav__links">
          <a href="#features">Features</a>
          <a href="#themes">Themes</a>
          <a href="#formats">Export</a>
          <a href="https://github.com/Xyhlo/typex">GitHub</a>
          <a href="https://amptis.com">Amptis</a>
        </div>
        <button className="theme-toggle" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
          <Icon name={theme === "dark" ? "sun" : "moon"}/>
        </button>
        <a href="#download" className="nav__cta">
          <Icon name="download"/> Download
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="page hero">
      <div>
        <div className="hero__eyebrow">
          <span>v0.1.0 beta</span>
          <span className="ver">· Windows · MIT</span>
        </div>
        <h1>A Markdown editor that puts <em>typography</em> first.</h1>
        <p className="lede">A quiet WYSIWYG editor with two hand-tuned themes, a real menu bar, bundled Pandoc for 40+ formats, and a 44&nbsp;MB installer that launches in 200&nbsp;ms.</p>
        <div className="hero__ctas">
          <a href="#download" className="btn btn--primary"><Icon name="download"/> Download for Windows</a>
          <a href="https://github.com/Xyhlo/typex" className="btn btn--secondary"><Icon name="github"/> View on GitHub</a>
        </div>
        <div className="hero__meta">
          <span>44 MB installer</span><span className="sep">·</span>
          <span>~200 ms launch</span><span className="sep">·</span>
          <span>Tauri + Milkdown</span>
        </div>
      </div>
      <HeroWindow/>
    </section>
  );
}

function HeroWindow() {
  return (
    <div className="window">
      <div className="window__bar">
        <div className="window__mark"/>
        <span style={{ fontWeight: 600, color: "var(--fg)" }}>TypeX</span>
        <span className="window__title" style={{ marginLeft: 14 }}>File  Edit  View  Insert  Format  Tools  Help</span>
        <span className="window__spacer"><span>—</span><span>▢</span><span>✕</span></span>
      </div>
      <div className="window__body">
        <div className="window__sidebar">
          <div className="h">Files</div>
          <div className="f">▸ notes</div>
          <div className="f">▾ drafts</div>
          <div className="f" style={{ paddingLeft: 20 }}>field-notes.md</div>
          <div className="f active" style={{ paddingLeft: 20 }}>quiet-things.md</div>
          <div className="f" style={{ paddingLeft: 20 }}>roadmap.md</div>
          <div className="f">README.md</div>
        </div>
        <div className="window__doc">
          <h2>Field Notes on Quiet Things</h2>
          <p>A short reader to stress-test the typographic system — headings, inline marks, code, quotes, and the spaces between.</p>
          <blockquote>"The best words in the best order." — Coleridge</blockquote>
          <pre>
<span className="hl-c">{`// Painted via ProseMirror decorations.`}</span>{"\n"}
<span className="hl-k">type</span> <span className="hl-t">Mood</span> = <span className="hl-s">"blank"</span> | <span className="hl-s">"flowing"</span> | <span className="hl-s">"done"</span>;
          </pre>
        </div>
      </div>
    </div>
  );
}

function Features() {
  const items = [
    { icon: "type", title: "Typography, not chrome", body: "Inter for UI. JetBrains Mono for code. An em-based heading scale so zoom rescales every level proportionally. Heading tracking tuned by hand." },
    { icon: "zap", title: "Fast, not abstract", body: "~200 ms launch on Windows. 44 MB installer. Built on Tauri — native WebView, Rust backend, no Electron runtime tax." },
    { icon: "code", title: "Syntax highlighting in place", body: "Code blocks painted via ProseMirror decorations, not DOM mutation. Colors are themed tokens, not baked CSS — the same --hl-* in both themes." },
    { icon: "export", title: "40+ formats via Pandoc", body: ".docx, .odt, .epub, .rtf, .tex, .rst, .adoc — Pandoc is bundled as a sidecar. Round-trip what you can; render what you can't." },
    { icon: "keyboard", title: "Keyboard-first", body: "A real menu bar with Alt-accelerators, a Ctrl+K command palette, shortcut hints next to every row. Designed for people who type." },
    { icon: "command", title: "Two themes, one system", body: "Obsidian Ink (dark) and Ivory Paper (light) share identical semantic tokens — never the same literals. Switch instantly without reflow." },
  ];
  return (
    <section id="features" className="section">
      <div className="page">
        <div className="section__eyebrow">Features</div>
        <h2 className="section__title">What a markdown editor should do — and nothing it shouldn't.</h2>
        <p className="section__lede">TypeX does a short list of things well. Write markdown, render it live, save it where you want, export it to whatever your collaborators need.</p>
        <div className="features">
          {items.map(f => (
            <div className="feature" key={f.title}>
              <div className="feature__icon"><Icon name={f.icon}/></div>
              <div className="feature__title">{f.title}</div>
              <div className="feature__body">{f.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Themes() {
  return (
    <section id="themes" className="section">
      <div className="page">
        <div className="section__eyebrow">Themes</div>
        <h2 className="section__title">Two hand-tuned themes, one semantic system.</h2>
        <p className="section__lede">The same indigo hue, retuned for each background. Warm charcoal for night. Cream for day. Nothing hardcoded — every surface, border, and text color is a token.</p>
        <div className="themes-row">
          <div className="theme-card theme-card--dark">
            <div className="theme-card__preview">
              <div className="theme-card__h">The headline reads fast.</div>
              <div className="theme-card__rule"/>
              <div className="theme-card__p">Warm charcoal surfaces with a slight purple cast. Parchment text — not paper — for long-form writing at night.</div>
            </div>
            <div className="theme-card__meta">
              <span className="name">Obsidian Ink</span>
              <span className="hint">#0f0e12 · #8b7cff · #ebe7dd</span>
            </div>
          </div>
          <div className="theme-card theme-card--light">
            <div className="theme-card__preview">
              <div className="theme-card__h">The headline reads fast.</div>
              <div className="theme-card__rule"/>
              <div className="theme-card__p">Cream, not white. A deeper indigo for legibility on warm neutrals. Warm near-black — #1c1b22 — never pure black.</div>
            </div>
            <div className="theme-card__meta">
              <span className="name">Ivory Paper</span>
              <span className="hint">#fbfaf6 · #5b4de0 · #1c1b22</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Formats() {
  const fmts = [".md", ".docx", ".odt", ".epub", ".rtf", ".tex", ".rst", ".adoc", ".org", ".html", ".pdf", ".fb2", ".json", ".opml", ".man"];
  return (
    <section id="formats" className="section">
      <div className="page">
        <div className="section__eyebrow">Export</div>
        <h2 className="section__title">40+ formats, bundled.</h2>
        <p className="section__lede">Pandoc ships inside the installer. Every format Pandoc knows, TypeX can write. Menu → Export, or Ctrl+Shift+E.</p>
        <div className="formats">
          {fmts.map(f => <div className="format-chip" key={f}>{f}</div>)}
          <div className="format-chip" style={{ color: "var(--fg-subtle)" }}>+ 25 more</div>
        </div>
      </div>
    </section>
  );
}

function Download() {
  return (
    <section id="download" className="section">
      <div className="page download">
        <div>
          <div className="section__eyebrow">Install</div>
          <h2 className="section__title">Download TypeX for Windows.</h2>
          <p className="section__lede">Tauri-native. 44&nbsp;MB installer. MIT licensed — Pandoc is GPL and invoked as a sidecar. v0.1.0 is beta — expect sharp edges.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="#" className="btn btn--primary"><Icon name="download"/> Download TypeX-0.1.0.msi</a>
            <a href="https://github.com/Xyhlo/typex/releases" className="btn btn--secondary">All releases</a>
          </div>
          <div className="download__details">SHA-256 verified · Windows 10 / 11 · x64 · MIT</div>
        </div>
        <div className="download__terminal">
          <div className="comment"># or, via winget</div>
          <div><span className="prompt">&gt;</span> winget install Amptis.TypeX</div>
          <div style={{ marginTop: 10 }} className="comment"># build from source</div>
          <div><span className="prompt">&gt;</span> git clone https://github.com/Xyhlo/typex</div>
          <div><span className="prompt">&gt;</span> cd typex && pnpm tauri dev</div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="page footer__row">
        <div className="footer__brand"><div className="m"/> TypeX</div>
        <div className="footer__links">
          <a href="#features">Features</a>
          <a href="#themes">Themes</a>
          <a href="https://github.com/Xyhlo/typex">GitHub</a>
          <a href="https://amptis.com">Amptis</a>
        </div>
        <div className="footer__meta">© 2026 Amptis · MIT · Made in Austin</div>
      </div>
    </footer>
  );
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("typex-site-theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("typex-site-theme", theme);
  }, [theme]);
  return (
    <>
      <Nav theme={theme} setTheme={setTheme}/>
      <Hero/>
      <Features/>
      <Themes/>
      <Formats/>
      <Download/>
      <Footer/>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
