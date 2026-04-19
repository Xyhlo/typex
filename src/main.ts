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
import { initEditorContextMenu } from "./ui/editor-context-menu";
import { createPalette } from "./ui/palette";
import { initSidebar, toggleSidebar } from "./ui/sidebar";
import { initStatusbar } from "./ui/statusbar";
import { initOutline } from "./ui/outline";
import { initTags } from "./ui/tags";
import { initBacklinks } from "./ui/backlinks";
import { initProperties } from "./ui/properties";
import {
  initViewMode,
  toggleRawMode,
  toggleSplitMode,
  setViewMode,
} from "./ui/view-mode";
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
  setWorkspaceRoot as setVaultRoot,
  onFileSaved as onVaultFileSaved,
} from "./vault/index";
import {
  refreshGitStatus,
  refreshCurrentGitStatus,
  getGitStatus,
  gitCommitAll,
  gitPush,
  gitPull,
} from "./git";
import {
  onAnySave,
  onWindowFocus as onGitFocus,
  cancelPendingCommitFor,
  summarizeSyncError as summarizeGitError,
} from "./git/autosync";
import { initGitGutter, refreshGitGutter } from "./ui/git-gutter";
import { watchRoots, markOwnWrite } from "./fs/watcher";
import {
  startStreamingSweeper,
  subscribeStreaming,
  isStreaming,
} from "./fs/streaming";
import { initExternalChange } from "./ui/external-change";
import { showCloneDialog } from "./ui/clone-dialog";
import {
  listProviders as aiListProviders,
  getDetection as aiGetDetection,
  refreshAll as aiRefreshAll,
  getActive as aiGetActive,
  setActive as aiSetActive,
  complete as aiComplete,
} from "./ai/manager";
import { setSecret as aiSetSecret, getSecret as aiGetSecret } from "./ai/secrets";
import { getCustomModels as aiGetCustomModels, addCustomModel as aiAddCustomModel } from "./ai/custom-models";
import { initAIIndicator } from "./ui/ai-indicator";
import { showPopupMenu } from "./ui/recent-menu";
import {
  getActiveTab,
  getState,
  setState,
  updateTab,
  subscribe,
  primaryWorkspaceRoot,
  addWorkspaceRoot,
  removeWorkspaceRoot,
  setWorkspaceRoots,
  type DocTab,
} from "./state";
import { WELCOME_CONTENT } from "./welcome";
import { getCurrentWindow } from "@tauri-apps/api/window";

const bootstrap = async (): Promise<void> => {
  initTheme();
  initSidebar();
  initStatusbar();
  initOutline();
  initAIIndicator();
  void initWindowControls();
  // Phase 4: kick a provider detection in the background so Preferences
  // has fresh state when the user opens it.
  void aiRefreshAll();

  const host = document.getElementById("editor")!;
  const stripEl = document.getElementById("tab-strip")!;
  const fileTreeEl = document.getElementById("file-tree")!;
  const menubarEl = document.getElementById("menubar")!;
  const appEl = document.getElementById("app")!;

  let currentTabId: string | null = null;
  let applyingExternalContent = false;
  // Cached per-root directory trees so switch-back-to-a-previous-root is
  // instant rather than re-walking the FS.
  const rootTreeCache = new Map<string, import("./fs/files").DirEntryNode>();
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
    // Cancel any in-flight stream on the outgoing tab. Without this, a
    // pending rAF step from streamApply can write the old tab's content
    // into the new tab's buffer after `setContent` has already landed.
    editor.cancelStream();
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
    onOpenWikilink: (target, resolved) => {
      if (resolved) void openPath(resolved);
      else toast(`No document named "${target}"`);
    },
  });
  editor.focus();

  // Ghost-text autocomplete lifecycle — a single editor view serves every
  // tab, so we just attach / detach on the shared instance.
  const applyAutocompleteToActiveTab = (): void => {
    const p = loadPrefs();
    const active = aiGetActive();
    if (p.aiEnabled && p.aiAutocomplete && active) {
      editor.attachAIAutocomplete();
    } else {
      editor.detachAIAutocomplete();
    }
  };
  applyAutocompleteToActiveTab();

  // Right-click over the editor: if there's a text selection AND AI is on,
  // show AI tools (Rewrite / Fix / Summarize / Translate). Otherwise the
  // browser's default menu is untouched.
  initEditorContextMenu({
    host,
    getSelection: () => editor.getSelection(),
    actions: {
      rewrite:    () => void runCommand("ai.rewrite"),
      fixGrammar: () => void runCommand("ai.fix"),
      summarize:  () => void runCommand("ai.summarize"),
      translate:  () => void runCommand("ai.translate"),
    },
  });

  const fileTree = createFileTree(fileTreeEl, {
    onOpenFile: (path) => void openPath(path),
    onCloseRoot: (path) => void closeWorkspaceFolder(path),
  });
  initTags({ onOpenFile: (path) => void openPath(path) });
  initBacklinks({ onOpenFile: (path) => void openPath(path) });
  initProperties();
  const viewModeOpts = {
    editor,
    applyContentToEditor: async (md: string) => {
      applyingExternalContent = true;
      try {
        await editor.setContent(md);
      } finally {
        applyingExternalContent = false;
      }
    },
  };
  initViewMode(viewModeOpts);

  // Wave 4: pull-on-focus hook.
  window.addEventListener("focus", () => {
    void onGitFocus();
  });

  // External-change policy — silent reload when clean, prompt when dirty.
  initExternalChange({
    reloadTab: async (path, disk, opts = {}) => {
      const t = getState().tabs.find((x) => x.path === path);
      if (!t) return;
      const oldMarkdown = t.content;
      updateTab(t.id, { content: disk, savedContent: disk });
      // Drop any pending autocommit for this path — the message we'd have
      // built is no longer accurate now that local edits were discarded.
      cancelPendingCommitFor(path);
      if (getState().activeTabId === t.id) {
        applyingExternalContent = true;
        try {
          const animate = loadPrefs().animateExternalEdits;
          if (opts.streaming) {
            // Mid-stream apply: gradually type the content in over ~400ms
            // with a blinking caret at the growing edge, preserve scroll,
            // and flash the changed range when the stream settles. Skip the
            // toast — the visible typing is the affordance.
            await editor.applyExternalText(disk, {
              flashChangedLines: animate,
              oldMarkdown,
              stream: animate,
            });
          } else {
            // One-shot external save (git checkout, single editor save).
            // Preserve scroll but don't flash — a batch-file-update shouldn't
            // light up every open tab. Flash only happens inside streams.
            await editor.applyExternalText(disk, {
              flashChangedLines: false,
              oldMarkdown,
            });
            toast(`Reloaded ${basename(path)}`);
          }
        } finally {
          applyingExternalContent = false;
        }
      } else if (!opts.streaming) {
        toast(`Reloaded ${basename(path)}`);
      }
    },
    onExternalChange: (_path) => {
      // Git/vault might be affected by any fs change.
      void refreshCurrentGitStatus();
      const active = getActiveTab();
      if (active?.path) void refreshGitGutter(active.path);
    },
  });

  // Start the streaming sweeper so stale paths drop out of "streaming" after
  // their last event ages out.
  startStreamingSweeper();

  // Propagate streaming state to the DOM: `data-streaming-any` on <html> for
  // a global status-bar badge, and `data-streaming="true"` on each matching
  // tab for its pulse animation.
  const applyStreamingAttrs = (): void => {
    // `animateExternalEdits` gates ALL streaming visuals — pulse, LIVE
    // badge, and flash — so a user who wants a calm UI can turn everything
    // off with one toggle.
    const animate = loadPrefs().animateExternalEdits;
    const anyActive =
      animate &&
      getState().tabs.some((t) => t.path && isStreaming(t.path));
    document.documentElement.dataset.streamingAny = anyActive ? "true" : "false";
    const live = document.getElementById("status-live");
    if (live) live.hidden = !anyActive;
    const strip = document.getElementById("tab-strip");
    if (!strip) return;
    const tabEls = strip.querySelectorAll<HTMLElement>(".tab[data-id]");
    for (const el of Array.from(tabEls)) {
      const tabId = el.dataset.id;
      const tab = getState().tabs.find((t) => t.id === tabId);
      const streaming = animate && !!tab?.path && isStreaming(tab.path);
      el.dataset.streaming = streaming ? "true" : "false";
    }
  };
  subscribeStreaming(applyStreamingAttrs);
  // Also re-apply after tab-strip re-renders (which happen on state changes),
  // so the newly-minted DOM nodes pick up the current streaming state.
  subscribe(applyStreamingAttrs);
  // Git gutter in the raw pane.
  const rawTextarea = document.getElementById("raw-editor") as HTMLTextAreaElement | null;
  const rawGutterHost = document.getElementById("git-gutter");
  const gutterOpts = rawTextarea && rawGutterHost
    ? { textarea: rawTextarea, host: rawGutterHost }
    : null;
  if (gutterOpts) initGitGutter(gutterOpts);
  // Status-bar view button cycles wysiwyg → raw → split → wysiwyg.
  const statusViewBtn = document.getElementById("status-view");
  if (statusViewBtn) {
    statusViewBtn.addEventListener("click", () => {
      const current = getState().viewMode;
      const next = current === "wysiwyg" ? "raw" : current === "raw" ? "split" : "wysiwyg";
      void setViewMode(next, viewModeOpts);
    });
  }

  // Git sync pill — click to refresh status.
  const statusGitBtn = document.getElementById("status-git");
  if (statusGitBtn) {
    statusGitBtn.addEventListener("click", () => {
      void refreshCurrentGitStatus();
    });
  }

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

  let folderDialogOpen = false;
  const openFolder = async (): Promise<void> => {
    if (!isTauri()) {
      toast("Open folder is only available in the desktop app");
      return;
    }
    if (folderDialogOpen) return;
    folderDialogOpen = true;
    try {
      const folder = await openFolderDialog();
      if (!folder) return;
      await addWorkspaceFolder(folder);
    } finally {
      folderDialogOpen = false;
    }
  };

  /**
   * Serialize workspace-view refreshes so rapid add/close calls don't race
   * on `setVaultRoot`, `watchRoots`, and `mountRoots`.
   */
  let refreshChain: Promise<void> = Promise.resolve();
  const refreshWorkspaceViews = (): Promise<void> => {
    const next = refreshChain.then(runRefreshWorkspaceViews);
    refreshChain = next.catch(() => {}); // keep chain alive on errors
    return next;
  };
  const runRefreshWorkspaceViews = async (): Promise<void> => {
    const roots = getState().workspaceRoots;
    const trees: import("./fs/files").DirEntryNode[] = [];
    for (const r of roots) {
      try {
        const tree = await readWorkspace(r);
        rootTreeCache.set(r, tree);
        trees.push(tree);
      } catch (err) {
        console.error(`[workspace] failed to read ${r}:`, err);
      }
    }
    fileTree.mountRoots(trees);
    const titleEl = document.getElementById("files-title");
    if (titleEl) {
      titleEl.textContent =
        roots.length === 0
          ? "Files"
          : roots.length === 1
            ? basename(roots[0])
            : `${roots.length} folders`;
    }
    // Await vault + watcher so back-to-back refreshes observe consistent state.
    await setVaultRoot(roots);
    await watchRoots(roots);
    const active = getActiveTab();
    const gitTarget = active?.path ?? primaryWorkspaceRoot();
    void refreshGitStatus(gitTarget);
  };

  /** Add a folder to the workspace. No-op if already open. */
  const addWorkspaceFolder = async (folder: string): Promise<void> => {
    const before = getState().workspaceRoots.length;
    addWorkspaceRoot(folder);
    const after = getState().workspaceRoots.length;
    if (after === before) {
      toast(`${basename(folder)} is already open`);
      return;
    }
    pushRecentFolder(folder);
    toast(`Added ${basename(folder)}`);
    await refreshWorkspaceViews();
  };

  /** Remove a folder from the workspace. */
  const closeWorkspaceFolder = async (folder: string): Promise<void> => {
    const before = getState().workspaceRoots.length;
    removeWorkspaceRoot(folder);
    if (getState().workspaceRoots.length === before) return;
    rootTreeCache.delete(folder);
    toast(`Removed ${basename(folder)}`);
    await refreshWorkspaceViews();
  };

  /**
   * Replace the entire roots list — used by session restore. Filters out
   * paths that no longer exist on disk so ghost roots don't persist across
   * reboots.
   */
  const loadWorkspaces = async (folders: string[]): Promise<void> => {
    const alive: string[] = [];
    for (const f of folders) {
      try {
        if (await pathExists(f)) alive.push(f);
      } catch {
        /* skip */
      }
    }
    const dropped = folders.length - alive.length;
    if (dropped > 0) {
      toast(`${dropped} folder${dropped === 1 ? "" : "s"} from last session no longer exist`);
    }
    setWorkspaceRoots(alive);
    for (const f of alive) pushRecentFolder(f);
    await refreshWorkspaceViews();
  };

  /** @deprecated — single-folder compat for old call sites. */
  const loadWorkspace = async (folder: string): Promise<void> => {
    await loadWorkspaces([folder]);
  };

  /** Popup menu showing recent folders — click to add to workspace. */
  const showRecentFoldersMenu = (): void => {
    const anchor = document.getElementById("btn-recent-folders");
    if (!anchor) return;
    const recents = recentFolders();
    const openSet = new Set(
      getState().workspaceRoots.map((r) => r.replace(/\\/g, "/").toLowerCase()),
    );
    const items = recents.map((path) => {
      const open = openSet.has(path.replace(/\\/g, "/").toLowerCase());
      return {
        label: basename(path),
        subtitle: path,
        checked: open,
        disabled: open,
        run: () => void addWorkspaceFolder(path),
      };
    });
    if (recents.length > 0) {
      items.push({
        label: "Clear recent folders",
        subtitle: "",
        checked: false,
        disabled: false,
        run: () => {
          clearRecentFolders();
          toast("Cleared recent folders");
        },
      });
    }
    showPopupMenu({
      anchor,
      title: "Recent folders",
      items,
      emptyMessage: "No recent folders",
    });
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
      markOwnWrite(tab.path);
      await saveFile(tab.path, tab.content);
      // Re-mark after the write — catches fs events that arrive post-write.
      markOwnWrite(tab.path);
      void onVaultFileSaved(tab.path, tab.content);
      void refreshCurrentGitStatus();
      void refreshGitGutter(tab.path);
      onAnySave(tab.path);
      return;
    }
    markOwnWrite(tab.path);
    const targetFmt =
      tab.sourceFormat ?? getExportFormatByExt(ext)?.pandocName ?? null;
    if (!targetFmt) {
      throw new Error(`No converter for .${ext}`);
    }
    if (!pandocReady) {
      throw new Error("Pandoc is required for this format");
    }
    await pandocExport(tab.content, targetFmt, tab.path);
    // Re-mark after the long Pandoc write so the post-write fs event is still
    // inside the blackout window.
    markOwnWrite(tab.path);
    void refreshCurrentGitStatus();
    void refreshGitGutter(tab.path);
    onAnySave(tab.path);
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
    const primaryRoot = primaryWorkspaceRoot();
    const defaultPath =
      active.path ??
      (primaryRoot
        ? `${primaryRoot}/${base}.${defaultExt}`
        : `${base}.${defaultExt}`);

    const chosen = await saveAsDialog(defaultPath);
    if (!chosen) return;

    const chosenExt = extOf(chosen);
    const finalPath = chosenExt ? chosen : `${chosen}.${defaultExt}`;
    const finalExt = extOf(finalPath);

    try {
      if (isMarkdownExt(finalExt) || !finalExt) {
        markOwnWrite(finalPath);
        await saveFile(finalPath, active.content);
        markOwnWrite(finalPath);
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
      // If the saved file lands inside any open root, refresh that root's tree.
      if (getState().workspaceRoots.some((r) => finalPath.startsWith(r))) {
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
    const exportRoot = primaryWorkspaceRoot();
    const defaultPath = exportRoot
      ? `${exportRoot}/${base}.${format.ext}`
      : `${base}.${format.ext}`;
    const chosen = await saveAsDialog(defaultPath);
    if (!chosen) return;
    const finalPath = chosen.toLowerCase().endsWith(`.${format.ext}`)
      ? chosen
      : `${chosen}.${format.ext}`;
    const progress = progressToast(`Exporting to ${format.label}…`);
    try {
      if (isNative) {
        markOwnWrite(finalPath);
        await saveFile(finalPath, active.content);
        markOwnWrite(finalPath);
      } else {
        markOwnWrite(finalPath);
        await pandocExport(active.content, format.pandocName, finalPath);
        markOwnWrite(finalPath);
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
    if (getState().workspaceRoots.length === 0) {
      toast("No folder open");
      return;
    }
    try {
      await refreshWorkspaceViews();
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
            markOwnWrite(t.path!);
            await saveFile(t.path!, t.content);
            markOwnWrite(t.path!);
            updateTab(t.id, { savedContent: t.content });
            onAnySave(t.path!);
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
      <div class="about__version">Version 0.3.0</div>
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

    addRow(
      filesSection,
      "Live-reload external writes",
      "When an AI agent or another editor rapidly writes to a file that's open here, apply the writes through instead of popping a 'Keep mine / Reload' modal per chunk. Turn off to restore the modal gate for every external change on a dirty tab.",
      makeToggle(prefs.liveReload, (v) => {
        prefs.liveReload = v;
        savePrefs(prefs);
      }),
    );

    addRow(
      filesSection,
      "Animate external edits",
      "Pulse the tab and briefly highlight changed blocks when external writes land.",
      makeToggle(prefs.animateExternalEdits, (v) => {
        prefs.animateExternalEdits = v;
        savePrefs(prefs);
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

    // ---- Section: Git ----
    const gitSection = document.createElement("div");
    gitSection.className = "prefs__section";
    const gitTitle = document.createElement("p");
    gitTitle.className = "prefs__section-title";
    gitTitle.textContent = "Git";
    gitSection.appendChild(gitTitle);

    addRow(
      gitSection,
      "Autocommit on save",
      `Silently commit changes ${Math.round((prefs.autocommitDelayMs ?? 15000) / 1000)} seconds after your last save. Only runs when the workspace is a git repo.`,
      makeToggle(prefs.autocommit, (v) => {
        prefs.autocommit = v;
        savePrefs(prefs);
      }),
    );
    addRow(
      gitSection,
      "Autopush after commit",
      "Runs git push after each autocommit. Uses your system git credential helper — TypeX does not store credentials.",
      makeToggle(prefs.autopush, (v) => {
        prefs.autopush = v;
        savePrefs(prefs);
      }),
    );
    addRow(
      gitSection,
      "Pull on focus",
      "Run git pull --ff-only when the window regains focus. Only fires when the working tree is clean.",
      makeToggle(prefs.autopullOnFocus, (v) => {
        prefs.autopullOnFocus = v;
        savePrefs(prefs);
      }),
    );

    // ---- Section: AI (Phase 4) ----
    const aiSection = document.createElement("div");
    aiSection.className = "prefs__section";
    const aiTitle = document.createElement("p");
    aiTitle.className = "prefs__section-title";
    aiTitle.textContent = "AI";
    aiSection.appendChild(aiTitle);

    addRow(
      aiSection,
      "Enable AI commands",
      "When on, TypeX shows \u201CAI:\u201D commands in the command palette and can stream completions from a local or remote provider. Off by default.",
      makeToggle(prefs.aiEnabled, (v) => {
        prefs.aiEnabled = v;
        savePrefs(prefs);
        applyAutocompleteToActiveTab();
        void renderAIBody();
      }),
    );

    const aiBody = document.createElement("div");
    aiBody.className = "prefs__ai-body";
    aiSection.appendChild(aiBody);

    const renderAIBody = async (): Promise<void> => {
      aiBody.replaceChildren();
      if (!prefs.aiEnabled) return;
      const loading = document.createElement("p");
      loading.className = "prefs__hint";
      loading.textContent = "Probing providers\u2026";
      aiBody.appendChild(loading);
      await aiRefreshAll();
      aiBody.replaceChildren();
      const providers = aiListProviders();
      const active = aiGetActive();

      /**
       * Per-provider "Use" button + <select> so we can refresh the Active
       * badge without tearing down the whole list every time the user picks
       * a new model.
       */
      const useButtons = new Map<string, HTMLButtonElement>();
      const selects = new Map<string, HTMLSelectElement>();
      let autocompleteCheck: HTMLInputElement | null = null;

      const refreshActiveUI = (): void => {
        const a = aiGetActive();
        for (const [pid, btn] of useButtons) {
          const sel = selects.get(pid);
          const selectedModel = sel?.value.split(":")[1];
          const rowIsActive =
            a?.providerId === pid && a?.modelId === selectedModel;
          btn.textContent = a?.providerId === pid ? "Active" : "Use this provider";
          btn.disabled = rowIsActive;
        }
        if (autocompleteCheck) autocompleteCheck.disabled = !a;
      };

      // Intro: clarify that API + CLI entries for the same vendor are
      // independent choices, not alternatives that auto-select for you.
      const intro = document.createElement("p");
      intro.className = "prefs__hint";
      intro.innerHTML =
        "Each row is its own provider. You can pick the API (add a key) " +
        "<em>or</em> the CLI (uses its own login) for the same vendor \u2014 " +
        "they're independent, and only one is active at a time.";
      aiBody.appendChild(intro);

      // Group by vendor so Anthropic API + Claude Code CLI sit under one header.
      const labelForVendor: Record<string, string> = {
        ollama: "Ollama (local)",
        anthropic: "Anthropic",
        openai: "OpenAI",
        google: "Google",
      };
      const groups = new Map<string, typeof providers>();
      for (const p of providers) {
        const v = p.vendor ?? p.id;
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v)!.push(p);
      }

      for (const [vendor, group] of groups) {
        if (group.length > 1 || labelForVendor[vendor]) {
          const heading = document.createElement("div");
          heading.className = "prefs__ai-vendor";
          heading.textContent = labelForVendor[vendor] ?? vendor;
          aiBody.appendChild(heading);
        }
        for (const p of group) {
          const state = aiGetDetection(p.id);
          const row = document.createElement("div");
          row.className = "prefs__ai-provider";

        const head = document.createElement("div");
        head.className = "prefs__ai-head";
        const dot = document.createElement("span");
        dot.className = "prefs__ai-dot";
        if (state?.status.available) dot.classList.add("is-ok");
        else dot.classList.add("is-off");
        const label = document.createElement("span");
        label.className = "prefs__ai-label";
        label.textContent = p.label;
        const kind = document.createElement("span");
        kind.className = "prefs__ai-kind";
        kind.textContent =
          p.kind === "http-local" ? "local" : p.kind === "http-remote" ? "remote" : "cli";
        const detail = document.createElement("span");
        detail.className = "prefs__ai-detail";
        detail.textContent = state?.status.available
          ? `${state.models.length} model${state.models.length === 1 ? "" : "s"}`
          : state?.status.detail ?? "not detected";
        head.append(dot, label, kind, detail);
        row.appendChild(head);

        // API key input for remote providers.
        if (p.kind === "http-remote") {
          const keyRow = document.createElement("div");
          keyRow.className = "prefs__ai-keyrow";
          const keyInput = document.createElement("input");
          keyInput.type = "password";
          keyInput.className = "prefs__ai-key";
          keyInput.placeholder = `${p.label} API key`;
          keyInput.autocomplete = "off";
          const keyName = `${p.id}-api-key`;
          aiGetSecret(keyName).then((v) => {
            keyInput.value = v ?? "";
          });
          const save = document.createElement("button");
          save.type = "button";
          save.className = "secondary-btn";
          save.textContent = "Save key";
          save.addEventListener("click", async () => {
            await aiSetSecret(keyName, keyInput.value.trim());
            await aiRefreshAll();
            void renderAIBody();
          });
          keyRow.append(keyInput, save);
          row.appendChild(keyRow);
        }

        // Model picker when available.
        if (state?.status.available && state.models.length > 0) {
          const picker = document.createElement("div");
          picker.className = "prefs__ai-picker";
          const select = document.createElement("select");
          select.className = "prefs__ai-select";
          const populate = (): void => {
            select.replaceChildren();
            const combined = [...state.models, ...aiGetCustomModels(p.id)];
            for (const m of combined) {
              const opt = document.createElement("option");
              opt.value = `${p.id}:${m.id}`;
              opt.textContent = m.note ? `${m.label} \u2014 ${m.note}` : m.label;
              if (active?.providerId === p.id && active?.modelId === m.id) {
                opt.selected = true;
              }
              select.appendChild(opt);
            }
          };
          populate();
          const use = document.createElement("button");
          use.type = "button";
          use.className = "primary-btn";
          use.textContent =
            active?.providerId === p.id ? "Active" : "Use this provider";
          use.disabled = active?.providerId === p.id && active?.modelId === select.value.split(":")[1];
          use.addEventListener("click", () => {
            const [pid, mid] = select.value.split(":");
            aiSetActive({ providerId: pid, modelId: mid });
            applyAutocompleteToActiveTab();
            refreshActiveUI();
          });
          select.addEventListener("change", () => {
            const a = aiGetActive();
            if (a?.providerId === p.id) {
              const [pid, mid] = select.value.split(":");
              aiSetActive({ providerId: pid, modelId: mid });
              applyAutocompleteToActiveTab();
              refreshActiveUI();
            } else {
              refreshActiveUI();
            }
          });
          const addCustom = document.createElement("button");
          addCustom.type = "button";
          addCustom.className = "secondary-btn prefs__ai-custom-btn";
          addCustom.textContent = "+ Custom\u2026";
          addCustom.title = "Add a model ID not listed by the vendor";
          addCustom.addEventListener("click", async () => {
            const id = await prompt(
              `Add a custom model for ${p.label}`,
              "Model ID",
              "",
              "e.g. gpt-5-mini, claude-sonnet-4-5, gemini-2.5-flash",
            );
            if (!id || !id.trim()) return;
            aiAddCustomModel(p.id, id.trim());
            populate();
            // Auto-select + activate the freshly-added model.
            select.value = `${p.id}:${id.trim()}`;
            aiSetActive({ providerId: p.id, modelId: id.trim() });
            applyAutocompleteToActiveTab();
            refreshActiveUI();
          });
          useButtons.set(p.id, use);
          selects.set(p.id, select);
          picker.append(select, addCustom, use);
          row.appendChild(picker);
        }
          aiBody.appendChild(row);
        }
      }

      // Inline autocomplete — disabled until a provider + model are active.
      const acRow = document.createElement("div");
      acRow.className = "prefs__ai-autocomplete";
      const acHead = document.createElement("label");
      acHead.className = "prefs__ai-autocomplete-head";
      const acCheck = document.createElement("input");
      acCheck.type = "checkbox";
      acCheck.checked = prefs.aiAutocomplete;
      acCheck.disabled = !aiGetActive();
      autocompleteCheck = acCheck;
      acCheck.addEventListener("change", () => {
        prefs.aiAutocomplete = acCheck.checked;
        savePrefs(prefs);
        applyAutocompleteToActiveTab();
      });
      const acLabel = document.createElement("span");
      acLabel.textContent = "Inline autocomplete (ghost text after a pause)";
      acHead.append(acCheck, acLabel);
      acRow.appendChild(acHead);

      if (!active) {
        const need = document.createElement("p");
        need.className = "prefs__hint";
        need.textContent = "Pick an active provider + model above to enable autocomplete.";
        acRow.appendChild(need);
      } else {
        const delay = document.createElement("div");
        delay.className = "prefs__ai-autocomplete-delay";
        const dLabel = document.createElement("span");
        dLabel.textContent = "Delay";
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "250";
        slider.max = "2500";
        slider.step = "50";
        slider.value = String(prefs.aiAutocompleteDelayMs);
        const out = document.createElement("output");
        out.textContent = `${prefs.aiAutocompleteDelayMs} ms`;
        slider.addEventListener("input", () => {
          const ms = Number(slider.value);
          out.textContent = `${ms} ms`;
          prefs.aiAutocompleteDelayMs = ms;
          savePrefs(prefs);
        });
        delay.append(dLabel, slider, out);
        acRow.appendChild(delay);

        const promptLabel = document.createElement("label");
        promptLabel.className = "prefs__ai-autocomplete-prompt-label";
        promptLabel.textContent = "System prompt";
        acRow.appendChild(promptLabel);

        const promptArea = document.createElement("textarea");
        promptArea.className = "prefs__ai-autocomplete-prompt";
        promptArea.rows = 5;
        promptArea.spellcheck = false;
        promptArea.placeholder = "Leave empty to use the strict built-in default.";
        promptArea.value = prefs.aiAutocompletePrompt;
        promptArea.addEventListener("input", () => {
          prefs.aiAutocompletePrompt = promptArea.value;
          savePrefs(prefs);
        });
        acRow.appendChild(promptArea);

        const resetRow = document.createElement("div");
        resetRow.className = "prefs__ai-autocomplete-reset";
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "secondary-btn";
        reset.textContent = "Reset to default";
        reset.addEventListener("click", () => {
          promptArea.value = "";
          prefs.aiAutocompletePrompt = "";
          savePrefs(prefs);
        });
        resetRow.appendChild(reset);
        acRow.appendChild(resetRow);

        const hint = document.createElement("p");
        hint.className = "prefs__hint";
        hint.innerHTML =
          "After the pause, a short continuation appears in dim italic. <code>Tab</code> accepts, <code>Esc</code> dismisses, any keystroke cancels.<br>" +
          "<strong>Only direct APIs and Ollama support autocomplete</strong> \u2014 CLI agents like Claude Code / Codex / Gemini CLI are chat-tuned and meta-respond.";
        acRow.appendChild(hint);
      }
      aiBody.appendChild(acRow);

      const note = document.createElement("p");
      note.className = "prefs__hint";
      note.innerHTML =
        "Ollama is local \u2014 prompts never leave your machine. API and CLI providers send prompts to the vendor. API keys live in the OS keychain.";
      aiBody.appendChild(note);
    };
    void renderAIBody();

    body.append(filesSection, editorSection, gitSection, aiSection, convSection, winSection);

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

  /**
   * Run an AI command inline — clears the current selection (if any), shows
   * a pulsing accent glow + streaming caret in its place, and applies chunks
   * as they arrive. Esc aborts and reverts; Ctrl+Z after finish also reverts
   * (the transactions group into a single undo step).
   *
   * If `requireSelection` is false, the edit starts at the cursor with no
   * prior text (used by Continue).
   */
  const runInlineAI = async (opts: {
    system: string;
    prompt: string;
    requireSelection: boolean;
    /** Leading text to insert before the first streamed chunk (e.g. a space). */
    leadIn?: string;
  }): Promise<void> => {
    const prefs = loadPrefs();
    if (!prefs.aiEnabled) { toast("Enable AI in Preferences \u2192 AI"); return; }
    const active = aiGetActive();
    if (!active) { toast("Pick a provider + model in Preferences \u2192 AI"); return; }
    if (opts.requireSelection) {
      const sel = editor.getSelection();
      if (!sel || !sel.trim()) { toast("Select some text first"); return; }
    }

    const handle = editor.beginInlineAIEdit();
    let leadInWritten = !opts.leadIn;

    const ctrl = new AbortController();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        ctrl.abort();
      }
    };
    window.addEventListener("keydown", onKey, true);

    let errored = false;
    try {
      for await (const chunk of aiComplete({
        system: opts.system,
        prompt: opts.prompt,
        signal: ctrl.signal,
      })) {
        if (chunk.text) {
          if (!leadInWritten) {
            handle.write(opts.leadIn!);
            leadInWritten = true;
          }
          handle.write(chunk.text);
        }
        if (chunk.meta?.error) {
          errored = true;
          toast(`AI error: ${String(chunk.meta.error).slice(0, 160)}`);
        }
        if (chunk.meta?.cancelled) {
          handle.abort();
          return;
        }
        if (chunk.done) break;
      }
      if (errored) handle.abort();
      else handle.finish();
    } catch (err) {
      if (ctrl.signal.aborted) {
        handle.abort();
      } else {
        handle.abort();
        toast(`AI error: ${String(err).slice(0, 160)}`);
      }
    } finally {
      window.removeEventListener("keydown", onKey, true);
    }
  };

  // ---------- Command palette registry ----------
  registerCommands([
    { id: "file.new", title: "New document", section: "File", shortcut: ["Ctrl", "N"], run: createNew },
    { id: "file.open", title: "Open file…", section: "File", shortcut: ["Ctrl", "O"], run: openFile },
    { id: "file.openFolder", title: "Add folder to workspace…", subtitle: "Stacks with any already-open folders", section: "File", shortcut: ["Ctrl", "Shift", "O"], run: openFolder },
    { id: "file.recentFolders", title: "Open recent folder…", subtitle: "Pick from recently-used folders", section: "File", run: showRecentFoldersMenu },
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
    { id: "view.raw.toggle", title: "Toggle raw source mode", subtitle: "Show the raw Markdown text", section: "View", shortcut: ["Ctrl", "/"], run: () => toggleRawMode(viewModeOpts) },
    { id: "view.split.toggle", title: "Toggle split view", subtitle: "Raw on the left, WYSIWYG preview on the right", section: "View", shortcut: ["Ctrl", "Shift", "/"], run: () => toggleSplitMode(viewModeOpts) },
    { id: "git.refresh", title: "Refresh git status", subtitle: "Re-read branch, dirty state, and upstream ahead/behind", section: "Git", run: () => void refreshCurrentGitStatus() },
    {
      id: "ai.rewrite",
      title: "AI: Rewrite selection",
      subtitle: "Stream a rewrite over the selection. Esc aborts, Ctrl+Z undoes.",
      section: "AI",
      run: () => {
        const sel = editor.getSelection();
        if (!sel || !sel.trim()) { toast("Select some text first"); return; }
        void runInlineAI({
          requireSelection: true,
          prompt: sel,
          system:
            "You are a careful writing assistant. Rewrite the given text for " +
            "clarity and rhythm. Keep the author's voice, meaning, and markdown " +
            "formatting. Return ONLY the rewritten prose \u2014 no preamble, no " +
            "explanation, no quotes, no self-introduction.",
        });
      },
    },
    {
      id: "ai.autocomplete.toggle",
      title: "AI: Toggle inline autocomplete",
      subtitle: "Ghost-text suggestions after a typing pause. Tab accepts, Esc dismisses.",
      section: "AI",
      run: () => {
        const p = loadPrefs();
        if (!p.aiEnabled) { toast("Enable AI in Preferences \u2192 AI"); return; }
        if (!aiGetActive()) { toast("Pick a provider + model in Preferences \u2192 AI"); return; }
        p.aiAutocomplete = !p.aiAutocomplete;
        savePrefs(p);
        applyAutocompleteToActiveTab();
        toast(p.aiAutocomplete ? "Inline autocomplete on" : "Inline autocomplete off");
      },
    },
    {
      id: "ai.continue",
      title: "AI: Continue from here",
      subtitle: "Stream a continuation at the cursor. Esc aborts, Ctrl+Z undoes.",
      section: "AI",
      run: () => {
        const context = editor.getTextBeforeCursor(2000);
        if (!context.trim()) { toast("Write something first \u2014 nothing to continue from"); return; }
        const prev = context.slice(-1);
        const needsSpace = /\S/.test(prev);
        void runInlineAI({
          requireSelection: false,
          leadIn: needsSpace ? " " : undefined,
          prompt: context,
          system:
            "You are a silent text-completion engine. Continue the user's text " +
            "naturally in the same voice and register. Emit ONLY the continuation " +
            "\u2014 no preamble, no restatement, no self-introduction, no markdown " +
            "fences. Stop at the next natural breakpoint (end of sentence or " +
            "paragraph).",
        });
      },
    },
    {
      id: "ai.summarize",
      title: "AI: Summarize (to clipboard)",
      subtitle: "Summarize the selection or the whole document; summary is copied to the clipboard.",
      section: "AI",
      run: () => {
        if (!loadPrefs().aiEnabled) { toast("Enable AI in Preferences \u2192 AI"); return; }
        if (!aiGetActive()) { toast("Pick a provider + model in Preferences \u2192 AI"); return; }
        const selected = editor.getSelection();
        const body = selected && selected.trim() ? selected : editor.getContent().slice(0, 8000);
        if (!body.trim()) { toast("Nothing to summarize"); return; }
        const p = progressToast("Summarizing\u2026");
        void (async () => {
          let accumulated = "";
          try {
            for await (const chunk of aiComplete({
              system:
                "Summarize the text in 3 to 5 sentences. Keep the author's voice, " +
                "preserve essential technical detail, skip filler. Return ONLY the " +
                "summary \u2014 no preamble, no headings, no quotes, no self-introduction.",
              prompt: body,
            })) {
              if (chunk.text) accumulated += chunk.text;
              if (chunk.meta?.error) {
                p.error(`AI error: ${String(chunk.meta.error).slice(0, 160)}`);
                return;
              }
              if (chunk.done) break;
            }
            const out = accumulated.trim();
            if (!out) { p.close(); toast("Nothing came back"); return; }
            try {
              await navigator.clipboard.writeText(out);
              p.success("Summary copied to clipboard");
            } catch {
              p.close();
              toast("Summary ready \u2014 but clipboard write failed");
            }
          } catch (err) {
            p.error(`AI error: ${String(err).slice(0, 160)}`);
          }
        })();
      },
    },
    {
      id: "ai.fix",
      title: "AI: Fix grammar",
      subtitle: "Correct grammar/spelling in the selection in place. Esc aborts.",
      section: "AI",
      run: () => {
        const sel = editor.getSelection();
        if (!sel || !sel.trim()) { toast("Select some text first"); return; }
        void runInlineAI({
          requireSelection: true,
          prompt: sel,
          system:
            "Fix spelling, grammar, and punctuation in the text. Do not rewrite " +
            "for style, tone, or structure \u2014 the author's voice must remain " +
            "intact. Preserve all markdown formatting. Return ONLY the corrected " +
            "prose \u2014 no preamble, no explanation, no self-introduction.",
        });
      },
    },
    {
      id: "ai.translate",
      title: "AI: Translate selection\u2026",
      subtitle: "Translate the selected text in place. You pick the target language.",
      section: "AI",
      run: () => {
        const sel = editor.getSelection();
        if (!sel || !sel.trim()) { toast("Select some text first"); return; }
        void (async () => {
          const target = await prompt(
            "Translate to\u2026",
            "Target language",
            "Spanish",
            "French, Japanese, Brazilian Portuguese, \u2026",
          );
          if (!target || !target.trim()) return;
          const lang = target.trim();
          await runInlineAI({
            requireSelection: true,
            prompt: sel,
            system:
              `Translate the text into ${lang}. Preserve meaning, register, and ` +
              "all markdown formatting (headings, lists, emphasis, code spans, " +
              "links). Do not add a preamble, transliteration, or explanation \u2014 " +
              "return ONLY the translated prose.",
          });
        })();
      },
    },
    {
      id: "git.commit",
      title: "Commit all changes",
      subtitle: "Stage everything and commit with a TypeX-generated message",
      section: "Git",
      run: () => {
        const s = getGitStatus();
        if (!s.is_repo || !s.root) { toast("No git repo in this workspace"); return; }
        void (async () => {
          const p = progressToast("Committing…");
          try {
            const result = await gitCommitAll(s.root!, "TypeX: update");
            if (!result.committed) { p.close(); toast(result.message); }
            else p.success(`Committed ${result.file_count} file(s)${result.short ? ` · ${result.short}` : ""}`);
            void refreshCurrentGitStatus();
          } catch (err) {
            p.error(`Commit failed: ${String(err).slice(0, 160)}`);
          }
        })();
      },
    },
    {
      id: "git.push",
      title: "Push to upstream",
      subtitle: "git push — uses your system git credential helper",
      section: "Git",
      run: () => {
        const s = getGitStatus();
        if (!s.is_repo || !s.root) { toast("No git repo in this workspace"); return; }
        void (async () => {
          const p = progressToast("Pushing…");
          const res = await gitPush(s.root!);
          if (res.ok) p.success("Pushed");
          else p.error(`Push failed: ${summarizeGitError(res.stderr)}`);
          void refreshCurrentGitStatus();
        })();
      },
    },
    {
      id: "git.clone",
      title: "Clone a git repository…",
      subtitle: "Paste any git URL and pick a destination folder",
      section: "Git",
      run: () => showCloneDialog({
        onCloned: async (absolutePath) => {
          await loadWorkspace(absolutePath);
        },
      }),
    },
    {
      id: "git.pull",
      title: "Pull from upstream (--ff-only)",
      subtitle: "git pull --ff-only — safely fetches and fast-forwards",
      section: "Git",
      run: () => {
        const s = getGitStatus();
        if (!s.is_repo || !s.root) { toast("No git repo in this workspace"); return; }
        void (async () => {
          const p = progressToast("Pulling…");
          const res = await gitPull(s.root!);
          if (res.ok) {
            if (res.stdout.includes("Already up to date")) p.close();
            else p.success("Pulled latest");
          } else {
            p.error(`Pull failed: ${summarizeGitError(res.stderr)}`);
          }
          void refreshCurrentGitStatus();
        })();
      },
    },
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
        { label: "Add folder to workspace…", accessKey: "F", shortcut: "Ctrl+Shift+O", run: () => void openFolder() },
        { label: "Clone git repository…", accessKey: "C", run: () => showCloneDialog({
          onCloned: async (p) => { await loadWorkspace(p); },
        }) },
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
          { label: "Raw source", shortcut: "Ctrl+/", checked: s.viewMode === "raw", run: () => toggleRawMode(viewModeOpts) },
          { label: "Split (raw + preview)", shortcut: "Ctrl+Shift+/", checked: s.viewMode === "split", run: () => toggleSplitMode(viewModeOpts) },
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
      ["btn-recent-folders", () => showRecentFoldersMenu()],
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
    if (k === "/" && !e.shiftKey) { e.preventDefault(); toggleRawMode(viewModeOpts); return; }
    if (k === "/" && e.shiftKey) { e.preventDefault(); toggleSplitMode(viewModeOpts); return; }
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
    const roots = s.workspaceRoots;
    saveSession({
      openFiles: s.tabs.map((t) => t.path).filter((p): p is string => !!p),
      activePath: active?.path ?? null,
      workspaceRoot: roots[0] ?? null, // legacy field
      workspaceRoots: roots,
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
    if (session.workspaceRoots.length > 0 && isTauri()) {
      void loadWorkspaces(session.workspaceRoots);
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
