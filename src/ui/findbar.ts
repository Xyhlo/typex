/**
 * Find & Replace — uses the CSS Highlight API (Chromium 105+) to mark hits in
 * the editor DOM without mutating it, so ProseMirror never gets confused.
 * Replace operates on the markdown source and sets it back into the editor.
 */

export interface FindbarHandlers {
  getEditorRoot: () => HTMLElement | null;
  getContent: () => string;
  setContent: (md: string) => Promise<void>;
}

export interface FindbarController {
  open: (opts?: { replace?: boolean }) => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
}

const SUPPORTS_HIGHLIGHT = typeof CSS !== "undefined" && "highlights" in CSS;

export const createFindbar = (
  handlers: FindbarHandlers,
): FindbarController => {
  const root = document.getElementById("findbar")!;
  const input = document.getElementById("find-input") as HTMLInputElement;
  const replaceRow = document.getElementById("findbar-replace")!;
  const replaceInput = document.getElementById("replace-input") as HTMLInputElement;
  const countEl = document.getElementById("find-count")!;
  const nextBtn = document.getElementById("find-next")!;
  const prevBtn = document.getElementById("find-prev")!;
  const closeBtn = document.getElementById("find-close")!;
  const replaceOneBtn = document.getElementById("replace-one")!;
  const replaceAllBtn = document.getElementById("replace-all")!;

  let ranges: Range[] = [];
  let currentIdx = -1;

  const clear = (): void => {
    if (SUPPORTS_HIGHLIGHT) {
      CSS.highlights?.delete?.("typex-find");
      CSS.highlights?.delete?.("typex-find-current");
    }
    ranges = [];
    currentIdx = -1;
    countEl.textContent = "0 / 0";
  };

  const collectTextNodes = (host: HTMLElement): Text[] => {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const out: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) out.push(n as Text);
    return out;
  };

  const compute = (query: string): void => {
    clear();
    if (!query) return;
    const host = handlers.getEditorRoot();
    if (!host) return;
    const nodes = collectTextNodes(host);
    const lower = query.toLowerCase();
    const newRanges: Range[] = [];
    for (const node of nodes) {
      const text = node.textContent ?? "";
      if (!text) continue;
      const hay = text.toLowerCase();
      let idx = 0;
      while ((idx = hay.indexOf(lower, idx)) !== -1) {
        const r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, idx + query.length);
        newRanges.push(r);
        idx += query.length;
      }
    }
    ranges = newRanges;
    if (!ranges.length) {
      countEl.textContent = "0 / 0";
      return;
    }
    currentIdx = 0;
    apply();
    scrollToCurrent();
  };

  const apply = (): void => {
    if (!SUPPORTS_HIGHLIGHT) return;
    const all = ranges.filter((_, i) => i !== currentIdx);
    const current = currentIdx >= 0 ? [ranges[currentIdx]] : [];
    CSS.highlights.set("typex-find", new Highlight(...all));
    CSS.highlights.set("typex-find-current", new Highlight(...current));
    countEl.textContent =
      ranges.length === 0 ? "0 / 0" : `${currentIdx + 1} / ${ranges.length}`;
  };

  const scrollToCurrent = (): void => {
    if (currentIdx < 0) return;
    const r = ranges[currentIdx];
    const rect = r.getBoundingClientRect();
    const host = handlers.getEditorRoot();
    const scroller = host?.closest(".editor-host") as HTMLElement | null;
    if (!scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    if (rect.top < scrollerRect.top || rect.bottom > scrollerRect.bottom) {
      scroller.scrollBy({
        top: rect.top - scrollerRect.top - scroller.clientHeight / 3,
        behavior: "smooth",
      });
    }
  };

  const next = (): void => {
    if (!ranges.length) return;
    currentIdx = (currentIdx + 1) % ranges.length;
    apply();
    scrollToCurrent();
  };
  const prev = (): void => {
    if (!ranges.length) return;
    currentIdx = (currentIdx - 1 + ranges.length) % ranges.length;
    apply();
    scrollToCurrent();
  };

  const replaceOne = async (): Promise<void> => {
    const q = input.value;
    const r = replaceInput.value;
    if (!q) return;
    const content = handlers.getContent();
    const lower = content.toLowerCase();
    const first = lower.indexOf(q.toLowerCase());
    if (first < 0) return;
    const next = content.slice(0, first) + r + content.slice(first + q.length);
    await handlers.setContent(next);
    // recompute after content is re-rendered
    requestAnimationFrame(() => compute(q));
  };

  const replaceAll = async (): Promise<void> => {
    const q = input.value;
    const r = replaceInput.value;
    if (!q) return;
    const content = handlers.getContent();
    const regex = new RegExp(escapeRegex(q), "gi");
    const next = content.replace(regex, r);
    if (next !== content) {
      await handlers.setContent(next);
      requestAnimationFrame(() => compute(q));
    }
  };

  const open = (opts: { replace?: boolean } = {}): void => {
    root.hidden = false;
    replaceRow.hidden = !opts.replace;
    input.focus();
    input.select();
    if (input.value) compute(input.value);
  };

  const close = (): void => {
    root.hidden = true;
    replaceRow.hidden = true;
    clear();
  };

  const isOpen = (): boolean => !root.hidden;

  const toggle = (): void => (isOpen() ? close() : open());

  input.addEventListener("input", () => compute(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  replaceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void replaceOne();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  closeBtn.addEventListener("click", close);
  replaceOneBtn.addEventListener("click", () => void replaceOne());
  replaceAllBtn.addEventListener("click", () => void replaceAll());

  return { open, close, toggle, isOpen };
};

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
