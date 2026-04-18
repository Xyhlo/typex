import { getState, subscribe, isDirty, type DocTab } from "../state";

const WPM = 238; // typical reading speed

/** Extension → friendly mode label shown in the status bar. */
const FRIENDLY: Record<string, string> = {
  md: "Markdown",
  markdown: "Markdown",
  mdx: "MDX",
  txt: "Plain text",
  docx: "Word",
  odt: "OpenDocument",
  rtf: "Rich Text",
  html: "HTML",
  htm: "HTML",
  epub: "EPUB",
  fb2: "FictionBook",
  rst: "reStructuredText",
  adoc: "AsciiDoc",
  asciidoc: "AsciiDoc",
  tex: "LaTeX",
  latex: "LaTeX",
  org: "Org mode",
  textile: "Textile",
  wiki: "MediaWiki",
  mediawiki: "MediaWiki",
  muse: "Emacs Muse",
  t2t: "txt2tags",
  opml: "OPML",
  ipynb: "Jupyter Notebook",
  bib: "BibTeX",
  man: "Unix man page",
};

const modeLabel = (tab: DocTab | undefined): string => {
  if (!tab) return "Markdown";
  const ext = tab.sourceExt?.toLowerCase();
  if (ext && FRIENDLY[ext]) return FRIENDLY[ext];
  return "Markdown";
};

export const initStatusbar = (): void => {
  const pathEl = document.getElementById("status-path")!;
  const dirtyEl = document.getElementById("status-dirty")!;
  const wordsEl = document.getElementById("status-words")!;
  const charsEl = document.getElementById("status-chars")!;
  const readEl = document.getElementById("status-reading")!;
  const modeEl = document.getElementById("status-mode")!;

  const render = (): void => {
    const s = getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    if (!active) {
      pathEl.textContent = "No document";
      dirtyEl.hidden = true;
      wordsEl.textContent = "0 words";
      charsEl.textContent = "0 chars";
      readEl.textContent = "0 min";
      modeEl.textContent = "Markdown";
      return;
    }

    pathEl.textContent = active.path ?? active.title;
    dirtyEl.hidden = !isDirty(active);

    const content = active.content;
    const words = content.match(/\b[\p{L}\p{N}'’-]+\b/gu)?.length ?? 0;
    const chars = content.length;
    const minutes = Math.max(1, Math.round(words / WPM));
    wordsEl.textContent = `${words.toLocaleString()} words`;
    charsEl.textContent = `${chars.toLocaleString()} chars`;
    readEl.textContent = `${minutes} min`;
    modeEl.textContent = modeLabel(active);
  };

  subscribe(render);
  render();
};
