import { createEditor, type EditorController } from "./editor/editor";
import {
  openAnyDocumentFile,
  saveFile,
  saveAsDialog,
  isTauri,
  pathTitle,
  openFolderDialog,
  readWorkspace,
  readFile,
  pathExists,
  basename,
  dialogConfirm,
} from "./fs/files";
import {
  pandocVersion,
  pandocImport,
  pandocExport,
  EXPORT_FORMATS,
  getImportFormat,
  getExportFormatByExt,
  isMarkdownExt,
  extOf,
  type PandocFormat,
} from "./fs/pandoc";
import { launchPaths, onLaunchPaths } from "./fs/launch-paths";
import { openDefaultAppsSettings } from "./fs/default-apps";
import { maybeShowDefaultPrompt } from "./ui/default-prompt";
import { registerCommands, runCommand } from "./commands";
import { createPalette } from "./ui/palette";
import { initSidebar, toggleSidebar } from "./ui/sidebar";
import { initStatusbar } from "./ui/statusbar";
import { initOutline } from "./ui/outline";
import { initWindowControls } from "./ui/window-controls";
import { createTabsController } from "./ui/tabs";
import { toast, progressToast } from "./ui/toast";
import { initTheme, toggleTheme, applyTheme } from "./theme";
import { createFileTree } from "./ui/file-tree";
import { createMenubar, type MenuEntry } from "./ui/menubar";
import { createFindbar } from "./ui/findbar";
import { showModal, prompt } from "./ui/modal";
import { exportAsHtml } from "./export";
import {
  recentFiles,
  recentFolders,
  pushRecentFile,
  pushRecentFolder,
  clearRecentFiles,
  clearRecentFolders,
  removeRecentFile,
} from "./recent";
import { loadSession, saveSession, loadPrefs, savePrefs } from "./session";
import {
  getActiveTab,
  getState,
  setState,
  updateTab,
  subscribe,
  type DocTab,
} from "./state";
import { WELCOME_CONTENT } from "./welcome";
import { getCurrentWindow } from "@tauri-apps/api/window";

const bootstrap = async (): Promise<void> => {
  initTheme();
  initSidebar();
  initStatusbar();
  initOutline();
  void initWindowControls();

  const host = document.getElementById("editor")!;
  const stripEl = document.getElementById("tab-strip")!;
  const fileTreeEl = document.getElementById("file-tree")!;
  const menubarEl = document.getElementById("menubar")!;
  const appEl = document.getElementById("app")!;

  let currentTabId: string | null = null;
  let applyingExternalContent = false;
  let workspaceRoot: string | null = null;
  let autosaveTimer: number | null = null;
  let pandocReady = false;
  let pandocVer: string | null = null;
  const prefs = loadPrefs();

  // Apply persisted view prefs before first paint.
  appEl.dataset.readingMode = prefs.readingMode;
  appEl.dataset.editorFont = prefs.editorFont;
  appEl.dataset.typewriter = String(prefs.typewriter);
  setState({ readingMode: prefs.readingMode, editorFont: prefs.editorFont });

  const editorHost = document.getElementById("editor-host")!;

  const tabs = createTabsController(stripEl, async (tab) => {
    if (!editor || !tab) {
      if (!tab) currentTabId = null;
      return;
    }
    if (tab.id === currentTabId) return;
    // Micro-fade while content is swapped so the switch doesn't pop.
    editorHost.dataset.swapping = "true";
    applyingExternalContent = true;
    await editor.setContent(tab.content);
    applyingExternalContent = false;
    currentTabId = tab.id;
    requestAnimationFrame(() => {
      editorHost.dataset.swapping = "false";
    });
    editor.focus();
  });

  // Seed with one Untitled tab containing the welcome doc
  const initialTab = tabs.openNew();
  updateTab(initialTab.id, {
    content: WELCOME_CONTENT,
    savedContent: WELCOME_CONTENT,
  });
  currentTabId = initialTab.id;

  const editor: EditorController = await createEditor({
    host,
    initialContent: WELCOME_CONTENT,
    onChange: (md) => {
      if (applyingExternalContent) return;
      const active = getActiveTab();
      if (!active) return;
      updateTab(active.id, { content: md });
    },
  });
  editor.focus();

  const fileTree = createFileTree(fileTreeEl, {
    onOpenFile: (path) => void openPath(path),
  });

  // ---------- File operations ----------
  const createNew = async (): Promise<void> => {
    const tab = tabs.openNew();
    applyingExternalContent = true;
    await editor.setContent("");
    applyingExternalContent = false;
    currentTabId = tab.id;
    editor.focus();
  };

  const openPath = async (path: string): Promise<void> => {
    if (!isTauri()) return;
    try {
      if (!(await pathExists(path))) {
        toast(`File not found: ${basename(path)}`);
        removeRecentFile(path);
        return;
      }

      const ext = extOf(path);
      let content: string;
      let sourceFormat: string | null = null;
      let sourceExt: string | null = null;

      if (isMarkdownExt(ext) || !ext) {
        content = await readFile(path);
        sourceExt = ext || "md";
      } else {
        const fmt = getImportFormat(ext);
        if (!fmt) {
          toast(`Unsupported format: .${ext}`);
          return;
        }
        if (!pandocReady) {
          showPandocMissingModal();
          return;
        }
        const progress = progressToast(`Converting from ${fmt.label}…`);
        try {
          content = await pandocImport(path, fmt.pandocName);
          sourceFormat = fmt.pandocName;
          sourceExt = ext;
          progress.success(`Imported ${basename(path)}`);
        } catch (err) {
          console.error("[typex] pandoc import failed:", err);
          progress.error(`Import failed: ${String(err).slice(0, 140)}`);
          return;
        }
      }

      const tab = tabs.openFromFile({
        path,
        content,
        title: basename(path),
        sourceFormat,
        sourceExt,
      });
      applyingExternalContent = true;
      await editor.setContent(content);
      applyingExternalContent = false;
      currentTabId = tab.id;
      editor.focus();
      pushRecentFile(path);
      fileTree.setActive(path);
    } catch (err) {
      console.error(err);
      toast("Couldn't open file");
    }
  };

  const openFile = async (): Promise<void> => {
    if (!isTauri()) {
      toast("File open is only available in the desktop app");
      return;
    }
    const path = await openAnyDocumentFile({ allFormats: prefs.openAllFormats });
    if (!path) return;
    await openPath(path);
  };

  const openFolder = async (): Promise<void> => {
    if (!isTauri()) {
      toast("Open folder is only available in the desktop app");
      return;
    }
    const folder = await openFolderDialog();
    if (!folder) return;
    await loadWorkspace(folder);
  };

  const loadWorkspace = async (folder: string): Promise<void> => {
    try {
      const tree = await readWorkspace(folder);
      workspaceRoot = folder;
      fileTree.mount(tree);
      pushRecentFolder(folder);
      const titleEl = document.getElementById("files-title");
      if (titleEl) titleEl.textContent = basename(folder);
      toast(`Opened ${basename(folder)}`);
    } catch (err) {
      console.error(err);
      toast("Couldn't open folder");
    }
  };

  /**
   * Write a tab's content to its recorded path, picking the right serializer
   * based on the path extension and tab's source format. Pure function of
   * tab state — no UI side effects other than propagating errors.
   */
  const writeTabToDisk = async (tab: DocTab): Promise<void> => {
    if (!tab.path) throw new Error("Tab has no path");
    const ext = extOf(tab.path);
    if (isMarkdownExt(ext) || !ext) {
      await saveFile(tab.path, tab.content);
      return;
    }
    const targetFmt =
      tab.sourceFormat ?? getExportFormatByExt(ext)?.pandocName ?? null;
    if (!targetFmt) {
      throw new Error(`No converter for .${ext}`);
    }
    if (!pandocReady) {
      throw new Error("Pandoc is required for this format");
    }
    await pandocExport(tab.content, targetFmt, tab.path);
  };

  const save = async (): Promise<void> => {
    const active = getActiveTab();
    if (!active) return;
    if (!active.path) {
      await saveAs();
      return;
    }
    if (!isTauri()) {
      toast("Saving is only available in the desktop app");
      return;
    }
    const ext = extOf(active.path);
    const isFormatConverted = !isMarkdownExt(ext) && !!ext;
    if (isFormatConverted && !pandocReady) {
      showPandocMissingModal();
      return;
    }
    if (isFormatConverted) {
      const progress = progressToast(`Saving as ${ext.toUpperCase()}…`);
      try {
        await writeTabToDisk(active);
        updateTab(active.id, { savedContent: active.content });
        pushRecentFile(active.path);
        progress.success(`Saved ${active.title}`);
      } catch (err) {
        console.error(err);
        progress.error(`Couldn't save: ${String(err).slice(0, 120)}`);
      }
      return;
    }
    try {
      await writeTabToDisk(active);
      updateTab(active.id, { savedContent: active.content });
      pushRecentFile(active.path);
      toast(`Saved ${active.title}`);
    } catch (err) {
      console.error(err);
      toast(`Couldn't save: ${String(err).slice(0, 120)}`);
    }
  };

  const saveAs = async (): Promise<void> => {
    const active = getActiveTab();
    if (!active) return;
    if (!isTauri()) {
      toast("Saving is only available in the desktop app");
      return;
    }
    const defaultExt = active.sourceExt ?? "md";
    const base = active.title.replace(/\.[^.]+$/, "") || "Untitled";
    const defaultPath =
      active.path ??
      (workspaceRoot
        ? `${workspaceRoot}/${base}.${defaultExt}`
        : `${base}.${defaultExt}`);

    const chosen = await saveAsDialog(defaultPath);
    if (!chosen) return;

    const chosenExt = extOf(chosen);
    const finalPath = chosenExt ? chosen : `${chosen}.${defaultExt}`;
    const finalExt = extOf(finalPath);

    try {
      if (isMarkdownExt(finalExt) || !finalExt) {
        await saveFile(finalPath, active.content);
      } else {
        const fmt = getExportFormatByExt(finalExt);
        if (!fmt) {
          toast(`Unsupported format: .${finalExt}`);
          return;
        }
        if (!pandocReady) {
          showPandocMissingModal();
          return;
        }
        toast(`Saving as ${fmt.label}…`);
        await pandocExport(active.content, fmt.pandocName, finalPath);
      }

      updateTab(active.id, {
        path: finalPath,
        title: pathTitle(finalPath, active.title),
        savedContent: active.content,
        sourceExt: finalExt || defaultExt,
        sourceFormat: isMarkdownExt(finalExt)
          ? null
          : getExportFormatByExt(finalExt)?.pandocName ?? null,
      });
      pushRecentFile(finalPath);
      if (workspaceRoot && finalPath.startsWith(workspaceRoot)) {
        void refreshWorkspace();
      }
      toast(`Saved as ${basename(finalPath)}`);
    } catch (err) {
      console.error(err);
      toast(`Couldn't save: ${String(err).slice(0, 120)}`);
    }
  };

  /** Export the active document to a specific Pandoc format via a save dialog. */
  const exportAs = async (format: PandocFormat): Promise<void> => {
    const active = getActiveTab();
    if (!active) return;
    if (!isTauri()) {
      toast("Export is only available in the desktop app");
      return;
    }
    const isNative = ["gfm", "commonmark_x", "markdown"].includes(format.pandocName);
    if (!isNative && !pandocReady) {
      showPandocMissingModal();
      return;
    }
    const base = (active.title.replace(/\.[^.]+$/, "") || "document");
    const defaultPath = workspaceRoot
      ? `${workspaceRoot}/${base}.${format.ext}`
      : `${base}.${format.ext}`;
    const chosen = await saveAsDialog(defaultPath);
    if (!chosen) return;
    const finalPath = chosen.toLowerCase().endsWith(`.${format.ext}`)
      ? chosen
      : `${chosen}.${format.ext}`;
    const progress = progressToast(`Exporting to ${format.label}…`);
    try {
      if (isNative) {
        await saveFile(finalPath, active.content);
      } else {
        await pandocExport(active.content, format.pandocName, finalPath);
      }
      progress.success(`Exported to ${basename(finalPath)}`);
    } catch (err) {
      console.error("[typex] export failed:", err);
      progress.error(`Export failed: ${String(err).slice(0, 140)}`);
    }
  };

  const showPandocMissingModal = (): void => {
    const body = document.createElement("div");
    body.innerHTML = `
      <p>This feature needs <strong>Pandoc</strong>, a universal document converter, on your system.</p>
      <p>Once installed, TypeX auto-detects Pandoc on PATH and unlocks <strong>40+ import and export formats</strong> — Microsoft Word, OpenDocument, RTF, EPUB, LaTeX, reStructuredText, AsciiDoc, MediaWiki, Org mode, and more.</p>
      <p>Download from <a href="https://pandoc.org/installing.html" target="_blank" rel="noopener">pandoc.org/installing</a>. After installing, restart TypeX.</p>
    `;
    showModal({
      title: "Pandoc not found",
      body,
      actions: [{ label: "Close", variant: "primary", run: () => {} }],
    });
  };

  const saveAll = async (): Promise<void> => {
    let count = 0;
    let errors = 0;
    for (const t of getState().tabs) {
      if (t.content === t.savedContent || !t.path) continue;
      try {
        await writeTabToDisk(t);
        updateTab(t.id, { savedContent: t.content });
        count += 1;
      } catch (err) {
        console.error("save failed for", t.path, err);
        errors += 1;
      }
    }
    if (count > 0 && errors === 0) {
      toast(`Saved ${count} file${count === 1 ? "" : "s"}`);
    } else if (count > 0 && errors > 0) {
      toast(`Saved ${count}, ${errors} failed`);
    } else if (errors > 0) {
      toast(`${errors} save${errors === 1 ? "" : "s"} failed`);
    } else {
      toast("Nothing to save");
    }
  };

  const confirmDirtyClose = async (tab: DocTab): Promise<boolean> => {
    if (tab.content === tab.savedContent) return true;
    return dialogConfirm(
      `"${tab.title}" has unsaved changes. Close anyway?`,
      "Unsaved changes",
    );
  };

  const closeTab = async (id: string): Promise<void> => {
    const tab = getState().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (!(await confirmDirtyClose(tab))) return;
    tabs.closeTab(id);
    if (!getActiveTab()) await createNew();
  };

  const closeActiveTab = async (): Promise<void> => {
    const active = getActiveTab();
    if (active) await closeTab(active.id);
  };

  const closeOthers = async (): Promise<void> => {
    const active = getActiveTab();
    if (!active) return;
    const others = getState().tabs.filter((t) => t.id !== active.id);
    for (const t of others) {
      if (await confirmDirtyClose(t)) tabs.closeTab(t.id);
    }
  };

  const closeAllTabs = async (): Promise<void> => {
    for (const t of [...getState().tabs]) {
      if (!(await confirmDirtyClose(t))) return;
      tabs.closeTab(t.id);
    }
    await createNew();
  };

  const revertFile = async (): Promise<void> => {
    const active = getActiveTab();
    if (!active?.path) {
      toast("Nothing to revert");
      return;
    }
    if (active.content === active.savedContent) {
      toast("Already matches disk");
      return;
    }
    const ok = await dialogConfirm(
      `Discard changes to "${active.title}" and reload from disk?`,
      "Revert",
    );
    if (!ok) return;
    const ext = extOf(active.path);
    const isFormatConverted = !isMarkdownExt(ext) && !!ext;
    if (isFormatConverted && !pandocReady) {
      showPandocMissingModal();
      return;
    }
    const progress = isFormatConverted
      ? progressToast(`Reverting from ${ext.toUpperCase()}…`)
      : null;
    try {
      let content: string;
      if (!isFormatConverted) {
        content = await readFile(active.path);
      } else {
        const fmt = getImportFormat(ext);
        if (!fmt) {
          progress?.error(`Cannot revert .${ext} — no converter`);
          return;
        }
        content = await pandocImport(active.path, fmt.pandocName);
      }
      updateTab(active.id, { content, savedContent: content });
      applyingExternalContent = true;
      await editor.setContent(content);
      applyingExternalContent = false;
      if (progress) progress.success(`Reverted ${active.title}`);
      else toast(`Reverted ${active.title}`);
    } catch (err) {
      console.error(err);
      const msg = `Couldn't revert: ${String(err).slice(0, 120)}`;
      if (progress) progress.error(msg);
      else toast(msg);
    }
  };

  const refreshWorkspace = async (): Promise<void> => {
    if (!workspaceRoot) {
      toast("No folder open");
      return;
    }
    try {
      const tree = await readWorkspace(workspaceRoot);
      fileTree.mount(tree);
      const active = getActiveTab();
      fileTree.setActive(active?.path ?? null);
      toast("Folder refreshed");
    } catch (err) {
      console.error(err);
      toast("Couldn't refresh folder");
    }
  };

  const exportHTMLAction = async (): Promise<void> => {
    const active = getActiveTab();
    if (!active) return;
    const baseName = active.title.replace(/\.(md|markdown|mdx|txt)$/i, "");
    try {
      const html = editor.getHTML();
      const ok = await exportAsHtml(
        baseName,
        html,
        `${baseName}.html`,
      );
      if (ok) toast("Exported HTML");
    } catch (err) {
      console.error(err);
      toast("Export failed");
    }
  };

  const printDoc = (): void => {
    window.print();
  };

  // ---------- View actions ----------
  const nudgeViewHooks = (): void => {
    document.dispatchEvent(new CustomEvent("typex:view-sync"));
  };

  const toggleFocusMode = (): void => {
    const next = !getState().focusMode;
    setState({ focusMode: next });
    appEl.dataset.focusMode = String(next);
    nudgeViewHooks();
    menubar.refresh();
  };

  const toggleTypewriter = (): void => {
    prefs.typewriter = !prefs.typewriter;
    savePrefs(prefs);
    appEl.dataset.typewriter = String(prefs.typewriter);
    nudgeViewHooks();
    menubar.refresh();
  };

  const setEditorFont = (mode: "sans" | "serif"): void => {
    document.getElementById("app")!.dataset.editorFont = mode;
    setState({ editorFont: mode });
    prefs.editorFont = mode;
    savePrefs(prefs);
    menubar.refresh();
  };

  const setReadingMode = (mode: "vertical" | "horizontal"): void => {
    document.getElementById("app")!.dataset.readingMode = mode;
    setState({ readingMode: mode });
    prefs.readingMode = mode;
    savePrefs(prefs);
    menubar.refresh();
  };

  const toggleReadingMode = (): void => {
    setReadingMode(getState().readingMode === "vertical" ? "horizontal" : "vertical");
  };

  let fontScale = 1;
  const applyFontScale = (): void => {
    document.documentElement.style.setProperty("--editor-scale", String(fontScale));
  };
  const zoomIn = (): void => { fontScale = Math.min(2, +(fontScale + 0.1).toFixed(2)); applyFontScale(); };
  const zoomOut = (): void => { fontScale = Math.max(0.7, +(fontScale - 0.1).toFixed(2)); applyFontScale(); };
  const zoomReset = (): void => { fontScale = 1; applyFontScale(); };

  const toggleFullscreen = async (): Promise<void> => {
    if (isTauri()) {
      const w = getCurrentWindow();
      const isFull = await w.isFullscreen();
      await w.setFullscreen(!isFull);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  };

  const toggleAutosave = (): void => {
    prefs.autosave = !prefs.autosave;
    savePrefs(prefs);
    setupAutosave();
    menubar.refresh();
    toast(prefs.autosave ? "Autosave enabled" : "Autosave disabled");
  };

  const setupAutosave = (): void => {
    if (autosaveTimer) {
      window.clearInterval(autosaveTimer);
      autosaveTimer = null;
    }
    if (!prefs.autosave) return;
    autosaveTimer = window.setInterval(() => {
      const dirtyWithPath = getState().tabs.filter(
        (t) => t.path && t.content !== t.savedContent,
      );
      for (const t of dirtyWithPath) {
        void (async () => {
          try {
            await saveFile(t.path!, t.content);
            updateTab(t.id, { savedContent: t.content });
          } catch (err) {
            console.error("autosave failed:", err);
          }
        })();
      }
    }, prefs.autosaveInterval);
  };

  // ---------- Editor actions ----------
  const editorCmd = (cmd: Parameters<EditorController["run"]>[0]): void =>
    editor.run(cmd);

  const insertLinkPrompt = async (): Promise<void> => {
    const url = await prompt("Insert link", "URL", "", "https://example.com");
    if (!url) return;
    if (editor.hasSelection()) {
      editor.applyLink(url);
    } else {
      const label = await prompt("Link text", "Displayed label", "", "link");
      if (label == null) return;
      editor.insertText(`[${label || url}](${url})`);
    }
  };

  const insertImagePrompt = async (): Promise<void> => {
    const url = await prompt("Insert image", "Image URL", "", "https://…/image.png");
    if (!url) return;
    editor.insertText(`![](${url})`);
  };

  // ---------- Findbar ----------
  const findbar = createFindbar({
    getEditorRoot: () => host.querySelector<HTMLElement>(".ProseMirror"),
    getContent: () => editor.getContent(),
    setContent: async (md) => {
      applyingExternalContent = true;
      await editor.setContent(md);
      applyingExternalContent = false;
      const active = getActiveTab();
      if (active) updateTab(active.id, { content: md });
    },
  });

  const openFind = (): void => findbar.open({ replace: false });
  const openReplace = (): void => findbar.open({ replace: true });

  // ---------- Modals ----------
  const showAbout = (): void => {
    const body = document.createElement("div");
    body.className = "about";
    const pandocLine = pandocReady
      ? `<div class="about__version">Format conversion: ${escapeHtml(pandocVer ?? "Pandoc")} · GPL</div>`
      : `<div class="about__version">Format conversion: <a href="https://pandoc.org/installing.html" target="_blank" rel="noopener">install Pandoc</a> to unlock 40+ formats</div>`;
    // Mirrors TypeX Design System/assets/logo-mark-{dark,light}.svg —
    // same radial gradient, same geometry. Gradient stops bind to the active
    // theme's accent tokens so Ivory Paper swaps automatically.
    body.innerHTML = `
      <div class="about__logo">
        <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <radialGradient id="tx-about-mark" cx="30%" cy="30%" r="65%">
              <stop offset="0%"   stop-color="var(--accent-hover)" />
              <stop offset="45%"  stop-color="var(--accent)" />
              <stop offset="100%" stop-color="var(--accent-active)" />
            </radialGradient>
          </defs>
          <rect width="128" height="128" rx="28" fill="url(#tx-about-mark)"/>
        </svg>
      </div>
      <div class="about__name">TypeX</div>
      <div class="about__version">Version 0.1.0</div>
      ${pandocLine}
      <p class="about__tag">A beautifully crafted Markdown editor.<br/>Built with Tauri, TypeScript, and Milkdown.</p>
    `;
    showModal({
      title: "About TypeX",
      body,
      actions: [{ label: "Close", variant: "primary", run: () => {} }],
    });
  };

  const escapeHtml = (s: string): string =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  const showPreferences = (): void => {
    const body = document.createElement("div");
    body.className = "prefs";
    const s = getState();

    const addRow = (
      parent: HTMLElement,
      title: string,
      desc: string,
      control: HTMLElement,
    ): void => {
      const row = document.createElement("div");
      row.className = "prefs__row";
      const text = document.createElement("div");
      text.className = "prefs__row-text";
      const t = document.createElement("span");
      t.className = "prefs__row-title";
      t.textContent = title;
      const d = document.createElement("span");
      d.className = "prefs__row-desc";
      d.textContent = desc;
      text.append(t, d);
      const ctl = document.createElement("div");
      ctl.className = "prefs__row-control";
      ctl.appendChild(control);
      row.append(text, ctl);
      parent.appendChild(row);
    };

    const makeToggle = (
      checked: boolean,
      onChange: (v: boolean) => void,
    ): HTMLInputElement => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "toggle";
      input.checked = checked;
      input.addEventListener("change", () => onChange(input.checked));
      return input;
    };

    const makeSegmented = <T extends string>(
      options: Array<{ value: T; label: string }>,
      current: T,
      onChange: (v: T) => void,
    ): HTMLElement => {
      const wrap = document.createElement("div");
      wrap.className = "segmented";
      const buttons: HTMLButtonElement[] = [];
      for (const o of options) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "segmented__btn" + (o.value === current ? " is-active" : "");
        btn.textContent = o.label;
        btn.addEventListener("click", () => {
          buttons.forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          onChange(o.value);
        });
        buttons.push(btn);
        wrap.appendChild(btn);
      }
      return wrap;
    };

    // ---- Section: Files ----
    const filesSection = document.createElement("div");
    filesSection.className = "prefs__section";
    const filesTitle = document.createElement("p");
    filesTitle.className = "prefs__section-title";
    filesTitle.textContent = "Files";
    filesSection.appendChild(filesTitle);

    addRow(
      filesSection,
      "Open all formats",
      "Show Word, OpenDocument, RTF, EPUB, LaTeX, and other supported formats in the Open dialog. Turn off to see only Markdown.",
      makeToggle(prefs.openAllFormats, (v) => {
        prefs.openAllFormats = v;
        savePrefs(prefs);
      }),
    );

    addRow(
      filesSection,
      "Autosave",
      `Automatically save changes every ${Math.round(prefs.autosaveInterval / 1000)} seconds while you type.`,
      makeToggle(prefs.autosave, (v) => {
        prefs.autosave = v;
        savePrefs(prefs);
        setupAutosave();
      }),
    );

    // ---- Section: Editor ----
    const editorSection = document.createElement("div");
    editorSection.className = "prefs__section";
    const editorTitle = document.createElement("p");
    editorTitle.className = "prefs__section-title";
    editorTitle.textContent = "Editor";
    editorSection.appendChild(editorTitle);

    addRow(
      editorSection,
      "Reading width",
      "Vertical keeps a focused 72-character column. Horizontal widens to 110 characters for wide screens.",
      makeSegmented<"vertical" | "horizontal">(
        [
          { value: "vertical", label: "Vertical" },
          { value: "horizontal", label: "Horizontal" },
        ],
        s.readingMode,
        (v) => setReadingMode(v),
      ),
    );

    addRow(
      editorSection,
      "Font",
      "Sans for modern clarity, Serif for long-form reading.",
      makeSegmented<"sans" | "serif">(
        [
          { value: "sans", label: "Sans" },
          { value: "serif", label: "Serif" },
        ],
        s.editorFont,
        (v) => setEditorFont(v),
      ),
    );

    addRow(
      editorSection,
      "Typewriter mode",
      "Scroll the editor so the caret stays vertically centered while you type.",
      makeToggle(prefs.typewriter, () => toggleTypewriter()),
    );

    // ---- Section: Format conversion ----
    const convSection = document.createElement("div");
    convSection.className = "prefs__section";
    const convTitle = document.createElement("p");
    convTitle.className = "prefs__section-title";
    convTitle.textContent = "Format conversion";
    convSection.appendChild(convTitle);
    const convStatus = document.createElement("div");
    convStatus.className = "prefs__row";
    const convText = document.createElement("div");
    convText.className = "prefs__row-text";
    const convTitleEl = document.createElement("span");
    convTitleEl.className = "prefs__row-title";
    convTitleEl.textContent = "Pandoc";
    const convDesc = document.createElement("span");
    convDesc.className = "prefs__row-desc";
    convDesc.textContent = pandocReady
      ? `Available: ${pandocVer ?? "Pandoc detected"}. 40+ import and export formats enabled.`
      : "Not detected. Install Pandoc from pandoc.org for 40+ format support, or reinstall TypeX with the bundled installer.";
    convText.append(convTitleEl, convDesc);
    convStatus.appendChild(convText);
    convSection.appendChild(convStatus);

    // ---- Section: Windows integration ----
    const winSection = document.createElement("div");
    winSection.className = "prefs__section";
    const winTitle = document.createElement("p");
    winTitle.className = "prefs__section-title";
    winTitle.textContent = "Windows integration";
    winSection.appendChild(winTitle);

    const defaultsBtn = document.createElement("button");
    defaultsBtn.type = "button";
    defaultsBtn.className = "primary-btn";
    defaultsBtn.textContent = "Open Default Apps settings…";
    defaultsBtn.addEventListener("click", () => {
      void openDefaultAppsSettings();
    });
    addRow(
      winSection,
      "Set TypeX as default",
      "Windows doesn't let apps claim defaults silently. This opens Settings → Default apps so you can assign TypeX to Markdown, Word, EPUB, and any other format you handed it.",
      defaultsBtn,
    );

    body.append(filesSection, editorSection, convSection, winSection);

    showModal({
      title: "Preferences",
      body,
      width: 580,
      actions: [{ label: "Done", variant: "primary", run: () => {} }],
    });
  };

  const showShortcuts = (): void => {
    const rows: Array<[string, string]> = [
      ["New document", "Ctrl+N"],
      ["Open file…", "Ctrl+O"],
      ["Open folder…", "Ctrl+Shift+O"],
      ["Save", "Ctrl+S"],
      ["Save As…", "Ctrl+Shift+S"],
      ["Save All", "Ctrl+Alt+S"],
      ["Close tab", "Ctrl+W"],
      ["Find in document", "Ctrl+F"],
      ["Find & Replace", "Ctrl+H"],
      ["Undo / Redo", "Ctrl+Z / Ctrl+Y"],
      ["Bold / Italic / Strike", "Ctrl+B / Ctrl+I / Ctrl+D"],
      ["Inline code", "Ctrl+`"],
      ["Heading 1–6", "Ctrl+1 … Ctrl+6"],
      ["Paragraph", "Ctrl+0"],
      ["Command palette", "Ctrl+K"],
      ["Toggle sidebar", "Ctrl+\\"],
      ["Toggle theme", "Ctrl+Shift+L"],
      ["Toggle focus mode", "Ctrl+."],
      ["Toggle reading width", "Ctrl+Shift+W"],
      ["Zoom in / out / reset", "Ctrl+= / Ctrl+- / Ctrl+9"],
      ["Fullscreen", "F11"],
    ];
    const body = document.createElement("div");
    const table = document.createElement("table");
    table.className = "shortcuts-table";
    rows.forEach(([label, shortcut]) => {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      td1.textContent = label;
      const td2 = document.createElement("td");
      shortcut.split(" ").forEach((part) => {
        if (part === "/") {
          td2.appendChild(document.createTextNode(" / "));
          return;
        }
        part.split("+").forEach((k, i, arr) => {
          const kbd = document.createElement("kbd");
          kbd.textContent = k;
          td2.appendChild(kbd);
          if (i < arr.length - 1) td2.appendChild(document.createTextNode("+"));
        });
        td2.appendChild(document.createTextNode(" "));
      });
      tr.append(td1, td2);
      table.appendChild(tr);
    });
    body.appendChild(table);
    showModal({
      title: "Keyboard Shortcuts",
      body,
      width: 540,
      actions: [{ label: "Close", variant: "primary", run: () => {} }],
    });
  };

  // ---------- Command palette registry ----------
  registerCommands([
    { id: "file.new", title: "New document", section: "File", shortcut: ["Ctrl", "N"], run: createNew },
    { id: "file.open", title: "Open file…", section: "File", shortcut: ["Ctrl", "O"], run: openFile },
    { id: "file.openFolder", title: "Open folder…", section: "File", shortcut: ["Ctrl", "Shift", "O"], run: openFolder },
    { id: "file.save", title: "Save", section: "File", shortcut: ["Ctrl", "S"], run: save },
    { id: "file.saveAs", title: "Save as…", section: "File", shortcut: ["Ctrl", "Shift", "S"], run: saveAs },
    { id: "file.saveAll", title: "Save all", section: "File", shortcut: ["Ctrl", "Alt", "S"], run: saveAll },
    { id: "file.revert", title: "Revert file", section: "File", run: revertFile },
    { id: "file.exportHtml", title: "Export as HTML (styled)…", section: "Export", run: exportHTMLAction },
    ...EXPORT_FORMATS.map((fmt) => ({
      id: `file.export.${fmt.pandocName}.${fmt.ext}`,
      title: `Export as ${fmt.label}…`,
      section: "Export" as const,
      run: () => void exportAs(fmt),
    })),
    { id: "file.print", title: "Print / Save as PDF…", section: "File", shortcut: ["Ctrl", "P"], run: printDoc },
    { id: "file.closeTab", title: "Close tab", section: "File", shortcut: ["Ctrl", "W"], run: closeActiveTab },
    { id: "file.closeOthers", title: "Close other tabs", section: "File", run: closeOthers },
    { id: "file.closeAll", title: "Close all tabs", section: "File", run: closeAllTabs },

    { id: "edit.undo", title: "Undo", section: "Edit", shortcut: ["Ctrl", "Z"], run: () => editorCmd("undo") },
    { id: "edit.redo", title: "Redo", section: "Edit", shortcut: ["Ctrl", "Y"], run: () => editorCmd("redo") },
    { id: "edit.selectAll", title: "Select all", section: "Edit", shortcut: ["Ctrl", "A"], run: () => editor.selectAll() },
    { id: "edit.find", title: "Find…", section: "Edit", shortcut: ["Ctrl", "F"], run: openFind },
    { id: "edit.replace", title: "Find and Replace…", section: "Edit", shortcut: ["Ctrl", "H"], run: openReplace },

    { id: "view.theme.toggle", title: "Toggle theme", subtitle: "Switch between Obsidian Ink and Ivory Paper", section: "View", shortcut: ["Ctrl", "Shift", "L"], run: toggleTheme },
    { id: "view.theme.dark", title: "Theme: Dark (Obsidian Ink)", section: "View", run: () => applyTheme("dark") },
    { id: "view.theme.light", title: "Theme: Light (Ivory Paper)", section: "View", run: () => applyTheme("light") },
    { id: "view.sidebar.toggle", title: "Toggle sidebar", section: "View", shortcut: ["Ctrl", "\\"], run: toggleSidebar },
    { id: "view.focus.toggle", title: "Toggle focus mode", section: "View", shortcut: ["Ctrl", "."], run: toggleFocusMode },
    { id: "view.typewriter.toggle", title: "Toggle typewriter mode", section: "View", run: toggleTypewriter },
    { id: "view.font.sans", title: "Editor font: Sans", section: "View", run: () => setEditorFont("sans") },
    { id: "view.font.serif", title: "Editor font: Serif", section: "View", run: () => setEditorFont("serif") },
    { id: "view.reading.vertical", title: "Reading width: Vertical (narrow)", section: "View", run: () => setReadingMode("vertical") },
    { id: "view.reading.horizontal", title: "Reading width: Horizontal (wide)", section: "View", run: () => setReadingMode("horizontal") },
    { id: "view.reading.toggle", title: "Toggle reading width", section: "View", shortcut: ["Ctrl", "Shift", "W"], run: toggleReadingMode },
    { id: "view.zoom.in", title: "Zoom in", section: "View", shortcut: ["Ctrl", "="], run: zoomIn },
    { id: "view.zoom.out", title: "Zoom out", section: "View", shortcut: ["Ctrl", "-"], run: zoomOut },
    { id: "view.zoom.reset", title: "Reset zoom", section: "View", shortcut: ["Ctrl", "9"], run: zoomReset },
    { id: "view.fullscreen", title: "Toggle fullscreen", section: "View", shortcut: ["F11"], run: () => void toggleFullscreen() },

    { id: "insert.bold", title: "Bold", section: "Format", shortcut: ["Ctrl", "B"], run: () => editorCmd("bold") },
    { id: "insert.italic", title: "Italic", section: "Format", shortcut: ["Ctrl", "I"], run: () => editorCmd("italic") },
    { id: "insert.strike", title: "Strikethrough", section: "Format", shortcut: ["Ctrl", "D"], run: () => editorCmd("strike") },
    { id: "insert.code", title: "Inline code", section: "Format", shortcut: ["Ctrl", "`"], run: () => editorCmd("inline-code") },
    { id: "insert.link", title: "Link…", section: "Insert", shortcut: ["Ctrl", "L"], run: insertLinkPrompt },
    { id: "insert.image", title: "Image…", section: "Insert", run: insertImagePrompt },
    { id: "insert.table", title: "Table", section: "Insert", run: () => editorCmd("table") },
    { id: "insert.hr", title: "Horizontal rule", section: "Insert", run: () => editorCmd("hr") },
    { id: "insert.codeBlock", title: "Code block", section: "Insert", shortcut: ["Ctrl", "Shift", "K"], run: () => editorCmd("code-block") },
    { id: "insert.blockquote", title: "Quote", section: "Insert", run: () => editorCmd("blockquote") },
    { id: "insert.bulletList", title: "Bulleted list", section: "Insert", run: () => editorCmd("bullet-list") },
    { id: "insert.orderedList", title: "Numbered list", section: "Insert", run: () => editorCmd("ordered-list") },
    { id: "insert.h1", title: "Heading 1", section: "Format", shortcut: ["Ctrl", "1"], run: () => editorCmd("heading-1") },
    { id: "insert.h2", title: "Heading 2", section: "Format", shortcut: ["Ctrl", "2"], run: () => editorCmd("heading-2") },
    { id: "insert.h3", title: "Heading 3", section: "Format", shortcut: ["Ctrl", "3"], run: () => editorCmd("heading-3") },
    { id: "insert.h4", title: "Heading 4", section: "Format", shortcut: ["Ctrl", "4"], run: () => editorCmd("heading-4") },
    { id: "insert.h5", title: "Heading 5", section: "Format", shortcut: ["Ctrl", "5"], run: () => editorCmd("heading-5") },
    { id: "insert.h6", title: "Heading 6", section: "Format", shortcut: ["Ctrl", "6"], run: () => editorCmd("heading-6") },
    { id: "insert.paragraph", title: "Paragraph", section: "Format", shortcut: ["Ctrl", "0"], run: () => editorCmd("paragraph") },

    { id: "tools.preferences", title: "Preferences…", section: "Tools", shortcut: ["Ctrl", ","], run: showPreferences },
    { id: "tools.autosave.toggle", title: "Toggle autosave", section: "Tools", run: toggleAutosave },
    { id: "tools.refreshWorkspace", title: "Refresh folder", section: "Tools", shortcut: ["F5"], run: refreshWorkspace },

    { id: "help.shortcuts", title: "Keyboard shortcuts", section: "Help", run: showShortcuts },
    { id: "help.welcome", title: "Welcome document", section: "Help", run: async () => {
      const tab = tabs.openNew();
      updateTab(tab.id, { content: WELCOME_CONTENT, savedContent: WELCOME_CONTENT });
      applyingExternalContent = true;
      await editor.setContent(WELCOME_CONTENT);
      applyingExternalContent = false;
      currentTabId = tab.id;
    } },
    { id: "help.about", title: "About TypeX", section: "Help", run: showAbout },
  ]);

  // ---------- Menubar ----------
  const menubar = createMenubar(menubarEl);

  const buildRecentSubmenu = (): MenuEntry[] => {
    const files = recentFiles();
    const folders = recentFolders();
    const entries: MenuEntry[] = [];
    if (files.length) {
      entries.push({ type: "section", label: "Files", items: files.slice(0, 8).map((p) => ({
        label: basename(p),
        shortcut: undefined,
        run: () => void openPath(p),
      })) });
    }
    if (folders.length) {
      entries.push({ type: "section", label: "Folders", items: folders.slice(0, 5).map((p) => ({
        label: basename(p),
        run: () => void loadWorkspace(p),
      })) });
    }
    if (!entries.length) {
      entries.push({ label: "No recent items", disabled: true });
    } else {
      entries.push({ type: "separator" });
      entries.push({
        label: "Clear recent",
        run: () => {
          clearRecentFiles();
          clearRecentFolders();
          menubar.refresh();
        },
      });
    }
    return entries;
  };

  const buildExportSubmenu = (): MenuEntry[] => {
    const entries: MenuEntry[] = [];
    entries.push({
      label: "HTML (styled)",
      run: () => void exportHTMLAction(),
    });
    entries.push({ type: "separator" });

    const groups = new Map<string, PandocFormat[]>();
    for (const fmt of EXPORT_FORMATS) {
      const g = fmt.group ?? "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(fmt);
    }

    for (const [groupName, fmts] of groups) {
      entries.push({
        type: "section",
        label: groupName,
        items: fmts.map((fmt) => {
          const isNative = ["gfm", "commonmark_x", "markdown"].includes(fmt.pandocName);
          return {
            label: fmt.label,
            disabled: !isNative && !pandocReady,
            run: () => void exportAs(fmt),
          };
        }),
      });
    }

    entries.push({ type: "separator" });
    entries.push({ label: "PDF (via print)", shortcut: "Ctrl+P", run: printDoc });

    if (!pandocReady) {
      entries.push({ type: "separator" });
      entries.push({
        label: "Install Pandoc for 40+ formats…",
        run: () => showPandocMissingModal(),
      });
    }
    return entries;
  };

  menubar.setGroups([
    {
      id: "file",
      label: "File",
      accessKey: "F",
      build: () => [
        { label: "New document", accessKey: "N", shortcut: "Ctrl+N", run: () => void createNew() },
        { type: "separator" },
        { label: "Open file…", accessKey: "O", shortcut: "Ctrl+O", run: () => void openFile() },
        { label: "Open folder…", accessKey: "F", shortcut: "Ctrl+Shift+O", run: () => void openFolder() },
        { label: "Open recent", accessKey: "R", submenu: buildRecentSubmenu() },
        { type: "separator" },
        { label: "Save", accessKey: "S", shortcut: "Ctrl+S", run: () => void save() },
        { label: "Save as…", accessKey: "a", shortcut: "Ctrl+Shift+S", run: () => void saveAs() },
        { label: "Save all", shortcut: "Ctrl+Alt+S", run: () => void saveAll() },
        { label: "Revert file", disabled: !getActiveTab()?.path, run: () => void revertFile() },
        { type: "separator" },
        {
          label: pandocReady ? "Export as" : "Export as",
          accessKey: "x",
          submenu: buildExportSubmenu(),
        },
        { label: "Print / Save as PDF…", shortcut: "Ctrl+P", run: printDoc },
        { type: "separator" },
        { label: "Close tab", shortcut: "Ctrl+W", run: () => void closeActiveTab() },
        { label: "Close other tabs", run: () => void closeOthers() },
        { label: "Close all tabs", run: () => void closeAllTabs() },
        { type: "separator" },
        {
          label: "Exit",
          shortcut: "Alt+F4",
          run: async () => {
            if (isTauri()) {
              for (const t of getState().tabs) {
                if (!(await confirmDirtyClose(t))) return;
              }
              await getCurrentWindow().close();
            } else {
              window.close();
            }
          },
        },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      accessKey: "E",
      build: () => [
        { label: "Undo", shortcut: "Ctrl+Z", run: () => editorCmd("undo") },
        { label: "Redo", shortcut: "Ctrl+Y", run: () => editorCmd("redo") },
        { type: "separator" },
        { label: "Cut", shortcut: "Ctrl+X", run: () => document.execCommand?.("cut") },
        { label: "Copy", shortcut: "Ctrl+C", run: () => document.execCommand?.("copy") },
        { label: "Paste", shortcut: "Ctrl+V", run: () => document.execCommand?.("paste") },
        { label: "Select all", shortcut: "Ctrl+A", run: () => editor.selectAll() },
        { type: "separator" },
        { label: "Find…", shortcut: "Ctrl+F", run: openFind },
        { label: "Find and Replace…", shortcut: "Ctrl+H", run: openReplace },
      ],
    },
    {
      id: "view",
      label: "View",
      accessKey: "V",
      build: () => {
        const s = getState();
        return [
          { label: "Toggle sidebar", shortcut: "Ctrl+\\", checked: !s.sidebarCollapsed, run: toggleSidebar },
          { label: "Focus mode", shortcut: "Ctrl+.", checked: s.focusMode, run: toggleFocusMode },
          { label: "Typewriter mode", checked: prefs.typewriter, run: toggleTypewriter },
          { type: "separator" },
          {
            label: "Theme",
            submenu: [
              { label: "Dark — Obsidian Ink", checked: s.theme === "dark", run: () => applyTheme("dark") },
              { label: "Light — Ivory Paper", checked: s.theme === "light", run: () => applyTheme("light") },
              { type: "separator" },
              { label: "Toggle", shortcut: "Ctrl+Shift+L", run: toggleTheme },
            ],
          },
          {
            label: "Editor font",
            submenu: [
              { label: "Sans", checked: s.editorFont === "sans", run: () => setEditorFont("sans") },
              { label: "Serif", checked: s.editorFont === "serif", run: () => setEditorFont("serif") },
            ],
          },
          {
            label: "Reading width",
            submenu: [
              { label: "Vertical (narrow)", checked: s.readingMode === "vertical", run: () => setReadingMode("vertical") },
              { label: "Horizontal (wide)", checked: s.readingMode === "horizontal", run: () => setReadingMode("horizontal") },
              { type: "separator" },
              { label: "Toggle", shortcut: "Ctrl+Shift+W", run: toggleReadingMode },
            ],
          },
          { type: "separator" },
          { label: "Zoom in", shortcut: "Ctrl+=", run: zoomIn },
          { label: "Zoom out", shortcut: "Ctrl+-", run: zoomOut },
          { label: "Reset zoom", shortcut: "Ctrl+9", run: zoomReset },
          { type: "separator" },
          { label: "Fullscreen", shortcut: "F11", run: () => void toggleFullscreen() },
        ];
      },
    },
    {
      id: "insert",
      label: "Insert",
      accessKey: "I",
      build: () => [
        { label: "Heading 1", shortcut: "Ctrl+1", run: () => editorCmd("heading-1") },
        { label: "Heading 2", shortcut: "Ctrl+2", run: () => editorCmd("heading-2") },
        { label: "Heading 3", shortcut: "Ctrl+3", run: () => editorCmd("heading-3") },
        { label: "Heading 4", shortcut: "Ctrl+4", run: () => editorCmd("heading-4") },
        { label: "Heading 5", shortcut: "Ctrl+5", run: () => editorCmd("heading-5") },
        { label: "Heading 6", shortcut: "Ctrl+6", run: () => editorCmd("heading-6") },
        { label: "Paragraph", shortcut: "Ctrl+0", run: () => editorCmd("paragraph") },
        { type: "separator" },
        { label: "Link…", shortcut: "Ctrl+L", run: insertLinkPrompt },
        { label: "Image…", run: insertImagePrompt },
        { label: "Code block", shortcut: "Ctrl+Shift+K", run: () => editorCmd("code-block") },
        { label: "Table", run: () => editorCmd("table") },
        { label: "Horizontal rule", run: () => editorCmd("hr") },
        { type: "separator" },
        { label: "Quote", run: () => editorCmd("blockquote") },
        { label: "Bulleted list", run: () => editorCmd("bullet-list") },
        { label: "Numbered list", run: () => editorCmd("ordered-list") },
      ],
    },
    {
      id: "format",
      label: "Format",
      accessKey: "o",
      build: () => [
        { label: "Bold", shortcut: "Ctrl+B", run: () => editorCmd("bold") },
        { label: "Italic", shortcut: "Ctrl+I", run: () => editorCmd("italic") },
        { label: "Strikethrough", shortcut: "Ctrl+D", run: () => editorCmd("strike") },
        { label: "Inline code", shortcut: "Ctrl+`", run: () => editorCmd("inline-code") },
      ],
    },
    {
      id: "tools",
      label: "Tools",
      accessKey: "T",
      build: () => [
        { label: "Command palette", shortcut: "Ctrl+K", run: () => palette.open() },
        { label: "Refresh folder", shortcut: "F5", run: () => void refreshWorkspace() },
        { type: "separator" },
        { label: "Autosave", checked: prefs.autosave, run: toggleAutosave },
        { label: "Open all formats", checked: prefs.openAllFormats, run: () => {
          prefs.openAllFormats = !prefs.openAllFormats;
          savePrefs(prefs);
          menubar.refresh();
        } },
        { type: "separator" },
        { label: "Preferences…", accessKey: "P", shortcut: "Ctrl+,", run: showPreferences },
      ],
    },
    {
      id: "help",
      label: "Help",
      accessKey: "H",
      build: () => [
        { label: "Welcome document", run: () => runCommand("help.welcome") },
        { label: "Keyboard shortcuts", run: showShortcuts },
        { type: "separator" },
        { label: "About TypeX", run: showAbout },
      ],
    },
  ]);

  const palette = createPalette();

  // ---------- Pandoc probe ----------
  // Start the probe now; we'll await it before session restore so reopened
  // .docx / .odt / etc. files route through pandoc correctly instead of
  // hitting a "Pandoc not found" modal due to a timing race.
  const pandocProbe: Promise<void> = (async () => {
    const v = await pandocVersion(true);
    pandocReady = !!v;
    pandocVer = v;
    if (v) {
      console.info(`[typex] pandoc detected: ${v}`);
    } else if (isTauri()) {
      console.info("[typex] pandoc not found; install to unlock 40+ formats");
    }
    menubar.refresh();
  })();

  // ---------- Titlebar / sidebar bindings ----------
  document.getElementById("btn-sidebar")?.addEventListener("click", toggleSidebar);
  document.getElementById("btn-palette")?.addEventListener("click", () => palette.open());
  document.getElementById("btn-theme")?.addEventListener("click", toggleTheme);
  document.getElementById("btn-new-tab")?.addEventListener("click", () => void createNew());

  // The MutationObserver below fires every time the file-tree re-renders
  // (which happens on every state change via setActive). Without a one-shot
  // guard, each run stacks another click listener on the persistent header
  // buttons — a single click then creates as many tabs as times this has run.
  // The data-wired attribute lives on the DOM node, so re-rendered empty-state
  // buttons (new DOM nodes) still get their fresh binding.
  const wireSidebarButtons = (): void => {
    const bindings: Array<[string, () => void | Promise<void>]> = [
      ["btn-open-folder", openFolder],
      ["btn-open-folder-empty", openFolder],
      ["btn-open-file-sidebar", openFile],
      ["btn-new-file", () => void createNew()],
      ["btn-new-file-empty", () => void createNew()],
    ];
    for (const [id, fn] of bindings) {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.wired === "1") continue;
      btn.dataset.wired = "1";
      btn.addEventListener("click", () => {
        void fn();
      });
    }
  };
  wireSidebarButtons();
  new MutationObserver(wireSidebarButtons).observe(fileTreeEl, {
    childList: true,
    subtree: true,
  });

  // ---------- Global keyboard shortcuts ----------
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    const inInput =
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
      !target.closest(".ProseMirror");

    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (mod && k === "k" && !e.shiftKey) {
      if (!inInput) {
        e.preventDefault();
        palette.toggle();
        return;
      }
    }

    if (e.key === "F11") { e.preventDefault(); void toggleFullscreen(); return; }
    if (e.key === "F5") { e.preventDefault(); void refreshWorkspace(); return; }

    if (e.key === "Escape" && findbar.isOpen()) {
      e.preventDefault();
      findbar.close();
      return;
    }

    if (!mod) return;

    if (inInput && !["s", "o", "n", "w"].includes(k)) return;

    // File
    if (k === "n" && !e.shiftKey && !e.altKey) { e.preventDefault(); void createNew(); return; }
    if (k === "o" && !e.shiftKey && !e.altKey) { e.preventDefault(); void openFile(); return; }
    if (k === "o" && e.shiftKey && !e.altKey) { e.preventDefault(); void openFolder(); return; }
    if (k === "s" && !e.shiftKey && !e.altKey) { e.preventDefault(); void save(); return; }
    if (k === "s" && e.shiftKey && !e.altKey) { e.preventDefault(); void saveAs(); return; }
    if (k === "s" && e.altKey) { e.preventDefault(); void saveAll(); return; }
    if (k === "w" && !e.shiftKey) { e.preventDefault(); void closeActiveTab(); return; }
    if (k === "p" && !e.shiftKey) { e.preventDefault(); printDoc(); return; }

    // Edit
    if (k === "f" && !e.shiftKey) { e.preventDefault(); openFind(); return; }
    if (k === "h" && !e.shiftKey) { e.preventDefault(); openReplace(); return; }
    if (k === "a" && !e.shiftKey) { e.preventDefault(); editor.selectAll(); return; }

    // View
    if (k === "l" && e.shiftKey) { e.preventDefault(); toggleTheme(); return; }
    if (k === "w" && e.shiftKey) { e.preventDefault(); toggleReadingMode(); return; }
    if (k === "\\") { e.preventDefault(); toggleSidebar(); return; }
    if (k === ".") { e.preventDefault(); toggleFocusMode(); return; }
    if (k === "=" || k === "+") { e.preventDefault(); zoomIn(); return; }
    if (k === "-") { e.preventDefault(); zoomOut(); return; }
    if (k === "9") { e.preventDefault(); zoomReset(); return; }

    // Preferences
    if (k === ",") { e.preventDefault(); showPreferences(); return; }

    // Format (these are also handled by Milkdown's own keybindings but we
    // keep them here so our menus advertise them consistently.)
    if (k === "b" && !e.shiftKey) { return; /* let Milkdown handle */ }
    if (k === "i" && !e.shiftKey) { return; }

    // Headings
    if (["1","2","3","4","5","6","0"].includes(e.key) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const n = Number(e.key);
      if (n === 0) editorCmd("paragraph");
      else editorCmd(`heading-${n}` as Parameters<EditorController["run"]>[0]);
      return;
    }
  });

  // Window title reflects active tab
  subscribe((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    const dirty = active && active.content !== active.savedContent ? "● " : "";
    document.title = active ? `${dirty}${active.title} — TypeX` : "TypeX";
    // Keep file-tree highlight in sync
    fileTree.setActive(active?.path ?? null);
    // Persist session
    saveSession({
      openFiles: s.tabs.map((t) => t.path).filter((p): p is string => !!p),
      activePath: active?.path ?? null,
      workspaceRoot,
    });
  });

  // Warn when closing with dirty tabs (web fallback)
  window.addEventListener("beforeunload", (e) => {
    const anyDirty = getState().tabs.some((t) => t.content !== t.savedContent);
    if (anyDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ---------- Session restore ----------
  // Wait for the Pandoc probe to finish so non-markdown files in the session
  // open through Pandoc instead of hitting a false "Pandoc missing" modal.
  await pandocProbe;

  // Files passed in on this launch (via "Open with TypeX" / drag-drop on the
  // executable / command-line args). If present, they trump session restore —
  // the user's intent was to open THIS file.
  const launchedWith = await launchPaths();

  if (launchedWith.length > 0 && isTauri()) {
    // Launched from Explorer / "Open with" / CLI — the user asked to see
    // one specific file, not the workspace. Collapse the sidebar so the
    // editor gets the full width. User can always hit Ctrl+\ to bring it
    // back; this is a session-only default that doesn't persist.
    setState({ sidebarCollapsed: true });
    appEl.dataset.sidebar = "collapsed";

    const welcomeTab = initialTab;
    for (const p of launchedWith) {
      await openPath(p);
    }
    if (getState().tabs.length > 1) tabs.closeTab(welcomeTab.id);
  } else {
    // Normal session restore
    const session = loadSession();
    if (session.workspaceRoot && isTauri()) {
      void loadWorkspace(session.workspaceRoot);
    }
    if (session.openFiles.length && isTauri()) {
      const welcomeTab = initialTab;
      for (const p of session.openFiles) {
        if (await pathExists(p)) await openPath(p);
      }
      if (getState().tabs.length > 1) {
        tabs.closeTab(welcomeTab.id);
      }
      if (session.activePath) {
        const target = getState().tabs.find((t) => t.path === session.activePath);
        if (target) tabs.activate(target.id);
      }
    }
  }

  // Second-instance file opens (user double-clicks another file while TypeX
  // is running) — the single-instance plugin forwards those args to us.
  void onLaunchPaths((paths) => {
    for (const p of paths) void openPath(p);
  });

  setupAutosave();

  // First-run "make TypeX default" banner. Non-blocking; slides in beneath
  // the titlebar a moment after the editor settles. No-op if the user has
  // dismissed it permanently, or if we're not in Tauri.
  if (isTauri()) {
    const firstLaunchedExt = launchedWith[0]
      ? extOf(launchedWith[0])
      : undefined;
    window.setTimeout(() => {
      maybeShowDefaultPrompt({ ext: firstLaunchedExt });
    }, 1200);
  }
};

void bootstrap();
