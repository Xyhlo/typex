/**
 * Popup menu primitive — used by menubar dropdowns and context menus.
 * Supports items, separators, sections, checkable items, disabled items,
 * and nested submenus that open to the right on hover.
 */

export interface MenuItemDef {
  type?: "item";
  id?: string;
  label: string;
  /** Optional 1-char accelerator in the label — wrap as "<u>F</u>ile" */
  accessKey?: string;
  shortcut?: string;
  icon?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  submenu?: MenuEntry[];
  run?: () => void | Promise<void>;
}

export interface MenuSeparatorDef {
  type: "separator";
}

export interface MenuSectionDef {
  type: "section";
  label: string;
  items: MenuEntry[];
}

export type MenuEntry = MenuItemDef | MenuSeparatorDef | MenuSectionDef;

type OpenMenuHandle = {
  el: HTMLElement;
  parent: OpenMenuHandle | null;
  depth: number;
  close: () => void;
};

let openStack: OpenMenuHandle[] = [];
let globalHandlersInstalled = false;

export interface OpenMenuOpts {
  /** Anchor rect in viewport coordinates */
  anchor: DOMRect;
  /** Prefer placing below-anchor (default) or above */
  placement?: "below" | "above" | "right-of";
  items: MenuEntry[];
  /** Called after close for any reason. */
  onClose?: () => void;
}

const ensureGlobalHandlers = (): void => {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  const onDown = (e: MouseEvent): void => {
    if (!openStack.length) return;
    const target = e.target as Node;
    for (const m of openStack) {
      if (m.el.contains(target)) return;
    }
    // Also allow clicking the anchor element (menubar button handles toggle separately)
    closeAll();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (!openStack.length) return;
    const top = openStack[openStack.length - 1];
    const items = Array.from(
      top.el.querySelectorAll<HTMLElement>(".menu__item:not(.menu__item--disabled)"),
    );
    const selectedIdx = items.findIndex((el) => el.classList.contains("is-selected"));

    if (e.key === "Escape") {
      e.preventDefault();
      const last = openStack.pop();
      last?.close();
      if (openStack.length) {
        const next = openStack[openStack.length - 1];
        next.el.focus();
      } else {
        last?.close();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0) return;
      const idx = selectedIdx < 0 ? 0 : (selectedIdx + 1) % items.length;
      setSelection(items, idx);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      const idx = selectedIdx < 0 ? items.length - 1 : (selectedIdx - 1 + items.length) % items.length;
      setSelection(items, idx);
      return;
    }
    if (e.key === "ArrowLeft") {
      if (openStack.length > 1) {
        e.preventDefault();
        const last = openStack.pop();
        last?.close();
        return;
      }
      // falls through — menubar arrow handling lives there
    }
    if (e.key === "ArrowRight") {
      const selected = items[selectedIdx];
      if (selected?.dataset.hasSubmenu === "true") {
        e.preventDefault();
        selected.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      const selected = items[selectedIdx];
      if (selected) {
        e.preventDefault();
        selected.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
      return;
    }
  };

  window.addEventListener("mousedown", onDown, true);
  window.addEventListener("keydown", onKey, true);
};

const setSelection = (items: HTMLElement[], idx: number): void => {
  items.forEach((el, i) => el.classList.toggle("is-selected", i === idx));
  items[idx]?.scrollIntoView({ block: "nearest" });
};

export const closeAll = (): void => {
  while (openStack.length) {
    const m = openStack.pop()!;
    m.close();
  }
};

export const isMenuOpen = (): boolean => openStack.length > 0;

export const openMenu = (opts: OpenMenuOpts): OpenMenuHandle => {
  ensureGlobalHandlers();

  const parent = openStack[openStack.length - 1] ?? null;
  const depth = (parent?.depth ?? -1) + 1;

  const el = document.createElement("div");
  el.className = "menu";
  el.setAttribute("role", "menu");
  el.tabIndex = -1;

  renderItems(el, opts.items, () => handle);

  document.body.appendChild(el);
  positionMenu(el, opts.anchor, opts.placement ?? "below");

  const handle: OpenMenuHandle = {
    el,
    parent,
    depth,
    close: () => {
      el.remove();
      opts.onClose?.();
    },
  };
  openStack.push(handle);

  // focus first item for keyboard users that tab into it
  requestAnimationFrame(() => el.focus());

  return handle;
};

/** Close menus above this depth (inclusive). */
const closeAbove = (depth: number): void => {
  while (openStack.length && openStack[openStack.length - 1].depth >= depth) {
    const m = openStack.pop()!;
    m.close();
  }
};

const renderItems = (
  container: HTMLElement,
  entries: MenuEntry[],
  getSelfHandle: () => OpenMenuHandle,
): void => {
  container.replaceChildren();

  for (const entry of entries) {
    if ("type" in entry && entry.type === "separator") {
      const sep = document.createElement("div");
      sep.className = "menu__separator";
      container.appendChild(sep);
      continue;
    }
    if ("type" in entry && entry.type === "section") {
      const label = document.createElement("div");
      label.className = "menu__section-label";
      label.textContent = entry.label;
      container.appendChild(label);
      renderItems(container, entry.items, getSelfHandle);
      continue;
    }

    const item = entry as MenuItemDef;
    const el = document.createElement("div");
    el.className = "menu__item";
    if (item.disabled) el.classList.add("menu__item--disabled");
    if (item.checked) el.classList.add("menu__item--checked");
    if (item.submenu?.length) el.dataset.hasSubmenu = "true";
    el.setAttribute("role", "menuitem");
    el.tabIndex = -1;

    if (item.checked) {
      const check = document.createElement("span");
      check.className = "menu__check";
      check.innerHTML =
        '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8.5 6.5 12 13 4.5"/></svg>';
      el.appendChild(check);
    } else if (item.icon) {
      const ic = document.createElement("span");
      ic.className = "menu__icon";
      ic.innerHTML = item.icon;
      el.appendChild(ic);
    }

    const lbl = document.createElement("span");
    lbl.className = "menu__label";
    lbl.innerHTML = formatLabel(item.label, item.accessKey);
    el.appendChild(lbl);

    if (item.shortcut) {
      const sc = document.createElement("span");
      sc.className = "menu__shortcut";
      sc.textContent = formatShortcut(item.shortcut);
      el.appendChild(sc);
    }

    if (item.submenu?.length) {
      const arrow = document.createElement("span");
      arrow.className = "menu__submenu-arrow";
      arrow.textContent = "▸";
      el.appendChild(arrow);
    }

    const openSub = (): void => {
      const self = getSelfHandle();
      // Close deeper submenus first
      closeAbove(self.depth + 1);
      const rect = el.getBoundingClientRect();
      openMenu({
        anchor: rect,
        placement: "right-of",
        items: item.submenu!,
      });
    };

    el.addEventListener("mouseenter", () => {
      const self = getSelfHandle();
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(".menu__item"),
      );
      items.forEach((i) => i.classList.remove("is-selected"));
      el.classList.add("is-selected");
      // Close any currently-open deeper menus when moving to a non-submenu sibling
      if (!item.submenu?.length) {
        closeAbove(self.depth + 1);
      } else {
        closeAbove(self.depth + 1);
        openSub();
      }
    });

    el.addEventListener("click", async () => {
      if (item.disabled) return;
      if (item.submenu?.length) {
        openSub();
        return;
      }
      closeAll();
      try {
        await item.run?.();
      } catch (err) {
        console.error("menu item failed:", err);
      }
    });

    container.appendChild(el);
  }
};

const formatLabel = (label: string, accessKey?: string): string => {
  if (!accessKey) return escapeHtml(label);
  const idx = label.toLowerCase().indexOf(accessKey.toLowerCase());
  if (idx < 0) return escapeHtml(label);
  return (
    escapeHtml(label.slice(0, idx)) +
    "<u>" +
    escapeHtml(label.slice(idx, idx + 1)) +
    "</u>" +
    escapeHtml(label.slice(idx + 1))
  );
};

const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const isMac =
  typeof navigator !== "undefined" &&
  /mac|ipod|iphone|ipad/i.test(navigator.platform);

export const formatShortcut = (s: string): string => {
  if (isMac) {
    return s
      .replaceAll("Ctrl", "⌘")
      .replaceAll("Alt", "⌥")
      .replaceAll("Shift", "⇧")
      .replaceAll("+", "");
  }
  return s;
};

const positionMenu = (
  el: HTMLElement,
  anchor: DOMRect,
  placement: "below" | "above" | "right-of",
): void => {
  const pad = 4;
  el.style.visibility = "hidden";
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let x = 0;
  let y = 0;

  if (placement === "below") {
    x = anchor.left;
    y = anchor.bottom + 2;
    if (y + h > vh - pad) y = anchor.top - h - 2;
  } else if (placement === "above") {
    x = anchor.left;
    y = anchor.top - h - 2;
    if (y < pad) y = anchor.bottom + 2;
  } else {
    // right-of — submenu
    x = anchor.right + 2;
    y = anchor.top;
    if (x + w > vw - pad) x = anchor.left - w - 2;
    if (y + h > vh - pad) y = Math.max(pad, vh - h - pad);
  }

  if (x + w > vw - pad) x = Math.max(pad, vw - w - pad);
  if (x < pad) x = pad;

  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  el.style.visibility = "";
};
