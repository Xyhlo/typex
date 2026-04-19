import { getState, setState } from "../state";

export const initSidebar = (): void => {
  const app = document.getElementById("app")!;
  const nav = document.querySelector<HTMLElement>(".sidebar__nav");
  const tabs = document.querySelectorAll<HTMLButtonElement>(".sidebar__tab");
  const panels = document.querySelectorAll<HTMLElement>(".panel");

  // ARIA: wire the tab/panel relationship.
  if (nav) nav.setAttribute("role", "tablist");
  tabs.forEach((btn) => {
    const id = btn.dataset.panel ?? "";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", `panel-${id}`);
    btn.setAttribute("aria-selected", btn.classList.contains("is-active") ? "true" : "false");
    // Accessible name from existing title attribute.
    if (btn.getAttribute("title") && !btn.getAttribute("aria-label")) {
      btn.setAttribute("aria-label", btn.getAttribute("title")!);
    }
  });
  panels.forEach((p) => {
    const id = p.dataset.panel ?? "";
    if (!p.id) p.id = `panel-${id}`;
    p.setAttribute("role", "tabpanel");
    p.setAttribute("aria-label", `${id.charAt(0).toUpperCase()}${id.slice(1)} panel`);
  });

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.panel;
      tabs.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      panels.forEach((p) =>
        p.classList.toggle("is-active", p.dataset.panel === id),
      );
    });
  });

  const sync = (): void => {
    app.dataset.sidebar = getState().sidebarCollapsed ? "collapsed" : "open";
  };
  sync();
  return;
};

export const toggleSidebar = (): void => {
  setState({ sidebarCollapsed: !getState().sidebarCollapsed });
  document.getElementById("app")!.dataset.sidebar = getState().sidebarCollapsed
    ? "collapsed"
    : "open";
};
