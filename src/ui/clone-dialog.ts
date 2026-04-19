/**
 * Clone a git repository — modal that accepts any git URL, picks a
 * destination folder, and shells out to `git clone`.
 *
 * Wave 5 of the Phase 2 roadmap. Provider-agnostic; works with GitHub,
 * GitLab, Gitea, Bitbucket, self-hosted — anything `git clone` understands.
 * OAuth-based "sign in and browse my repos" lives in a follow-up wave.
 */

import { showModal } from "./modal";
import { openFolderDialog, isTauri } from "../fs/files";
import { gitClone } from "../git";
import { progressToast, toast } from "./toast";

interface Opts {
  /** Called after a successful clone to open the cloned repo as a workspace. */
  onCloned: (absolutePath: string) => Promise<void> | void;
}

export const showCloneDialog = (opts: Opts): void => {
  if (!isTauri()) {
    toast("Cloning is only available in the desktop app");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "clone-dialog";

  const urlField = document.createElement("div");
  urlField.className = "modal__field";
  const urlLabel = document.createElement("label");
  urlLabel.className = "modal__label";
  urlLabel.textContent = "Repository URL";
  const urlInput = document.createElement("input");
  urlInput.className = "modal__input";
  urlInput.placeholder = "https://github.com/user/repo.git";
  urlInput.autocomplete = "off";
  urlInput.spellcheck = false;
  urlField.append(urlLabel, urlInput);

  const destField = document.createElement("div");
  destField.className = "modal__field";
  const destLabel = document.createElement("label");
  destLabel.className = "modal__label";
  destLabel.textContent = "Clone into folder";
  const destRow = document.createElement("div");
  destRow.className = "clone-dialog__dest-row";
  const destDisplay = document.createElement("div");
  destDisplay.className = "clone-dialog__dest";
  destDisplay.textContent = "(choose a folder)";
  const destBtn = document.createElement("button");
  destBtn.type = "button";
  destBtn.className = "primary-btn";
  destBtn.textContent = "Browse…";
  destRow.append(destDisplay, destBtn);
  destField.append(destLabel, destRow);

  const hint = document.createElement("p");
  hint.className = "clone-dialog__hint";
  hint.textContent =
    "Supports HTTPS, SSH, and git:// URLs. Authentication uses your system git credential helper.";

  wrapper.append(urlField, destField, hint);

  let destParent: string | null = null;
  const validate = (cloneBtn: HTMLButtonElement): void => {
    const urlValid = urlInput.value.trim().length > 0;
    cloneBtn.disabled = !(urlValid && destParent);
  };

  let inFlight = false;
  const modal = showModal({
    title: "Clone a git repository",
    body: wrapper,
    width: 560,
    actions: [
      { label: "Cancel", variant: "ghost", run: () => {} },
      {
        label: "Clone",
        variant: "primary",
        run: async () => {
          if (inFlight) return;
          const url = urlInput.value.trim();
          if (!url || !destParent) return;
          inFlight = true;
          if (cloneButton) cloneButton.disabled = true;
          const progress = progressToast("Cloning…");
          try {
            const result = await gitClone(url, destParent);
            if (!result.ok) {
              progress.error(`Clone failed: ${summariseStderr(result.stderr)}`);
              inFlight = false;
              if (cloneButton) validate(cloneButton);
              return;
            }
            progress.success("Cloned");
            modal.close();
            if (result.path) {
              try {
                await opts.onCloned(result.path);
              } catch (err) {
                console.error("[clone] post-clone handler failed:", err);
                toast(
                  `Cloned but couldn't open: ${String(err).slice(0, 160)}`,
                );
              }
            }
          } catch (err) {
            progress.error(`Clone failed: ${String(err).slice(0, 160)}`);
            inFlight = false;
            if (cloneButton) validate(cloneButton);
          }
        },
      },
    ],
  });

  // Scope the query to the freshly-created modal so multiple stacked modals
  // (unlikely, but defensive) don't grab the wrong action button. We reach
  // into the modal root via `.modal-root` which `showModal` toggles visible.
  const modalRoot = document.getElementById("modal-root");
  const cloneButton = modalRoot?.querySelector<HTMLButtonElement>(
    ".modal__actions .modal__btn:last-child",
  ) ?? null;
  if (cloneButton) {
    cloneButton.disabled = true;
    urlInput.addEventListener("input", () => validate(cloneButton));
  }

  destBtn.addEventListener("click", async () => {
    const folder = await openFolderDialog();
    if (!folder) return;
    destParent = folder;
    destDisplay.textContent = folder;
    if (cloneButton) validate(cloneButton);
  });

  // Focus URL on open so the user can paste immediately.
  requestAnimationFrame(() => urlInput.focus());
};

const summariseStderr = (stderr: string): string => {
  if (!stderr) return "unknown error";
  if (stderr.includes("Authentication failed")) {
    return "authentication failed — run `git clone` once in a terminal to cache credentials";
  }
  if (stderr.includes("Repository not found") || stderr.includes("does not exist")) {
    return "repository not found (check URL and access)";
  }
  if (stderr.includes("already exists and is not an empty directory")) {
    return "destination already exists — pick an empty folder or a new subfolder";
  }
  return stderr.slice(0, 200);
};
