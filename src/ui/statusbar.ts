import { getState, subscribe, isDirty, type DocTab } from "../state";
import { subscribeGit, type GitStatus } from "../git";

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

const VIEW_LABEL: Record<string, string> = {
  wysiwyg: "WYSIWYG",
  raw: "Raw",
  split: "Split",
};

const formatGitLabel = (s: GitStatus): { label: string; state: string } => {
  if (s.in_progress) return { label: `${s.branch ?? "HEAD"} · merging`, state: "in-progress" };
  if (s.detached) return { label: "detached", state: "detached" };
  if (s.initial_commit) {
    return {
      label: `${s.branch ?? "main"} · empty`,
      state: "initial",
    };
  }
  const branch = s.branch ?? "no branch";
  const diverged = (s.ahead ?? 0) > 0 || (s.behind ?? 0) > 0;
  const parts: string[] = [branch];
  if (s.upstream_gone) {
    parts.push("upstream gone");
  } else if (s.ahead != null && s.behind != null && diverged) {
    const ab: string[] = [];
    if (s.ahead > 0) ab.push(`↑${s.ahead}`);
    if (s.behind > 0) ab.push(`↓${s.behind}`);
    parts.push(ab.join(" "));
  }
  if (s.dirty_count > 0) parts.push(`${s.dirty_count} changes`);
  else if (!diverged && !s.upstream_gone) parts.push("clean");
  const state = s.upstream_gone
    ? "gone"
    : diverged
      ? "diverged"
      : !s.clean
        ? "dirty"
        : "clean";
  return { label: parts.join(" · "), state };
};

export const initStatusbar = (): void => {
  const pathEl = document.getElementById("status-path")!;
  const dirtyEl = document.getElementById("status-dirty")!;
  const wordsEl = document.getElementById("status-words")!;
  const charsEl = document.getElementById("status-chars")!;
  const readEl = document.getElementById("status-reading")!;
  const modeEl = document.getElementById("status-mode")!;
  const viewEl = document.getElementById("status-view");
  const gitEl = document.getElementById("status-git") as HTMLButtonElement | null;
  const gitLabelEl = document.getElementById("status-git-label");

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
      if (viewEl) viewEl.textContent = VIEW_LABEL[s.viewMode] ?? "WYSIWYG";
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
    if (viewEl) viewEl.textContent = VIEW_LABEL[s.viewMode] ?? "WYSIWYG";
  };

  subscribe(render);
  render();

  if (gitEl && gitLabelEl) {
    subscribeGit((status) => {
      if (!status.is_repo) {
        gitEl.hidden = true;
        return;
      }
      gitEl.hidden = false;
      if (status.error) {
        gitEl.dataset.state = "error";
        gitLabelEl.textContent = status.error.startsWith("git-missing")
          ? "git not found"
          : "git error";
        gitEl.title = status.error;
        return;
      }
      const { label, state } = formatGitLabel(status);
      gitEl.dataset.state = state;
      gitLabelEl.textContent = label;
      const tip = [
        status.root ? `Repo: ${status.root}` : "",
        status.branch ? `Branch: ${status.branch}` : "",
        status.ahead != null || status.behind != null
          ? `Upstream: ↑${status.ahead ?? 0} ↓${status.behind ?? 0}`
          : "No upstream",
        status.dirty_count > 0 ? `${status.dirty_count} changed files` : "Working tree clean",
      ]
        .filter(Boolean)
        .join("\n");
      gitEl.title = tip;
    });
  }
};
