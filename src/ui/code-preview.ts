import { createLowlight, common } from "lowlight";
import type { Root, RootContent } from "hast";
import { getState, subscribe } from "../state";
import { isPlainTextDocument, languageLabel } from "../fs/file-types";

const lowlight = createLowlight(common);
const MAX_HIGHLIGHT_CHARS = 300_000;

const LANGUAGE_ALIAS: Record<string, string> = {
  batch: "dos",
  dockerfile: "dockerfile",
  javascript: "javascript",
  jsonc: "json",
  makefile: "makefile",
  powershell: "powershell",
  shell: "bash",
  typescript: "typescript",
};

export interface CodePreviewController {
  refresh: () => void;
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const resolveLanguage = (language: string | null): string | null => {
  if (!language) return null;
  const lower = language.toLowerCase();
  const resolved = LANGUAGE_ALIAS[lower] ?? lower;
  return lowlight.registered(resolved) ? resolved : null;
};

const hastToHtml = (children: RootContent[]): string => {
  let html = "";
  for (const child of children) {
    if (child.type === "text") {
      html += escapeHtml(child.value);
      continue;
    }
    if (child.type !== "element") continue;
    const cls = child.properties?.className;
    const className = Array.isArray(cls)
      ? cls.filter((c): c is string => typeof c === "string").join(" ")
      : typeof cls === "string"
        ? cls
        : "";
    const classAttr = className ? ` class="${escapeHtml(className)}"` : "";
    html += `<span${classAttr}>${hastToHtml(child.children)}</span>`;
  }
  return html;
};

const highlightLine = (line: string, language: string | null): string => {
  const resolved = resolveLanguage(language);
  if (!resolved || !line) return escapeHtml(line);
  try {
    const tree = lowlight.highlight(resolved, line) as Root;
    return hastToHtml(tree.children);
  } catch {
    return escapeHtml(line);
  }
};

const renderLines = (
  content: string,
  language: string | null,
): string => {
  const shouldHighlight = content.length <= MAX_HIGHLIGHT_CHARS;
  const lines = content.split("\n");
  const width = String(Math.max(lines.length, 1)).length;
  return lines
    .map((line, idx) => {
      const code = shouldHighlight ? highlightLine(line, language) : escapeHtml(line);
      const display = code || "&nbsp;";
      return `<span class="code-preview__line"><span class="code-preview__num">${String(idx + 1).padStart(width, " ")}</span><span class="code-preview__code">${display}</span></span>`;
    })
    .join("");
};

export const initCodePreview = (host: HTMLElement): CodePreviewController => {
  let lastKey = "";

  const refresh = (): void => {
    const state = getState();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab || !isPlainTextDocument(tab.documentKind) || state.viewMode === "raw") {
      host.replaceChildren();
      host.removeAttribute("data-language");
      lastKey = "";
      return;
    }

    const key = [
      tab.id,
      tab.language ?? "",
      tab.documentKind,
      tab.content,
      state.viewMode,
    ].join("\u0000");
    if (key === lastKey) return;
    lastKey = key;

    host.dataset.language = tab.language ?? "text";
    const label = tab.documentKind === "code"
      ? languageLabel(tab.language)
      : "Plain text";
    host.innerHTML = `
      <div class="code-preview__bar">
        <span class="code-preview__title">${escapeHtml(label)}</span>
        <span class="code-preview__hint">Read mode</span>
        <button type="button" class="ghost-btn code-preview__write" data-code-action="write">Write</button>
      </div>
      <pre class="code-preview__pre" tabindex="0"><code>${renderLines(tab.content, tab.language)}</code></pre>
    `;
  };

  subscribe(refresh);
  refresh();

  return { refresh };
};
