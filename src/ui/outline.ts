import { getState, subscribe } from "../state";

interface OutlineItem {
  level: number;
  text: string;
  slug: string;
  index: number; // position among rendered h1–h6 in the DOM
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
  let start = 0;

  // Skip YAML frontmatter if present — otherwise a `# Title` line inside it
  // would be mistaken for a heading (it wouldn't render as one).
  if (lines.length > 0 && /^---\s*$/.test(lines[0])) {
    for (let i = 1; i < lines.length; i++) {
      if (/^---\s*$/.test(lines[i])) {
        start = i + 1;
        break;
      }
    }
  }

  let inCode = false;
  let fence: "`" | "~" | null = null;
  let index = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (inCode) {
      if (fence === "`" && trimmed.startsWith("```")) {
        inCode = false;
        fence = null;
      } else if (fence === "~" && trimmed.startsWith("~~~")) {
        inCode = false;
        fence = null;
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      inCode = true;
      fence = "`";
      continue;
    }
    if (trimmed.startsWith("~~~")) {
      inCode = true;
      fence = "~";
      continue;
    }
    const m = HEADING_RE.exec(line);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      items.push({ level, text, slug: slugify(text), index });
      index++;
    }
  }
  return items;
};

let activeObserver: IntersectionObserver | null = null;

const refreshActiveObserver = (items: OutlineItem[]): void => {
  activeObserver?.disconnect();
  activeObserver = null;

  const editor = document.getElementById("editor");
  if (!editor || items.length === 0) return;

  const initialHeads = Array.from(editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
  if (initialHeads.length === 0) return;

  const setActive = (idx: number): void => {
    const root = document.getElementById("outline");
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(".outline-item"))) {
      el.classList.toggle("is-active", Number(el.dataset.index) === idx);
    }
  };

  // The editor swaps heading DOM nodes as the user edits, so we requery fresh
  // on each callback rather than relying on the initial snapshot.
  activeObserver = new IntersectionObserver(
    (_entries) => {
      const host = document.getElementById("editor");
      if (!host) return;
      const heads = host.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
      let bestIdx = -1;
      let bestTop = -Infinity;
      for (let i = 0; i < heads.length; i++) {
        const rect = heads[i].getBoundingClientRect();
        if (rect.top < 120 && rect.top > bestTop) {
          bestTop = rect.top;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) bestIdx = 0;
      setActive(bestIdx);
    },
    { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
  );
  for (const h of initialHeads) activeObserver.observe(h);
};

const scrollToHeadingByIndex = (index: number): void => {
  const editor = document.getElementById("editor");
  if (!editor) return;
  const heads = editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
  const target = heads.item(index);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
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
      refreshActiveObserver([]);
      return;
    }
    const items = parseOutline(active.content);
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "file-tree__empty";
      empty.innerHTML = "<p>No headings yet</p>";
      root.appendChild(empty);
      refreshActiveObserver([]);
      return;
    }
    for (const it of items) {
      const a = document.createElement("a");
      a.className = "outline-item";
      a.dataset.level = String(it.level);
      a.dataset.index = String(it.index);
      a.href = `#${it.slug}`;
      a.textContent = it.text;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToHeadingByIndex(it.index);
      });
      root.appendChild(a);
    }
    // DOM for new headings takes one frame to appear after content swap.
    requestAnimationFrame(() => refreshActiveObserver(items));
  };

  subscribe(render);
  render();
};
