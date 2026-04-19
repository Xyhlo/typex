const { useState, useEffect } = React;

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("typex-theme") || "dark");
  const [tabs, setTabs] = useState([
    { id: "quiet-things", name: "quiet-things.md", dirty: true },
    { id: "field-notes", name: "field-notes.md", dirty: false },
    { id: "roadmap", name: "roadmap.md", dirty: false },
  ]);
  const [activeTab, setActiveTab] = useState("quiet-things");
  const [menuOpen, setMenuOpen] = useState(null);
  const [altHeld, setAltHeld] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("typex-theme", theme);
  }, [theme]);

  useEffect(() => {
    const kd = e => {
      if (e.key === "Alt") setAltHeld(true);
      if (e.ctrlKey && (e.key === "k" || e.key === "K" || e.key === "p" || e.key === "P")) { e.preventDefault(); setPaletteOpen(true); }
      if (e.ctrlKey && (e.key === "f" || e.key === "F")) { e.preventDefault(); setFindOpen(true); }
      if (e.ctrlKey && e.shiftKey && (e.key === "T" || e.key === "t")) { e.preventDefault(); setTheme(t => t === "dark" ? "light" : "dark"); }
      if (e.key === "Escape") { setPaletteOpen(false); setFindOpen(false); setMenuOpen(null); }
    };
    const ku = e => { if (e.key === "Alt") setAltHeld(false); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  const activeTabObj = tabs.find(t => t.id === activeTab);
  const wordCounts = { "quiet-things": 342, "field-notes": 86, "roadmap": 54, "readme": 128, "changelog": 44 };
  const w = wordCounts[activeTab] || 342;

  const closeTab = (id) => {
    setTabs(ts => ts.filter(t => t.id !== id));
    if (activeTab === id) {
      const rest = tabs.filter(t => t.id !== id);
      if (rest.length) setActiveTab(rest[0].id);
    }
  };
  const openFile = (id) => {
    if (!tabs.find(t => t.id === id)) {
      const names = { "quiet-things": "quiet-things.md", "field-notes": "field-notes.md", "roadmap": "roadmap.md", "readme": "README.md", "changelog": "changelog.md" };
      setTabs(ts => [...ts, { id, name: names[id] || `${id}.md`, dirty: false }]);
    }
    setActiveTab(id);
  };

  return (
    <div className="app">
      <Titlebar menuOpen={menuOpen} setMenuOpen={setMenuOpen} altHeld={altHeld} docName={activeTabObj?.name || "Untitled"}/>
      {menuOpen === "File" && <FileMenu onClose={() => setMenuOpen(null)} onCommand={(c) => { if (c === "Save") setTabs(ts => ts.map(t => t.id === activeTab ? {...t, dirty: false} : t)); }}/>}
      <Tabs tabs={tabs} active={activeTab} onActivate={setActiveTab}
            onClose={closeTab}
            onNew={() => { const id = "untitled-"+Date.now(); setTabs(ts => [...ts, { id, name: "untitled.md", dirty: true }]); setActiveTab(id); }}/>
      <div className="main">
        <Sidebar activeFile={activeTab} onSelect={openFile}/>
        <div style={{ position: "relative", minHeight: 0 }}>
          <EditorPane file={activeTab}/>
          <Findbar open={findOpen} onClose={() => setFindOpen(false)}/>
        </div>
      </div>
      <Statusbar docName={activeTabObj?.name || "Untitled"} words={w} chars={w*6} dirty={activeTabObj?.dirty}
                 theme={theme} onToggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")}/>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onRun={(c) => {
        if (c === "Toggle theme") setTheme(t => t === "dark" ? "light" : "dark");
        if (c === "Find in document") setFindOpen(true);
        if (c === "Save file") setTabs(ts => ts.map(t => t.id === activeTab ? {...t, dirty: false} : t));
      }}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
