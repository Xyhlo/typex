import {
  getState,
  setState,
  subscribe,
  isDirty,
  nextTabId,
  nextUntitledTitle,
  type DocTab,
} from "../state";

const DEFAULT_UNTITLED_CONTENT = "";

export interface TabsController {
  openNew: () => DocTab;
  openFromFile: (args: {
    path: string;
    content: string;
    title: string;
    sourceFormat?: string | null;
    sourceExt?: string | null;
  }) => DocTab;
  closeTab: (id: string) => void;
  activate: (id: string) => void;
  render: () => void;
}

export const createTabsController = (
  strip: HTMLElement,
  onActivate: (tab: DocTab | null) => void,
): TabsController => {
  const openNew = (): DocTab => {
    const tab: DocTab = {
      id: nextTabId(),
      path: null,
      title: nextUntitledTitle(),
      content: DEFAULT_UNTITLED_CONTENT,
      savedContent: DEFAULT_UNTITLED_CONTENT,
      sourceFormat: null,
      sourceExt: null,
    };
    setState({
      tabs: [...getState().tabs, tab],
      activeTabId: tab.id,
    });
    onActivate(tab);
    return tab;
  };

  const openFromFile = ({
    path,
    content,
    title,
    sourceFormat = null,
    sourceExt = null,
  }: {
    path: string;
    content: string;
    title: string;
    sourceFormat?: string | null;
    sourceExt?: string | null;
  }): DocTab => {
    const existing = getState().tabs.find((t) => t.path === path);
    if (existing) {
      setState({ activeTabId: existing.id });
      onActivate(existing);
      return existing;
    }
    const tab: DocTab = {
      id: nextTabId(),
      path,
      title,
      content,
      savedContent: content,
      sourceFormat,
      sourceExt,
    };
    setState({
      tabs: [...getState().tabs, tab],
      activeTabId: tab.id,
    });
    onActivate(tab);
    return tab;
  };

  const closeTab = (id: string): void => {
    const s = getState();
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const remaining = s.tabs.filter((t) => t.id !== id);
    const nextActive =
      s.activeTabId === id
        ? remaining[idx] ?? remaining[idx - 1] ?? null
        : s.tabs.find((t) => t.id === s.activeTabId) ?? null;
    setState({
      tabs: remaining,
      activeTabId: nextActive?.id ?? null,
    });
    onActivate(nextActive);
  };

  const activate = (id: string): void => {
    const tab = getState().tabs.find((t) => t.id === id);
    if (!tab) return;
    setState({ activeTabId: id });
    onActivate(tab);
  };

  const render = (): void => {
    const { tabs, activeTabId } = getState();
    strip.replaceChildren();
    for (const tab of tabs) {
      const el = document.createElement("div");
      el.className = "tab" + (tab.id === activeTabId ? " is-active" : "");
      el.dataset.id = tab.id;
      el.title = tab.path ?? tab.title;

      if (isDirty(tab)) {
        const dot = document.createElement("span");
        dot.className = "tab__dirty";
        el.appendChild(dot);
      }

      const label = document.createElement("span");
      label.className = "tab__label";
      label.textContent = tab.title;
      el.appendChild(label);

      const close = document.createElement("button");
      close.className = "tab__close";
      close.setAttribute("aria-label", "Close tab");
      close.innerHTML =
        '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>';
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      el.appendChild(close);

      el.addEventListener("click", () => activate(tab.id));
      strip.appendChild(el);
    }
  };

  subscribe(render);
  render();

  return { openNew, openFromFile, closeTab, activate, render };
};
