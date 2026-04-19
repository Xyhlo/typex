/**
 * Lightweight popup menu — anchored below a trigger button. Used for the
 * "Recent folders" quick-switcher in the Files panel.
 */

export interface RecentMenuItem {
  label: string;
  subtitle?: string;
  checked?: boolean;
  disabled?: boolean;
  run: () => void;
}

export interface RecentMenuOpts {
  anchor: HTMLElement;
  title?: string;
  items: RecentMenuItem[];
  emptyMessage?: string;
}

let currentClose: (() => void) | null = null;

export const showPopupMenu = (opts: RecentMenuOpts): void => {
  // Tear down any existing popup + its listeners before opening a new one.
  if (currentClose) currentClose();

  const rect = opts.anchor.getBoundingClientRect();

  const menu = document.createElement("div");
  menu.className = "popup-menu";
  menu.setAttribute("role", "menu");
  menu.style.top = `${rect.bottom + 4}px`;
  // Right-align to the anchor; clamp so the menu never starts off-screen-left.
  const rightOffset = Math.max(8, document.documentElement.clientWidth - rect.right);
  menu.style.right = `${rightOffset}px`;
  // If the right-anchored position would push `left` below 0, switch to
  // left-anchoring pinned to the viewport edge.
  const estimatedLeft = document.documentElement.clientWidth - rightOffset - 260;
  if (estimatedLeft < 8) {
    menu.style.right = "auto";
    menu.style.left = "8px";
  }

  if (opts.title) {
    const title = document.createElement("div");
    title.className = "popup-menu__title";
    title.textContent = opts.title;
    menu.appendChild(title);
  }

  if (opts.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "popup-menu__empty";
    empty.textContent = opts.emptyMessage ?? "No items";
    menu.appendChild(empty);
  } else {
    for (const it of opts.items) {
      const row = document.createElement("button");
      row.className = "popup-menu__item";
      row.type = "button";
      row.setAttribute("role", "menuitem");
      if (it.disabled) {
        row.disabled = true;
        row.classList.add("is-disabled");
      }
      if (it.checked) row.classList.add("is-checked");
      const lbl = document.createElement("span");
      lbl.className = "popup-menu__label";
      lbl.textContent = it.label;
      row.appendChild(lbl);
      if (it.subtitle) {
        const sub = document.createElement("span");
        sub.className = "popup-menu__sub";
        sub.textContent = it.subtitle;
        row.appendChild(sub);
      }
      row.addEventListener("click", () => {
        close();
        it.run();
      });
      menu.appendChild(row);
    }
  }

  document.body.appendChild(menu);

  const close = (): void => {
    menu.remove();
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onKey, true);
    if (currentClose === close) currentClose = null;
    // Return focus to the trigger so keyboard users don't land on body.
    try {
      opts.anchor.focus();
    } catch {
      /* ignore */
    }
  };
  const onDocClick = (e: MouseEvent): void => {
    const t = e.target as Node | null;
    if (!t) return close();
    if (menu.contains(t)) return;
    if (opts.anchor.contains(t)) return;
    close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };

  currentClose = close;

  // Defer registration so the click that opened us doesn't instantly close it.
  requestAnimationFrame(() => {
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey, true);
  });
};
