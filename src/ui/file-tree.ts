import type { DirEntryNode } from "../fs/files";

export interface FileTreeHandlers {
  onOpenFile: (path: string) => void;
}

export interface FileTreeController {
  mount: (root: DirEntryNode | null) => void;
  setActive: (path: string | null) => void;
  refresh: () => void;
}

const SVG_CHEVRON =
  '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>';
const SVG_FOLDER =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5a1.5 1.5 0 0 1 1.5-1.5h2.2a1.5 1.5 0 0 1 1.06.44L8 5h5.5A1.5 1.5 0 0 1 15 6.5v5A1.5 1.5 0 0 1 13.5 13h-10A1.5 1.5 0 0 1 2 11.5Z"/></svg>';
const SVG_FOLDER_OPEN =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5a1.5 1.5 0 0 1 1.5-1.5h2.2a1.5 1.5 0 0 1 1.06.44L8 5h5.5A1.5 1.5 0 0 1 15 6.5"/><path d="m2.5 13 1.8-5.2A1 1 0 0 1 5.24 7H14.5a1 1 0 0 1 .95 1.32l-1.3 3.9a1.5 1.5 0 0 1-1.42 1.03H3.4"/></svg>';
const SVG_FILE =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M9 2v3h3"/></svg>';

export const createFileTree = (
  rootEl: HTMLElement,
  handlers: FileTreeHandlers,
): FileTreeController => {
  let current: DirEntryNode | null = null;
  let activePath: string | null = null;
  const openFolders = new Set<string>();

  const render = (): void => {
    rootEl.replaceChildren();
    if (!current) {
      rootEl.innerHTML = `
        <div class="file-tree__empty">
          <p class="file-tree__empty-title">No folder opened</p>
          <p class="file-tree__empty-sub">Open a folder to browse and edit your notes.</p>
          <div class="file-tree__empty-actions">
            <button id="btn-open-folder-empty" class="primary-btn">Open folder</button>
            <button id="btn-new-file-empty" class="ghost-btn">New document</button>
          </div>
        </div>`;
      return;
    }

    const path = document.createElement("div");
    path.className = "file-tree__folder-path";
    path.textContent = current.path;
    path.title = current.path;
    rootEl.appendChild(path);

    const list = document.createElement("div");
    list.className = "file-list";
    (current.children ?? []).forEach((n) => renderNode(list, n, 0));
    rootEl.appendChild(list);
  };

  const renderNode = (
    parent: HTMLElement,
    node: DirEntryNode,
    depth: number,
  ): void => {
    const row = document.createElement("div");
    row.className =
      "file-node " +
      (node.isDirectory ? "is-dir" : "is-file") +
      (activePath === node.path ? " is-active" : "");
    row.dataset.path = node.path;
    row.title = node.path;
    row.style.paddingLeft = `${depth * 12 + 6}px`;

    const chev = document.createElement("span");
    chev.className = "file-node__chevron";
    chev.innerHTML = node.isDirectory ? SVG_CHEVRON : "";
    row.appendChild(chev);

    const icon = document.createElement("span");
    icon.className = "file-node__icon";
    icon.innerHTML = node.isDirectory
      ? openFolders.has(node.path)
        ? SVG_FOLDER_OPEN
        : SVG_FOLDER
      : SVG_FILE;
    row.appendChild(icon);

    const label = document.createElement("span");
    label.className = "file-node__label";
    label.textContent = node.name;
    row.appendChild(label);

    if (node.isDirectory) {
      if (openFolders.has(node.path)) row.classList.add("is-open");
      row.addEventListener("click", () => {
        if (openFolders.has(node.path)) openFolders.delete(node.path);
        else openFolders.add(node.path);
        render();
      });
    } else {
      row.addEventListener("click", () => {
        handlers.onOpenFile(node.path);
      });
    }

    parent.appendChild(row);

    if (node.isDirectory && openFolders.has(node.path) && node.children) {
      const sub = document.createElement("div");
      sub.className = "file-children";
      node.children.forEach((child) => renderNode(sub, child, depth + 1));
      parent.appendChild(sub);
    }
  };

  // Render the empty state immediately so the DOM has a single source of
  // truth for the no-folder-open placeholder.
  render();

  return {
    mount(root) {
      current = root;
      if (root) {
        openFolders.add(root.path);
        (root.children ?? [])
          .filter((c) => c.isDirectory)
          .slice(0, 1)
          .forEach((c) => openFolders.add(c.path));
      }
      render();
    },
    setActive(path) {
      activePath = path;
      render();
    },
    refresh() {
      render();
    },
  };
};
