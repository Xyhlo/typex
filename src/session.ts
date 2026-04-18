const SESSION_KEY = "typex:session";
const PREFS_KEY = "typex:prefs";

export interface SessionData {
  openFiles: string[];
  activePath: string | null;
  workspaceRoot: string | null;
}

export interface Prefs {
  autosave: boolean;
  autosaveInterval: number;
  typewriter: boolean;
  readingMode: "vertical" | "horizontal";
  editorFont: "sans" | "serif";
  /**
   * When true, File → Open File presents every format TypeX can import
   * (Word, OpenDocument, EPUB, LaTeX, reST, AsciiDoc, Org, …).
   * When false, only Markdown-family files show up in the dialog.
   */
  openAllFormats: boolean;
}

const DEFAULT_PREFS: Prefs = {
  autosave: false,
  autosaveInterval: 15_000,
  typewriter: false,
  readingMode: "vertical",
  editorFont: "sans",
  openAllFormats: true,
};

export const loadSession = (): SessionData => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { openFiles: [], activePath: null, workspaceRoot: null };
    const s = JSON.parse(raw);
    return {
      openFiles: Array.isArray(s.openFiles) ? s.openFiles.filter((x: unknown) => typeof x === "string") : [],
      activePath: typeof s.activePath === "string" ? s.activePath : null,
      workspaceRoot: typeof s.workspaceRoot === "string" ? s.workspaceRoot : null,
    };
  } catch {
    return { openFiles: [], activePath: null, workspaceRoot: null };
  }
};

export const saveSession = (s: SessionData): void => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

export const loadPrefs = (): Prefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const savePrefs = (p: Prefs): void => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
};
