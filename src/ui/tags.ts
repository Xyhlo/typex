import {
  subscribe as subscribeVault,
  getVaultIndex,
  type VaultFile,
} from "../vault/index";
import { basename } from "../fs/files";

interface InitOpts {
  onOpenFile: (path: string) => void;
}

interface TagRow {
  tag: string;
  count: number;
  files: VaultFile[];
}

const expanded = new Set<string>();

export const initTags = (opts: InitOpts): void => {
  const root = document.getElementById("tags")!;

  const render = (): void => {
    root.replaceChildren();

    const { tagToFiles, files } = getSnapshot();
    const rows: TagRow[] = [];
    for (const [tag, set] of tagToFiles) {
      const tagFiles: VaultFile[] = [];
      for (const p of set) {
        const f = files.get(p);
        if (f) tagFiles.push(f);
      }
      tagFiles.sort((a, b) => a.title.localeCompare(b.title));
      rows.push({ tag, count: tagFiles.length, files: tagFiles });
    }
    rows.sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));

    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "file-tree__empty";
      empty.innerHTML = "<p>No tags yet</p><p class=\"file-tree__empty-hint\">Use <code>#tag</code> in any document.</p>";
      root.appendChild(empty);
      return;
    }

    for (const row of rows) {
      const wrapper = document.createElement("div");
      wrapper.className = "tag-row";
      if (expanded.has(row.tag)) wrapper.classList.add("is-expanded");

      const header = document.createElement("button");
      header.className = "tag-row__header";
      header.type = "button";
      const chev = document.createElement("span");
      chev.className = "tag-row__chev";
      chev.textContent = "▸";
      const label = document.createElement("span");
      label.className = "tag-row__label";
      label.textContent = `#${row.tag}`;
      const count = document.createElement("span");
      count.className = "tag-row__count";
      count.textContent = String(row.count);
      header.append(chev, label, count);
      header.addEventListener("click", () => {
        if (expanded.has(row.tag)) expanded.delete(row.tag);
        else expanded.add(row.tag);
        render();
      });

      const list = document.createElement("div");
      list.className = "tag-row__files";
      for (const f of row.files) {
        const item = document.createElement("button");
        item.className = "tag-row__file";
        item.type = "button";
        item.textContent = f.title || basename(f.path);
        item.title = f.path;
        item.addEventListener("click", () => opts.onOpenFile(f.path));
        list.appendChild(item);
      }

      wrapper.append(header, list);
      root.appendChild(wrapper);
    }
  };

  subscribeVault(render);
};

const getSnapshot = () => getVaultIndex();
