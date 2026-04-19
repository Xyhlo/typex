import { subscribe as subscribeState, getState } from "../state";
import { parseMarkdownForIndex } from "../vault/index";

/**
 * Properties panel — shows frontmatter (YAML header) of the active document.
 * Parses on the fly from the active tab's content, so it updates as the user
 * types into the frontmatter block. Display-only in Phase 1.
 */
export const initProperties = (): void => {
  const root = document.getElementById("properties")!;

  const render = (): void => {
    root.replaceChildren();
    const state = getState();
    const active = state.tabs.find((t) => t.id === state.activeTabId);
    if (!active) {
      empty(root, "No open document");
      return;
    }
    const parsed = parseMarkdownForIndex(active.path ?? active.title, active.content);
    const entries = Object.entries(parsed.frontmatter);
    if (entries.length === 0) {
      empty(
        root,
        "No frontmatter",
        "Add a YAML block at the top of the document:<br><code>---<br>title: My Note<br>tags: [draft]<br>---</code>",
      );
      return;
    }
    for (const [key, value] of entries) {
      const row = document.createElement("div");
      row.className = "properties-row";
      const k = document.createElement("div");
      k.className = "properties-key";
      k.textContent = key;
      const v = document.createElement("div");
      v.className = "properties-value";
      if (Array.isArray(value)) {
        v.classList.add("properties-value--list");
        for (const item of value) {
          const chip = document.createElement("span");
          chip.className = "properties-chip";
          chip.textContent = item;
          v.appendChild(chip);
        }
      } else {
        v.textContent = value;
      }
      row.append(k, v);
      root.appendChild(row);
    }
  };

  subscribeState(render);
};

const empty = (root: HTMLElement, title: string, hintHtml?: string): void => {
  const wrap = document.createElement("div");
  wrap.className = "file-tree__empty";
  const h = document.createElement("p");
  h.textContent = title;
  wrap.appendChild(h);
  if (hintHtml) {
    const hint = document.createElement("p");
    hint.className = "file-tree__empty-hint";
    hint.innerHTML = hintHtml;
    wrap.appendChild(hint);
  }
  root.appendChild(wrap);
};
