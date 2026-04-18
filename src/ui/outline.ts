import { getState, subscribe } from "../state";

interface OutlineItem {
  level: number;
  text: string;
  slug: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const parseOutline = (md: string): OutlineItem[] => {
  const items: OutlineItem[] = [];
  const lines = md.split("\n");
  let inCode = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = HEADING_RE.exec(line);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      items.push({ level, text, slug: slugify(text) });
    }
  }
  return items;
};

export const initOutline = (): void => {
  const root = document.getElementById("outline")!;

  const render = (): void => {
    const s = getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    root.replaceChildren();
    if (!active || !active.content.trim()) {
      const empty = document.createElement("div");
      empty.className = "file-tree__empty";
      empty.innerHTML = "<p>No headings yet</p>";
      root.appendChild(empty);
      return;
    }
    const items = parseOutline(active.content);
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "file-tree__empty";
      empty.innerHTML = "<p>No headings yet</p>";
      root.appendChild(empty);
      return;
    }
    for (const it of items) {
      const a = document.createElement("a");
      a.className = "outline-item";
      a.dataset.level = String(it.level);
      a.href = `#${it.slug}`;
      a.textContent = it.text;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToHeading(it.text);
      });
      root.appendChild(a);
    }
  };

  subscribe(render);
  render();
};

const scrollToHeading = (text: string): void => {
  const editor = document.getElementById("editor");
  if (!editor) return;
  const heads = editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
  for (const h of Array.from(heads)) {
    if (h.textContent?.trim() === text) {
      h.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
};
