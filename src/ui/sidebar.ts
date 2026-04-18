import { getState, setState } from "../state";

export const initSidebar = (): void => {
  const app = document.getElementById("app")!;
  const tabs = document.querySelectorAll<HTMLButtonElement>(".sidebar__tab");
  const panels = document.querySelectorAll<HTMLElement>(".panel");

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.panel;
      tabs.forEach((b) => b.classList.toggle("is-active", b === btn));
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
