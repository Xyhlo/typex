/**
 * Right-click menu over the editor, scoped to AI tools that operate on the
 * current selection.
 *
 * Only intercepts when AI is enabled AND the user has text selected — if
 * either is false, the browser's default menu runs (copy / paste / inspect).
 * Dismissed by click-outside, Escape, scroll, or resize.
 */
import { loadPrefs } from "../session";
import { getActive } from "../ai/manager";

export interface EditorContextMenuActions {
  rewrite: () => void;
  fixGrammar: () => void;
  summarize: () => void;
  translate: () => void;
}

export interface InitEditorContextMenuOpts {
  /** Root element listened on. */
  host: HTMLElement;
  /** Returns the current selection's plain text. */
  getSelection: () => string;
  actions: EditorContextMenuActions;
}

let current: HTMLElement | null = null;

const dismiss = (): void => {
  if (!current) return;
  current.remove();
  current = null;
  window.removeEventListener("mousedown", onGlobalMouseDown, true);
  window.removeEventListener("keydown", onGlobalKeyDown, true);
  window.removeEventListener("scroll", dismiss, true);
  window.removeEventListener("resize", dismiss, true);
};

const onGlobalMouseDown = (e: MouseEvent): void => {
  if (!current) return;
  if (!current.contains(e.target as Node)) dismiss();
};

const onGlobalKeyDown = (e: KeyboardEvent): void => {
  if (e.key === "Escape") {
    e.preventDefault();
    dismiss();
  }
};

const makeItem = (
  label: string,
  subtitle: string | null,
  onClick: () => void,
): HTMLElement => {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "editor-cmenu__item";
  const title = document.createElement("span");
  title.className = "editor-cmenu__title";
  title.textContent = label;
  item.appendChild(title);
  if (subtitle) {
    const sub = document.createElement("span");
    sub.className = "editor-cmenu__sub";
    sub.textContent = subtitle;
    item.appendChild(sub);
  }
  item.addEventListener("click", () => {
    dismiss();
    // Defer so the dismiss DOM work completes before the action fires
    // (some actions focus the editor, which would fight the menu teardown).
    queueMicrotask(onClick);
  });
  return item;
};

/**
 * Turn `claude-haiku-4-5-20251001` into `claude-haiku-4.5`. Dates and pure
 * version suffixes eat screen real estate; strip them.
 */
const compactModelId = (id: string): string => {
  const noDate = id.replace(/-\d{8}$/, "");
  return noDate.replace(/-(\d+)-(\d+)(?=$|-)/, "-$1.$2");
};

const showMenu = (x: number, y: number, actions: EditorContextMenuActions): void => {
  dismiss();
  const el = document.createElement("div");
  el.className = "editor-cmenu";
  el.setAttribute("role", "menu");

  const head = document.createElement("div");
  head.className = "editor-cmenu__head";
  const headTop = document.createElement("span");
  headTop.className = "editor-cmenu__head-top";
  headTop.textContent = "AI";
  head.appendChild(headTop);

  const active = getActive();
  if (active) {
    const model = document.createElement("span");
    model.className = "editor-cmenu__head-model";
    model.textContent = `${compactModelId(active.modelId)} \u2022 ${active.providerId}`;
    head.appendChild(model);
  }
  el.appendChild(head);

  el.append(
    makeItem("Rewrite selection", "For clarity and rhythm", actions.rewrite),
    makeItem("Fix grammar", "Voice preserved", actions.fixGrammar),
    makeItem("Summarize selection", "3\u20135 sentences", actions.summarize),
    makeItem("Translate\u2026", "Pick a target language", actions.translate),
  );

  // Position off-screen first so we can measure, then pin to viewport.
  el.style.visibility = "hidden";
  el.style.left = "0px";
  el.style.top = "0px";
  document.body.appendChild(el);
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(x, vw - rect.width - 8);
  const top = Math.min(y, vh - rect.height - 8);
  el.style.left = `${Math.max(4, left)}px`;
  el.style.top = `${Math.max(4, top)}px`;
  el.style.visibility = "";

  current = el;
  window.addEventListener("mousedown", onGlobalMouseDown, true);
  window.addEventListener("keydown", onGlobalKeyDown, true);
  window.addEventListener("scroll", dismiss, true);
  window.addEventListener("resize", dismiss, true);
};

export const initEditorContextMenu = (
  opts: InitEditorContextMenuOpts,
): void => {
  opts.host.addEventListener("contextmenu", (e) => {
    const prefs = loadPrefs();
    if (!prefs.aiEnabled) return;
    if (!getActive()) return;
    const sel = opts.getSelection();
    if (!sel || !sel.trim()) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY, opts.actions);
  });
};
