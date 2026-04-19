/**
 * Autosync controller — optional autocommit-on-save, autopush, and
 * autopull-on-focus. All three are off by default; users opt in via
 * Preferences.
 *
 * Wave 4 of the Phase 2 roadmap.
 *
 * Behaviour:
 *   - onAnySave(path): schedule a debounced commit if `autocommit` is on.
 *     Debounce coalesces rapid saves into a single commit.
 *   - After a successful commit, if `autopush` is on, push.
 *   - onWindowFocus(): if `autopullOnFocus` is on and the workspace is a
 *     repo, attempt a --ff-only pull. No-op if the tree is dirty.
 *
 * Errors are surfaced via toast but never interrupt editing.
 */

import { gitCommitAll, gitPush, gitPull, getGitStatus, refreshGitStatus } from "./index";
import { loadPrefs } from "../session";
import { progressToast, toast } from "../ui/toast";
import { basename } from "../fs/files";

let commitTimer: number | null = null;
let pushRetryTimer: number | null = null;
let lastCommitRepoRoot: string | null = null;
let pendingPaths = new Set<string>();
let running = false;

const PUSH_RETRY_DELAY_MS = 30_000;

const schedulePushRetry = (root: string): void => {
  if (pushRetryTimer !== null) return;
  pushRetryTimer = window.setTimeout(async () => {
    pushRetryTimer = null;
    const prefs = loadPrefs();
    if (!prefs.autopush) return;
    const status = getGitStatus();
    if (!status.is_repo || !status.root) return;
    if ((status.ahead ?? 0) <= 0) return; // nothing to push
    const push = progressToast("Retrying push…");
    const res = await gitPush(status.root);
    if (res.ok) {
      push.success("Pushed");
      void refreshGitStatus(status.root);
    } else {
      push.error(`Push failed: ${summarizeSyncError(res.stderr)}`);
      schedulePushRetry(root); // keep retrying
    }
  }, PUSH_RETRY_DELAY_MS);
};

const relTo = (root: string | null, abs: string): string => {
  if (!root) return basename(abs);
  const r = root.replace(/\\/g, "/").toLowerCase();
  const a = abs.replace(/\\/g, "/");
  const al = a.toLowerCase();
  if (al.startsWith(r + "/")) return a.slice(r.length + 1);
  if (al === r) return basename(abs);
  return basename(abs);
};

const buildMessage = (paths: Set<string>, root: string | null): string => {
  const rels = Array.from(new Set(Array.from(paths).map((p) => relTo(root, p))));
  if (rels.length === 0) return "TypeX: update";
  if (rels.length === 1) return `Update ${rels[0]}`;
  if (rels.length <= 3) return `Update ${rels.join(", ")}`;
  return `Update ${rels.length} files`;
};

const PUSH_AUTH_MARKERS = [
  "Authentication failed",
  "Access denied",
  "could not read Username",
  "terminal prompts disabled",
  "Permission denied (publickey)",
  "403 Forbidden",
];

export const summarizeSyncError = (stderr: string): string => {
  if (!stderr) return "unknown error";
  const hit = PUSH_AUTH_MARKERS.find((m) => stderr.includes(m));
  if (hit) return "credentials not configured — run `git push` once in a terminal to cache them";
  return stderr.slice(0, 160);
};

const runAutocommit = async (): Promise<void> => {
  if (running) {
    // A previous commit/push is still in flight (e.g., a slow credential
    // prompt). Re-arm the timer for a quick retry so pending saves aren't
    // silently dropped.
    if (commitTimer !== null) window.clearTimeout(commitTimer);
    commitTimer = window.setTimeout(() => {
      commitTimer = null;
      void runAutocommit();
    }, 3000);
    return;
  }
  running = true;
  try {
    const status = getGitStatus();
    if (!status.is_repo || !status.root) return;
    const prefs = loadPrefs();
    const message = buildMessage(pendingPaths, status.root);
    pendingPaths = new Set();
    lastCommitRepoRoot = status.root;

    const progress = progressToast("Autocommit…");
    try {
      const result = await gitCommitAll(status.root, message);
      if (!result.committed) {
        progress.close();
        return; // nothing to commit
      }
      progress.success(`Committed ${result.file_count} file(s)${result.short ? ` · ${result.short}` : ""}`);

      if (prefs.autopush) {
        const push = progressToast("Pushing…");
        const res = await gitPush(status.root);
        if (res.ok) push.success("Pushed");
        else {
          push.error(`Push failed: ${summarizeSyncError(res.stderr)}`);
          // Don't swallow the failure — retry in 30s so a transient
          // network hiccup or credential refresh self-heals.
          schedulePushRetry(status.root);
        }
      }

      void refreshGitStatus(status.root);
    } catch (err) {
      progress.error(`Commit failed: ${String(err).slice(0, 160)}`);
    }
  } finally {
    running = false;
  }
};

/**
 * Called after any save. If autocommit is enabled, (re)arm a debounced commit.
 */
export const onAnySave = (path: string): void => {
  const prefs = loadPrefs();
  if (!prefs.autocommit) return;
  pendingPaths.add(path);
  if (commitTimer !== null) window.clearTimeout(commitTimer);
  commitTimer = window.setTimeout(() => {
    commitTimer = null;
    void runAutocommit();
  }, prefs.autocommitDelayMs ?? 15_000);
};

/**
 * Called when the app window regains focus. Fires a --ff-only pull if
 * autopull is enabled and the tree is clean.
 */
let lastDirtyFocusSkipAt = 0;
const DIRTY_FOCUS_TOAST_COOLDOWN_MS = 60_000;

export const onWindowFocus = async (): Promise<void> => {
  const prefs = loadPrefs();
  if (!prefs.autopullOnFocus) return;
  const status = getGitStatus();
  if (!status.is_repo || !status.root) return;
  if (!status.clean) {
    // Give the user a one-off explanation instead of silently skipping. Rate
    // limit so alt-tabbing a dozen times doesn't spam.
    const now = Date.now();
    if (now - lastDirtyFocusSkipAt > DIRTY_FOCUS_TOAST_COOLDOWN_MS) {
      lastDirtyFocusSkipAt = now;
      toast("Autopull skipped — working tree has uncommitted changes");
    }
    return;
  }
  const progress = progressToast("Checking remote…");
  try {
    const res = await gitPull(status.root);
    if (res.ok) {
      if (res.stdout.includes("Already up to date")) {
        progress.close();
      } else {
        progress.success("Pulled latest");
        void refreshGitStatus(status.root);
      }
    } else {
      progress.error(`Pull failed: ${summarizeSyncError(res.stderr)}`);
    }
  } catch (err) {
    progress.error(`Pull failed: ${String(err).slice(0, 160)}`);
  }
};

/** For diagnostics / debug — expose the last autocommit target. */
export const getLastCommitRoot = (): string | null => lastCommitRepoRoot;

/**
 * Drop a pending autocommit for a specific path. Called when that path was
 * reloaded from disk — we don't want to commit the reloaded content under a
 * message built from the now-discarded local edits.
 */
export const cancelPendingCommitFor = (path: string): void => {
  pendingPaths.delete(path);
  if (pendingPaths.size === 0 && commitTimer !== null) {
    window.clearTimeout(commitTimer);
    commitTimer = null;
  }
};
