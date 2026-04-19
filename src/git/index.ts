/**
 * Frontend git surface — thin wrappers over the Rust Tauri commands plus a
 * reactive status cache.
 *
 * The cache exists so the status bar can render synchronously without firing
 * `git status` on every render. The app refreshes the cache on:
 *   - workspace open
 *   - file save (from inside TypeX)
 *   - manual refresh (F5 + the dedicated "git.refresh" command)
 *   - FS watcher events (added in Wave 3)
 *
 * Wave 1 is read-only. Commit/push/pull come in Wave 4.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../fs/files";

export interface GitStatus {
  is_repo: boolean;
  root: string | null;
  branch: string | null;
  clean: boolean;
  dirty_count: number;
  ahead: number | null;
  behind: number | null;
  in_progress: boolean;
  detached: boolean;
  upstream_gone: boolean;
  initial_commit: boolean;
  error: string | null;
}

export interface GitCommit {
  hash: string;
  short: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

const EMPTY: GitStatus = {
  is_repo: false,
  root: null,
  branch: null,
  clean: true,
  dirty_count: 0,
  ahead: null,
  behind: null,
  in_progress: false,
  detached: false,
  upstream_gone: false,
  initial_commit: false,
  error: null,
};

let cache: GitStatus = EMPTY;
let currentPath: string | null = null;
// Monotonic request token — guards against a slow refresh for path A clobbering
// the result of a newer refresh for path B.
let seq = 0;
type Listener = (status: GitStatus) => void;
const listeners = new Set<Listener>();

export const getGitStatus = (): GitStatus => cache;

export const subscribeGit = (fn: Listener): (() => void) => {
  listeners.add(fn);
  fn(cache);
  return () => {
    listeners.delete(fn);
  };
};

const notify = (): void => {
  for (const fn of listeners) fn(cache);
};

/**
 * Fetch git status for `path` and update the cache. If `path` is null, the
 * cache is cleared. Safe to call when not running in Tauri (no-op).
 */
export const refreshGitStatus = async (path: string | null): Promise<void> => {
  const token = ++seq;
  if (!isTauri() || !path) {
    // Don't touch currentPath in the no-op branch — keeps state consistent
    // when running in a browser dev harness.
    if (!isTauri()) return;
    currentPath = null;
    if (cache !== EMPTY) {
      cache = EMPTY;
      notify();
    }
    return;
  }
  currentPath = path;
  try {
    const next = await invoke<GitStatus>("git_status", { path });
    // Discard stale responses — a newer refresh has since been fired.
    if (token !== seq) return;
    cache = next;
    notify();
  } catch (err) {
    if (token !== seq) return;
    console.error("[git] status failed:", err);
    // On error, keep the last-good cache rather than thrashing to EMPTY.
  }
};

/** Re-fetch using whatever path was last passed to `refreshGitStatus`. */
export const refreshCurrentGitStatus = async (): Promise<void> => {
  await refreshGitStatus(currentPath);
};

export const gitLogRecent = async (
  path: string,
  limit = 20,
): Promise<GitCommit[]> => {
  if (!isTauri()) return [];
  try {
    return await invoke<GitCommit[]>("git_log_recent", { path, limit });
  } catch (err) {
    console.error("[git] log failed:", err);
    return [];
  }
};

export const gitIsRepo = async (path: string): Promise<boolean> => {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("git_is_repo", { path });
  } catch {
    return false;
  }
};

/* ========== diff-vs-HEAD + blame ========== */

export type LineChangeKind = "added" | "modified" | "removed-above";

export interface LineChange {
  line: number;
  kind: LineChangeKind;
}

export interface FileDiff {
  in_repo: boolean;
  tracked: boolean;
  changes: LineChange[];
}

const EMPTY_DIFF: FileDiff = { in_repo: false, tracked: false, changes: [] };

export const gitDiffFile = async (filePath: string): Promise<FileDiff> => {
  if (!isTauri()) return EMPTY_DIFF;
  try {
    return await invoke<FileDiff>("git_diff_file", { filePath });
  } catch (err) {
    console.error("[git] diff failed:", err);
    return EMPTY_DIFF;
  }
};

export interface BlameEntry {
  sha: string;
  short: string;
  author: string;
  email: string;
  time: number;
  summary: string;
  not_committed: boolean;
}

export const gitBlameLine = async (
  filePath: string,
  line: number,
): Promise<BlameEntry | null> => {
  if (!isTauri()) return null;
  try {
    return await invoke<BlameEntry>("git_blame_line", { filePath, line });
  } catch (err) {
    console.error("[git] blame failed:", err);
    return null;
  }
};

/* ========== commit / push / pull ========== */

export interface CommitResult {
  committed: boolean;
  short: string | null;
  file_count: number;
  message: string;
}

export interface SyncResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export const gitCommitAll = async (
  path: string,
  message: string,
): Promise<CommitResult> => {
  if (!isTauri()) {
    return { committed: false, short: null, file_count: 0, message: "Not in Tauri" };
  }
  return await invoke<CommitResult>("git_commit_all", { path, message });
};

export const gitPush = async (path: string): Promise<SyncResult> => {
  if (!isTauri()) return { ok: false, stdout: "", stderr: "Not in Tauri" };
  return await invoke<SyncResult>("git_push", { path });
};

export const gitPull = async (path: string): Promise<SyncResult> => {
  if (!isTauri()) return { ok: false, stdout: "", stderr: "Not in Tauri" };
  return await invoke<SyncResult>("git_pull", { path });
};

/* ========== clone ========== */

export interface CloneResult {
  ok: boolean;
  path: string | null;
  stdout: string;
  stderr: string;
}

export const gitClone = async (
  url: string,
  destParent: string,
): Promise<CloneResult> => {
  if (!isTauri()) {
    return { ok: false, path: null, stdout: "", stderr: "Not in Tauri" };
  }
  return await invoke<CloneResult>("git_clone", { url, destParent });
};
