import type { DirEntryNode } from "../fs/files";

export interface FileTreeHandlers {
  onOpenFile: (path: string) => void;
  /** Optional — called when the user clicks the × on a root header. */
  onCloseRoot?: (rootPath: string) => void;
}

export interface FileTreeController {
  /** @deprecated — single-root compatibility; prefer `mountRoots`. */
  mount: (root: DirEntryNode | null) => void;
  /** Render a list of root folders. Pass an empty array to show empty state. */
  mountRoots: (roots: DirEntryNode[]) => void;
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
const SVG_CLOSE =
  '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

export const createFileTree = (
  rootEl: HTMLElement,
  handlers: FileTreeHandlers,
): FileTreeController => {
  let roots: DirEntryNode[] = [];
  let activePath: string | null = null;
  const openFolders = new Set<string>();
  // Per-root collapse state (whole root expanded/collapsed).
  const collapsedRoots = new Set<string>();

  const render = (): void => {
    rootEl.replaceChildren();
    if (roots.length === 0) {
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

    for (const root of roots) renderRoot(root);
  };

  const renderRoot = (root: DirEntryNode): void => {
    const section = document.createElement("section");
    section.className = "file-tree__root";
    if (collapsedRoots.has(root.path)) section.classList.add("is-collapsed");

    const header = document.createElement("div");
    header.className = "file-tree__root-header";
    header.title = root.path;

    const chev = document.createElement("span");
    chev.className = "file-tree__root-chev";
    chev.innerHTML = SVG_CHEVRON;
    const name = document.createElement("span");
    name.className = "file-tree__root-name";
    name.textContent = root.name;
    const path = document.createElement("span");
    path.className = "file-tree__root-path";
    path.textContent = root.path;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "file-tree__root-close";
    close.innerHTML = SVG_CLOSE;
    close.setAttribute("aria-label", `Remove ${root.name} from workspace`);
    close.title = "Remove from workspace";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onCloseRoot?.(root.path);
    });

    header.append(chev, name, path, close);
    header.addEventListener("click", () => {
      if (collapsedRoots.has(root.path)) collapsedRoots.delete(root.path);
      else collapsedRoots.add(root.path);
      render();
    });
    section.appendChild(header);

    if (!collapsedRoots.has(root.path)) {
      const list = document.createElement("div");
      list.className = "file-list";
      (root.children ?? []).forEach((n) => renderNode(list, n, 0));
      section.appendChild(list);
    }

    rootEl.appendChild(section);
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

  render();

  return {
    mount(root) {
      this.mountRoots(root ? [root] : []);
    },
    mountRoots(next) {
      roots = next;
      for (const r of next) {
        // Auto-open the root and its first subfolder for quick orientation.
        openFolders.add(r.path);
        (r.children ?? [])
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
