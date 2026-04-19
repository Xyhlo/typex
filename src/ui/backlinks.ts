import { subscribe as subscribeVault, getVaultIndex } from "../vault/index";
import { subscribe as subscribeState, getState } from "../state";
import { basename } from "../fs/files";

interface InitOpts {
  onOpenFile: (path: string) => void;
}

const stripExt = (name: string): string => name.replace(/\.[^.]+$/, "");

export const initBacklinks = (opts: InitOpts): void => {
  const root = document.getElementById("backlinks")!;
  // State-triggered renders fire on every keystroke. Skip if the active-tab
  // identity hasn't changed — backlinks only depend on which file is active,
  // not what's being typed into it. Vault-triggered renders always go through.
  let lastActivePath: string | null = null;
  let lastActiveId: string | null = null;

  const render = (opts2: { fromVault?: boolean } = {}): void => {
    const state = getState();
    const active = state.tabs.find((t) => t.id === state.activeTabId);
    const activePath = active?.path ?? null;
    const activeId = active?.id ?? null;
    if (!opts2.fromVault && activeId === lastActiveId && activePath === lastActivePath) {
      return;
    }
    lastActiveId = activeId;
    lastActivePath = activePath;

    root.replaceChildren();

    if (!active || !active.path) {
      return emptyState(root, "No open document");
    }

    const snap = getVaultIndex();
    if (!snap.root) {
      return emptyState(root, "Open a folder to see backlinks");
    }

    const name = stripExt(basename(active.path)).toLowerCase();
    const linking = snap.backlinks.get(name);
    if (!linking || linking.size === 0) {
      return emptyState(
        root,
        "No backlinks to this document",
        `Write <code>[[${stripExt(basename(active.path))}]]</code> in another file to create one.`,
      );
    }

    const items = Array.from(linking)
      .map((p) => snap.files.get(p))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .sort((a, b) => a.title.localeCompare(b.title));

    for (const f of items) {
      const btn = document.createElement("button");
      btn.className = "backlink-item";
      btn.type = "button";
      const title = document.createElement("span");
      title.className = "backlink-item__title";
      title.textContent = f.title || basename(f.path);
      const path = document.createElement("span");
      path.className = "backlink-item__path";
      path.textContent = f.path;
      btn.append(title, path);
      btn.addEventListener("click", () => opts.onOpenFile(f.path));
      root.appendChild(btn);
    }
  };

  subscribeVault(() => render({ fromVault: true }));
  subscribeState(() => render());
};

const emptyState = (root: HTMLElement, title: string, hintHtml?: string): void => {
  const empty = document.createElement("div");
  empty.className = "file-tree__empty";
  const h = document.createElement("p");
  h.textContent = title;
  empty.appendChild(h);
  if (hintHtml) {
    const hint = document.createElement("p");
    hint.className = "file-tree__empty-hint";
    hint.innerHTML = hintHtml;
    empty.appendChild(hint);
  }
  root.appendChild(empty);
};
