import {
  closeAll,
  isMenuOpen,
  openMenu,
  type MenuEntry,
  type MenuItemDef,
} from "./menu";

export interface MenuGroup {
  id: string;
  label: string;
  accessKey?: string;
  /** Function producing fresh entries each time it's opened (for dynamic items like Recent). */
  build: () => MenuEntry[];
}

export interface MenubarController {
  render: () => void;
  openById: (id: string) => void;
  closeAll: () => void;
  /** Rebuild the visible dropdown if one is open (e.g., after state change). */
  refresh: () => void;
  setGroups: (groups: MenuGroup[]) => void;
}

export const createMenubar = (
  container: HTMLElement,
): MenubarController => {
  let groups: MenuGroup[] = [];
  let activeGroupId: string | null = null;

  const render = (): void => {
    container.replaceChildren();
    groups.forEach((g) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "menubar__btn";
      btn.dataset.menuId = g.id;
      btn.innerHTML = formatLabel(g.label, g.accessKey);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (activeGroupId === g.id) {
          closeAll();
          return;
        }
        openById(g.id);
      });
      btn.addEventListener("mouseenter", () => {
        // Only "traverse" to other menu groups when one is already open
        if (isMenuOpen() && activeGroupId !== g.id) {
          openById(g.id);
        }
      });
      container.appendChild(btn);
    });
  };

  const openById = (id: string): void => {
    const group = groups.find((g) => g.id === id);
    if (!group) return;
    const btn = container.querySelector<HTMLElement>(
      `[data-menu-id="${id}"]`,
    );
    if (!btn) return;

    closeAll();
    highlight(id);

    openMenu({
      anchor: btn.getBoundingClientRect(),
      placement: "below",
      items: group.build(),
      onClose: () => {
        activeGroupId = null;
        highlight(null);
      },
    });
    activeGroupId = id;
  };

  const refresh = (): void => {
    if (activeGroupId) openById(activeGroupId);
  };

  const highlight = (id: string | null): void => {
    container.querySelectorAll<HTMLElement>("[data-menu-id]").forEach((el) => {
      el.classList.toggle("is-open", el.dataset.menuId === id);
    });
  };

  const setGroups = (next: MenuGroup[]): void => {
    groups = next;
    render();
  };

  // Arrow-key navigation across the menubar when a menu is open
  window.addEventListener(
    "keydown",
    (e) => {
      if (!isMenuOpen()) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Only intercept when the top-most menu is from this bar (not a submenu)
      // Heuristic: if active group is set and there's only one menu visible on screen.
      if (!activeGroupId) return;
      const idx = groups.findIndex((g) => g.id === activeGroupId);
      if (idx < 0) return;
      // Don't handle left if a submenu is deeper
      const openMenus = document.querySelectorAll(".menu").length;
      if (e.key === "ArrowLeft" && openMenus > 1) return;
      if (e.key === "ArrowRight") {
        // open submenu if any item has is-selected + hasSubmenu — let menu handle it
        // but if no submenu, move to next menubar group
        const selected = document.querySelector<HTMLElement>(
          ".menu .menu__item.is-selected",
        );
        if (selected?.dataset.hasSubmenu === "true") return;
        e.preventDefault();
        openById(groups[(idx + 1) % groups.length].id);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        openById(groups[(idx - 1 + groups.length) % groups.length].id);
      }
    },
    true,
  );

  // Alt-accelerators: Alt+F, Alt+E, etc.
  window.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key.length !== 1) return;
    const match = groups.find(
      (g) => g.accessKey?.toLowerCase() === key,
    );
    if (match) {
      e.preventDefault();
      openById(match.id);
    }
  });

  return {
    render,
    openById,
    closeAll: () => closeAll(),
    refresh,
    setGroups,
  };
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
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export type { MenuItemDef, MenuEntry };
