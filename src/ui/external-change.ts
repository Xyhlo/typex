/**
 * External-change policy — wires FS watcher events to the tab/editor state.
 *
 *   - Clean tab, disk changed       → silent reload from disk.
 *   - Dirty tab, disk changed       → prompt: Keep mine / Reload.
 *   - Not-an-open-file changed      → fire onExternalChange for git/vault refresh.
 *
 * A future wave will add 3-way merge here; for now we keep the binary choice.
 */

import { onFsEvent } from "../fs/watcher";
import { readFile, pathExists, basename } from "../fs/files";
import { getState, isDirty } from "../state";
import { showModal } from "./modal";
import { toast } from "./toast";
import { recordEvent, isStreaming } from "../fs/streaming";
import { loadPrefs } from "../session";
import { onFileDeleted as onVaultFileDeleted } from "../vault/index";

interface Opts {
  /** Push disk content into tab + editor. */
  reloadTab: (
    path: string,
    diskContent: string,
    opts?: { streaming?: boolean },
  ) => Promise<void>;
  /** Called for every external change (including matched tabs). */
  onExternalChange: (path: string) => void;
}

const samePath = (a: string, b: string): boolean => {
  if (a === b) return true;
  return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
};

let conflictOpen = false;
/** Queue of conflicts waiting for the current modal to close. Keyed by path
    so re-fires for the same file coalesce instead of piling up. */
const pendingConflicts = new Map<string, { disk: string; opts: Opts }>();

const showNextConflict = (): void => {
  if (conflictOpen) return;
  const next = pendingConflicts.entries().next();
  if (next.done) return;
  const [path, { disk, opts }] = next.value;
  pendingConflicts.delete(path);
  promptConflict(path, disk, opts);
};

const promptConflict = (
  path: string,
  diskContent: string,
  opts: Opts,
): void => {
  if (conflictOpen) {
    // Queue — dedupe by path so rapid re-fires don't pile up.
    pendingConflicts.set(path, { disk: diskContent, opts });
    return;
  }
  conflictOpen = true;

  const body = document.createElement("div");
  const p1 = document.createElement("p");
  p1.textContent = `${basename(path)} was changed outside TypeX while you had unsaved edits.`;
  const p2 = document.createElement("p");
  p2.innerHTML = `Pick <strong>Keep mine</strong> to ignore the disk change (your next save overwrites it) or <strong>Reload</strong> to discard your unsaved edits and load the disk version.`;
  const p3 = document.createElement("p");
  p3.className = "external-change__path";
  p3.textContent = path;
  body.append(p1, p2, p3);

  const modal = showModal({
    title: "External change detected",
    body,
    width: 520,
    onClose: () => {
      conflictOpen = false;
      showNextConflict();
    },
    actions: [
      {
        label: "Keep mine",
        variant: "ghost",
        run: () => {
          conflictOpen = false;
          modal.close();
          showNextConflict();
        },
      },
      {
        label: "Reload from disk",
        variant: "primary",
        run: async () => {
          conflictOpen = false;
          modal.close();
          await opts.reloadTab(path, diskContent);
          showNextConflict();
        },
      },
    ],
  });
};

export const initExternalChange = (opts: Opts): void => {
  onFsEvent(async (evt) => {
    recordEvent(evt.path);
    // Always forward so git/vault can refresh regardless of whether the path
    // matches an open tab.
    opts.onExternalChange(evt.path);

    const s = getState();
    const tab = s.tabs.find((t) => t.path && samePath(t.path, evt.path));
    if (!tab || !tab.path) {
      // Not an open tab — if the event was a delete, still evict from the
      // vault index so backlinks/tags stay accurate.
      try {
        if (!(await pathExists(evt.path))) {
          onVaultFileDeleted(evt.path);
        }
      } catch {
        /* ignore */
      }
      return;
    }

    let disk = "";
    try {
      disk = await readFile(tab.path);
    } catch {
      // File may have been deleted. Distinguish "gone" from a transient error
      // so we can warn the user about open-file deletion instead of silently
      // dropping the event.
      const stillThere = await pathExists(tab.path);
      if (!stillThere) {
        toast(`${basename(tab.path)} was deleted on disk — your unsaved copy is still open`);
        // Purge the file from the vault index so its wikilink/tag entries
        // don't stay live after delete.
        onVaultFileDeleted(tab.path);
      }
      return;
    }

    // No-op if the disk matches what we last saved, or what we currently have.
    if (disk === tab.savedContent || disk === tab.content) return;

    const streaming = isStreaming(tab.path);
    const prefs = loadPrefs();

    if (!isDirty(tab)) {
      await opts.reloadTab(tab.path, disk, { streaming });
      return;
    }
    // Dirty tab + streaming + user opted in to live-reload → apply through.
    // We keep the user's unsaved edits only if they explicitly disabled
    // live-reload (in which case the old modal is the safety net).
    if (streaming && prefs.liveReload) {
      await opts.reloadTab(tab.path, disk, { streaming });
      return;
    }
    promptConflict(tab.path, disk, opts);
  });
};
