//! Shell-out git integration — Wave 1 of Phase 2.
//!
//! Uses the user's system `git` binary. This is deliberately simple: for
//! read-only status-bar data, shell-out is fast enough and matches what the
//! user already has configured (credentials, signing, filters). Wave 2 will
//! introduce `git2-rs` for speed-critical paths like live gutter diffs.
//!
//! Commands suppress the console window on Windows so GUI launches stay clean.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn configure(cmd: &mut Command) {
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Deny stdin: a GUI has no terminal to type credentials into.
        .stdin(Stdio::null())
        // Fail fast instead of prompting — the user's credential helper (if
        // configured) still works because helpers don't read stdin.
        .env("GIT_TERMINAL_PROMPT", "0")
        // Git Credential Manager on Windows otherwise pops a native dialog
        // even when no terminal prompt is allowed. Disable interactivity.
        .env("GCM_INTERACTIVE", "Never")
        // SSH ASKPASS would otherwise try to spawn a GUI helper for pass-
        // phrases. Never is the right posture for a GUI-less git surface.
        .env("SSH_ASKPASS_REQUIRE", "never");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
}

/// Run `git` in `cwd` with the given args. Returns stdout on success,
/// Err(stderr) on failure, Err("git-missing") if the binary can't be spawned.
fn run_git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    configure(&mut cmd);
    cmd.current_dir(cwd).args(args);
    let output = cmd
        .output()
        .map_err(|e| format!("git-missing: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Maximum ancestor count we'll walk looking for `.git`. Caps the time spent
/// on pathological inputs (dead network shares, deeply-nested trees).
const MAX_REPO_WALK_DEPTH: usize = 40;

/// Walk up from `start` looking for `.git`. Returns the directory containing
/// `.git` if found. Used so a file opened from a subdirectory still surfaces
/// repo status for the enclosing repo.
fn find_repo_root(start: &Path) -> Option<PathBuf> {
    let mut cur = if start.is_file() {
        start.parent()?.to_path_buf()
    } else {
        start.to_path_buf()
    };
    for _ in 0..MAX_REPO_WALK_DEPTH {
        let dot_git = cur.join(".git");
        if dot_git.exists() {
            return Some(cur);
        }
        match cur.parent() {
            Some(p) => cur = p.to_path_buf(),
            None => return None,
        }
    }
    None
}

#[derive(Serialize, Clone, Debug)]
pub struct GitStatus {
    pub is_repo: bool,
    pub root: Option<String>,
    pub branch: Option<String>,
    /// `true` when there are zero uncommitted changes (staged + unstaged + untracked).
    pub clean: bool,
    /// Number of files with changes (staged + unstaged + untracked).
    pub dirty_count: u32,
    /// Commits this branch is ahead of its upstream. None if no upstream.
    pub ahead: Option<u32>,
    /// Commits this branch is behind its upstream. None if no upstream.
    pub behind: Option<u32>,
    /// `true` when the repo is in the middle of a merge/rebase/cherry-pick/etc.
    pub in_progress: bool,
    /// `true` when HEAD is detached.
    pub detached: bool,
    /// `true` when the branch's upstream was deleted (`[gone]`).
    pub upstream_gone: bool,
    /// `true` when the repo has no commits yet (fresh `git init`).
    pub initial_commit: bool,
    /// Error hint if git is missing or the repo is broken. Non-fatal for UI.
    pub error: Option<String>,
}

impl GitStatus {
    fn not_a_repo() -> Self {
        Self {
            is_repo: false,
            root: None,
            branch: None,
            clean: true,
            dirty_count: 0,
            ahead: None,
            behind: None,
            in_progress: false,
            detached: false,
            upstream_gone: false,
            initial_commit: false,
            error: None,
        }
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
struct HeaderParse {
    branch: Option<String>,
    ahead: Option<u32>,
    behind: Option<u32>,
    detached: bool,
    upstream_gone: bool,
    initial_commit: bool,
}

/// Parse the first line of `git status --porcelain=v1 -b`:
///   `## main...origin/main [ahead 2, behind 1]`
///   `## HEAD (no branch)`                        <- detached
///   `## main`                                    <- no upstream
///   `## main...origin/main [gone]`               <- upstream deleted
///   `## No commits yet on main`                  <- fresh git init
fn parse_status_header(line: &str) -> HeaderParse {
    let rest = line.strip_prefix("## ").unwrap_or(line);

    if rest.starts_with("HEAD (no branch)") {
        return HeaderParse {
            detached: true,
            ..HeaderParse::default()
        };
    }
    if let Some(rest_after) = rest.strip_prefix("No commits yet on ") {
        let branch = rest_after.trim().to_string();
        return HeaderParse {
            branch: if branch.is_empty() { None } else { Some(branch) },
            initial_commit: true,
            ..HeaderParse::default()
        };
    }

    // `branch...upstream [ahead X, behind Y]` or `branch...upstream [gone]`
    let mut branch_part = rest;
    let mut bracket_part: Option<&str> = None;
    if let Some(idx) = rest.find('[') {
        branch_part = &rest[..idx];
        if let Some(end) = rest[idx..].find(']') {
            bracket_part = Some(&rest[idx + 1..idx + end]);
        }
    }
    let branch_only = branch_part
        .split("...")
        .next()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let has_upstream = branch_part.contains("...");
    let mut ahead = None;
    let mut behind = None;
    let mut upstream_gone = false;

    if let Some(ab) = bracket_part {
        let trimmed = ab.trim();
        if trimmed == "gone" {
            upstream_gone = true;
        } else {
            for chunk in ab.split(',') {
                let c = chunk.trim();
                if let Some(n) = c.strip_prefix("ahead ") {
                    ahead = n.parse().ok();
                } else if let Some(n) = c.strip_prefix("behind ") {
                    behind = n.parse().ok();
                }
            }
            // If we parsed at least one of ahead/behind, default the other to 0.
            if ahead.is_some() || behind.is_some() {
                ahead.get_or_insert(0);
                behind.get_or_insert(0);
            }
        }
    } else if has_upstream {
        // `## main...origin/main` with no bracket = in sync.
        ahead = Some(0);
        behind = Some(0);
    }

    HeaderParse {
        branch: branch_only,
        ahead,
        behind,
        detached: false,
        upstream_gone,
        initial_commit: false,
    }
}

/// Detect whether a merge/rebase/cherry-pick/bisect is in progress.
fn operation_in_progress(git_dir: &Path) -> bool {
    [
        "MERGE_HEAD",
        "rebase-apply",
        "rebase-merge",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "BISECT_LOG",
    ]
    .iter()
    .any(|p| git_dir.join(p).exists())
}

#[tauri::command]
pub async fn git_is_repo(path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        find_repo_root(Path::new(&path)).is_some()
    })
    .await
    .unwrap_or(false)
}

fn git_status_blocking(path: String) -> GitStatus {
    let start = Path::new(&path);
    let root = match find_repo_root(start) {
        Some(r) => r,
        None => return GitStatus::not_a_repo(),
    };

    let mut status = GitStatus {
        is_repo: true,
        root: Some(root.to_string_lossy().into_owned()),
        branch: None,
        clean: true,
        dirty_count: 0,
        ahead: None,
        behind: None,
        in_progress: operation_in_progress(&root.join(".git")),
        detached: false,
        upstream_gone: false,
        initial_commit: false,
        error: None,
    };

    // `git status --porcelain=v1 -b` gives us branch, upstream, and file list
    // in a single call.
    match run_git(&root, &["status", "--porcelain=v1", "-b", "--"]) {
        Ok(out) => {
            let mut lines = out.lines();
            if let Some(first) = lines.next() {
                let p = parse_status_header(first);
                status.branch = p.branch;
                status.ahead = p.ahead;
                status.behind = p.behind;
                status.detached = p.detached;
                status.upstream_gone = p.upstream_gone;
                status.initial_commit = p.initial_commit;
            }
            let remaining: Vec<&str> = lines.collect();
            status.dirty_count = remaining.len() as u32;
            status.clean = remaining.is_empty();
        }
        Err(e) => {
            status.error = Some(e);
        }
    }

    status
}

#[tauri::command]
pub async fn git_status(path: String) -> GitStatus {
    tauri::async_runtime::spawn_blocking(move || git_status_blocking(path))
        .await
        .unwrap_or_else(|_| GitStatus::not_a_repo())
}

#[derive(Serialize, Clone, Debug)]
pub struct GitCommit {
    pub hash: String,
    pub short: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub subject: String,
}

fn git_log_recent_blocking(path: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    let start = Path::new(&path);
    let root = find_repo_root(start).ok_or_else(|| "not-a-repo".to_string())?;
    let n = limit.unwrap_or(20).min(500);
    // Record separator `\x1f` between fields and `\x1e` between commits so
    // subjects containing tabs or pipes survive intact.
    let fmt = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e";
    let n_arg = format!("-n{n}");
    let fmt_arg = format!("--pretty=format:{fmt}");
    let out = run_git(&root, &["log", &n_arg, &fmt_arg, "--"])?;
    let mut commits = Vec::new();
    for entry in out.split('\x1e') {
        let trimmed = entry.trim_start_matches('\n');
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split('\x1f').collect();
        if parts.len() < 6 {
            continue;
        }
        commits.push(GitCommit {
            hash: parts[0].to_string(),
            short: parts[1].to_string(),
            author: parts[2].to_string(),
            email: parts[3].to_string(),
            date: parts[4].to_string(),
            subject: parts[5].to_string(),
        });
    }
    Ok(commits)
}

/// Recent commits on HEAD. Returns at most `limit` entries.
#[tauri::command]
pub async fn git_log_recent(
    path: String,
    limit: Option<u32>,
) -> Result<Vec<GitCommit>, String> {
    tauri::async_runtime::spawn_blocking(move || git_log_recent_blocking(path, limit))
        .await
        .unwrap_or_else(|_| Err("blocking task failed".to_string()))
}

/* ============================================================
   File diff vs HEAD — for gutter decoration.
   ============================================================ */

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct LineChange {
    /// 1-indexed line number in the current (working-tree) file.
    pub line: u32,
    /// "added" (line is new), "modified" (line is different from HEAD),
    /// "removed-above" (one or more lines were deleted immediately above this one).
    pub kind: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct FileDiff {
    pub in_repo: bool,
    pub tracked: bool,
    pub changes: Vec<LineChange>,
}

impl FileDiff {
    fn not_in_repo() -> Self {
        Self {
            in_repo: false,
            tracked: false,
            changes: vec![],
        }
    }
}

/// Parse a unified diff produced by `git diff HEAD -- <file>` into line-level
/// changes on the *new* file (the working-tree side).
///
/// Rules:
///   - A block of `+` lines with no preceding `-` block → each new line = added
///   - A block of `+` lines preceded by a `-` block → the overlapping new lines
///     are "modified"; any extra `+` lines past the overlap are "added"
///   - A `-` block with no following `+` → emit "removed-above" at the next
///     context line's new-line-no (or at the final line if the hunk ends)
pub fn parse_unified_diff(diff: &str) -> Vec<LineChange> {
    let mut out = Vec::new();
    let mut new_line: u32 = 0;
    // Buffered minus/plus runs within a hunk.
    let mut minus_count: u32 = 0;
    let mut pending_plus_start: Option<u32> = None;
    let mut pending_plus_count: u32 = 0;

    fn flush(
        out: &mut Vec<LineChange>,
        minus_count: &mut u32,
        pending_plus_start: &mut Option<u32>,
        pending_plus_count: &mut u32,
        marker: u32,
    ) {
        if let Some(start) = *pending_plus_start {
            let overlap = (*minus_count).min(*pending_plus_count);
            for i in 0..overlap {
                out.push(LineChange {
                    line: start + i,
                    kind: "modified".to_string(),
                });
            }
            for i in overlap..*pending_plus_count {
                out.push(LineChange {
                    line: start + i,
                    kind: "added".to_string(),
                });
            }
        } else if *minus_count > 0 {
            out.push(LineChange {
                line: marker.max(1),
                kind: "removed-above".to_string(),
            });
        }
        *minus_count = 0;
        *pending_plus_start = None;
        *pending_plus_count = 0;
    }

    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("@@ ") {
            // Flush the previous hunk's pending run at its final new_line cursor.
            flush(
                &mut out,
                &mut minus_count,
                &mut pending_plus_start,
                &mut pending_plus_count,
                new_line,
            );
            // Parse "-OLD[,LEN] +NEW[,LEN] @@"
            // We need NEWSTART.
            if let Some(plus_idx) = rest.find('+') {
                let plus_part = &rest[plus_idx + 1..];
                let end = plus_part.find(' ').unwrap_or(plus_part.len());
                let spec = &plus_part[..end];
                let start_str = spec.split(',').next().unwrap_or("0");
                new_line = start_str.parse().unwrap_or(0);
            }
            continue;
        }
        if line.starts_with("diff --git")
            || line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("new file")
            || line.starts_with("deleted file")
            || line.starts_with("similarity ")
            || line.starts_with("rename ")
            || line.starts_with("\\ No newline")
        {
            continue;
        }
        match line.chars().next() {
            Some('+') => {
                if pending_plus_start.is_none() {
                    pending_plus_start = Some(new_line);
                }
                pending_plus_count += 1;
                new_line += 1;
            }
            Some('-') => {
                // If we were in a + block, flush it first; the next minus
                // line starts a fresh "delete-before" run.
                if pending_plus_start.is_some() {
                    flush(
                        &mut out,
                        &mut minus_count,
                        &mut pending_plus_start,
                        &mut pending_plus_count,
                        new_line,
                    );
                }
                minus_count += 1;
                // No new_line advance — deleted lines aren't in the new file.
            }
            Some(' ') | None => {
                // Context. Flush any pending run at the new_line cursor (the
                // "next new line" is exactly new_line before we advance).
                flush(
                    &mut out,
                    &mut minus_count,
                    &mut pending_plus_start,
                    &mut pending_plus_count,
                    new_line,
                );
                new_line += 1;
            }
            _ => {}
        }
    }
    // End-of-diff flush at the current cursor.
    flush(
        &mut out,
        &mut minus_count,
        &mut pending_plus_start,
        &mut pending_plus_count,
        new_line,
    );
    out
}

/// Treat the whole file as "added" (used for both untracked files and files
/// in repos that have no HEAD yet).
fn all_added(p: &Path) -> Vec<LineChange> {
    let content = std::fs::read_to_string(p).unwrap_or_default();
    (1..=(content.lines().count() as u32))
        .map(|line| LineChange {
            line,
            kind: "added".to_string(),
        })
        .collect()
}

fn git_diff_file_blocking(file_path: String) -> FileDiff {
    let p = Path::new(&file_path);
    let root = match find_repo_root(p) {
        Some(r) => r,
        None => return FileDiff::not_in_repo(),
    };

    // On a fresh `git init` with no commits, HEAD doesn't exist yet, so
    // `git diff HEAD` would fail with "unknown revision". Fall through to
    // "all added" so the gutter still highlights new content.
    let has_head = run_git(&root, &["rev-parse", "--verify", "HEAD"]).is_ok();
    if !has_head {
        return FileDiff {
            in_repo: true,
            tracked: false,
            changes: all_added(p),
        };
    }

    // Ask git to produce a diff for this specific pathspec. If the file isn't
    // tracked, `git diff` emits nothing — detect that and treat the whole
    // file as "added". Note: files marked intent-to-add (`git add -N`) show up
    // as tracked here, but `git diff HEAD` will emit a "new file" diff for
    // them — the parser handles that correctly (every line shows as `+`).
    let ls_files = run_git(
        &root,
        &["ls-files", "--error-unmatch", "--", &file_path],
    );
    let tracked = ls_files.is_ok();

    if !tracked {
        return FileDiff {
            in_repo: true,
            tracked: false,
            changes: all_added(p),
        };
    }

    let out = run_git(
        &root,
        &[
            "diff",
            "--no-color",
            "--unified=0",
            "HEAD",
            "--",
            &file_path,
        ],
    )
    .unwrap_or_default();

    FileDiff {
        in_repo: true,
        tracked: true,
        changes: parse_unified_diff(&out),
    }
}

#[tauri::command]
pub async fn git_diff_file(file_path: String) -> FileDiff {
    tauri::async_runtime::spawn_blocking(move || git_diff_file_blocking(file_path))
        .await
        .unwrap_or_else(|_| FileDiff::not_in_repo())
}

/* ============================================================
   Blame — one line at a time, for hover tooltips.
   ============================================================ */

#[derive(Serialize, Clone, Debug, Default)]
pub struct BlameEntry {
    pub sha: String,
    pub short: String,
    pub author: String,
    pub email: String,
    /// Unix epoch seconds.
    pub time: i64,
    pub summary: String,
    /// `true` when the line is uncommitted (sha is all zeros).
    pub not_committed: bool,
}

fn parse_blame_porcelain(out: &str) -> BlameEntry {
    let mut entry = BlameEntry::default();
    for line in out.lines() {
        if entry.sha.is_empty() {
            // First line: `<sha> <orig-line> <final-line> <num-lines>`
            if let Some(sha) = line.split_whitespace().next() {
                entry.sha = sha.to_string();
                entry.short = sha.chars().take(7).collect();
                entry.not_committed = sha.chars().all(|c| c == '0');
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("author ") {
            entry.author = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("author-mail ") {
            entry.email = rest.trim_matches(|c| c == '<' || c == '>').to_string();
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            entry.time = rest.parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("summary ") {
            entry.summary = rest.to_string();
        } else if line.starts_with('\t') {
            // Actual line content — stop parsing (anything after is the next
            // requested line, but we only ask for one).
            break;
        }
    }
    entry
}

fn git_blame_line_blocking(
    file_path: String,
    line: u32,
) -> Result<BlameEntry, String> {
    if line == 0 {
        return Err("line must be >= 1".to_string());
    }
    let p = Path::new(&file_path);
    let root = find_repo_root(p).ok_or_else(|| "not-a-repo".to_string())?;
    let range = format!("{line},{line}");
    let out = run_git(
        &root,
        &["blame", "-p", "-L", &range, "--", &file_path],
    )?;
    Ok(parse_blame_porcelain(&out))
}

#[tauri::command]
pub async fn git_blame_line(
    file_path: String,
    line: u32,
) -> Result<BlameEntry, String> {
    tauri::async_runtime::spawn_blocking(move || git_blame_line_blocking(file_path, line))
        .await
        .unwrap_or_else(|_| Err("blocking task failed".to_string()))
}

/* ============================================================
   Write-side commands (Wave 4): commit / push / pull.
   ============================================================ */

#[derive(Serialize, Clone, Debug)]
pub struct CommitResult {
    pub committed: bool,
    /// Short SHA of the new commit if committed.
    pub short: Option<String>,
    /// Number of files actually included in the commit.
    pub file_count: u32,
    /// User-facing message (success summary or error detail).
    pub message: String,
}

fn git_commit_all_blocking(
    path: String,
    message: String,
) -> Result<CommitResult, String> {
    let root = find_repo_root(Path::new(&path)).ok_or_else(|| "not-a-repo".to_string())?;

    // Stage everything (new, modified, removed).
    run_git(&root, &["add", "-A", "--"])?;

    // Short-circuit if nothing to commit. Avoids a spurious error exit code.
    let status = run_git(&root, &["status", "--porcelain=v1"]).unwrap_or_default();
    if status.trim().is_empty() {
        return Ok(CommitResult {
            committed: false,
            short: None,
            file_count: 0,
            message: "Nothing to commit".to_string(),
        });
    }

    let file_count = status.lines().count() as u32;

    // Count trailing newline conservatively; message always non-empty per
    // the contract below.
    let msg = if message.trim().is_empty() {
        "Auto-commit from TypeX".to_string()
    } else {
        message
    };

    run_git(&root, &["commit", "-m", &msg, "--"])?;
    let short = run_git(&root, &["rev-parse", "--short", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string());

    Ok(CommitResult {
        committed: true,
        short,
        file_count,
        message: format!("Committed {file_count} file(s)"),
    })
}

#[tauri::command]
pub async fn git_commit_all(
    path: String,
    message: String,
) -> Result<CommitResult, String> {
    tauri::async_runtime::spawn_blocking(move || git_commit_all_blocking(path, message))
        .await
        .unwrap_or_else(|_| Err("blocking task failed".to_string()))
}

#[derive(Serialize, Clone, Debug)]
pub struct SyncResult {
    pub ok: bool,
    /// Stdout (usually "Everything up-to-date" or hash summary).
    pub stdout: String,
    /// Error/stderr on failure.
    pub stderr: String,
}

fn git_push_blocking(path: String) -> Result<SyncResult, String> {
    let root = find_repo_root(Path::new(&path)).ok_or_else(|| "not-a-repo".to_string())?;
    // Let the user's git credential helper handle auth. We don't prompt.
    let mut cmd = Command::new("git");
    configure(&mut cmd);
    cmd.current_dir(&root).args(["push"]);
    let output = cmd.output().map_err(|e| format!("git-missing: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(SyncResult {
        ok: output.status.success(),
        stdout,
        stderr,
    })
}

#[tauri::command]
pub async fn git_push(path: String) -> Result<SyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || git_push_blocking(path))
        .await
        .unwrap_or_else(|_| Err("blocking task failed".to_string()))
}

fn git_pull_blocking(path: String) -> Result<SyncResult, String> {
    let root = find_repo_root(Path::new(&path)).ok_or_else(|| "not-a-repo".to_string())?;
    // --ff-only: we don't want TypeX to create merge commits silently.
    // If the pull can't fast-forward, surface the error and let the user
    // resolve manually.
    let mut cmd = Command::new("git");
    configure(&mut cmd);
    cmd.current_dir(&root).args(["pull", "--ff-only"]);
    let output = cmd.output().map_err(|e| format!("git-missing: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(SyncResult {
        ok: output.status.success(),
        stdout,
        stderr,
    })
}

#[tauri::command]
pub async fn git_pull(path: String) -> Result<SyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || git_pull_blocking(path))
        .await
        .unwrap_or_else(|_| Err("blocking task failed".to_string()))
}

/* ============================================================
   Clone — provider-agnostic. Accepts any git URL.
   ============================================================ */

#[derive(Serialize, Clone, Debug)]
pub struct CloneResult {
    pub ok: bool,
    /// Absolute path to the cloned repo (the directory that now contains .git).
    pub path: Option<String>,
    pub stdout: String,
    pub stderr: String,
}

/// Whitelist of git URL schemes we accept. We refuse anything else at the
/// Rust boundary rather than trusting the frontend to sanitise URLs before
/// handing them to `git clone`.
///
/// Git's URL arg is a single token, so the `--` args separator does NOT
/// protect against option-like segments inside the URL itself (e.g.
/// `--upload-pack=…`). We explicitly reject whitespace and any SSH
/// short-form whose path component starts with `-`.
fn is_safe_git_url(url: &str) -> bool {
    let u = url.trim();
    if u.is_empty() {
        return false;
    }
    if u.starts_with('-') {
        return false;
    }
    // Reject any whitespace — a space-separated token like
    // `repo.git --upload-pack=evil` must not slip past.
    if u.chars().any(|c| c.is_whitespace()) {
        return false;
    }

    // SSH short form: `user@host:path`. The path after the first `:` must
    // not begin with `-`, otherwise git's remote-helper can treat it as an
    // option (e.g. `user@host:--upload-pack=evil`).
    if u.contains('@') && u.contains(':') {
        if let Some((_, path)) = u.split_once(':') {
            if path.starts_with('-') {
                return false;
            }
        }
        // Must also not contain a scheme in the user field (paranoia).
        return true;
    }

    let lower = u.to_lowercase();
    for scheme in ["https://", "http://", "git://", "ssh://", "git+ssh://"] {
        if lower.starts_with(scheme) {
            return true;
        }
    }
    false
}

fn git_clone_blocking(url: String, dest_parent: String) -> Result<CloneResult, String> {
    if !is_safe_git_url(&url) {
        return Err(format!("Unsupported URL scheme: {url}"));
    }
    let parent = Path::new(&dest_parent);
    if !parent.exists() {
        return Err(format!("Destination folder does not exist: {dest_parent}"));
    }
    if !parent.is_dir() {
        return Err(format!("Destination is not a folder: {dest_parent}"));
    }

    // Derive an explicit destination directory name. Passing it to
    // `git clone` (rather than guessing the name post-hoc) eliminates edge
    // cases around query strings, fragments, unusual URL shapes, etc.
    let dir_name = url
        .trim_end_matches('/')
        .rsplit(['/', ':'])
        .next()
        .unwrap_or("repo")
        .trim_end_matches(".git");
    let dir_name = if dir_name.is_empty() { "repo" } else { dir_name };
    let dest = parent.join(dir_name);

    let dest_str = dest.to_string_lossy().into_owned();
    let mut cmd = Command::new("git");
    configure(&mut cmd);
    // `--progress` writes progress lines to stderr; we'll capture but not
    // stream them to the UI in Wave 5. Trailing `--` defuses any URL that
    // starts with `-` (rejected above but belt-and-suspenders).
    cmd.current_dir(parent).args([
        "clone",
        "--progress",
        "--",
        &url,
        &dest_str,
    ]);
    let output = cmd
        .output()
        .map_err(|e| format!("git-missing: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Ok(CloneResult {
            ok: false,
            path: None,
            stdout,
            stderr,
        });
    }

    Ok(CloneResult {
        ok: true,
        path: Some(dest_str),
        stdout,
        stderr,
    })
}

#[tauri::command]
pub async fn git_clone(url: String, dest_parent: String) -> Result<CloneResult, String> {
    tauri::async_runtime::spawn_blocking(move || git_clone_blocking(url, dest_parent))
        .await
        .unwrap_or_else(|_| Err("blocking task failed".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tracked_with_ahead_behind() {
        let p = parse_status_header("## main...origin/main [ahead 2, behind 1]");
        assert_eq!(p.branch.as_deref(), Some("main"));
        assert_eq!(p.ahead, Some(2));
        assert_eq!(p.behind, Some(1));
        assert!(!p.detached && !p.upstream_gone && !p.initial_commit);
    }
    #[test]
    fn parses_tracked_in_sync() {
        let p = parse_status_header("## main...origin/main");
        assert_eq!(p.branch.as_deref(), Some("main"));
        assert_eq!(p.ahead, Some(0));
        assert_eq!(p.behind, Some(0));
        assert!(!p.detached && !p.upstream_gone);
    }
    #[test]
    fn parses_untracked_branch() {
        let p = parse_status_header("## main");
        assert_eq!(p.branch.as_deref(), Some("main"));
        assert_eq!(p.ahead, None);
        assert_eq!(p.behind, None);
        assert!(!p.detached);
    }
    #[test]
    fn parses_detached() {
        let p = parse_status_header("## HEAD (no branch)");
        assert_eq!(p.branch, None);
        assert_eq!(p.ahead, None);
        assert_eq!(p.behind, None);
        assert!(p.detached);
    }
    #[test]
    fn parses_ahead_only() {
        let p = parse_status_header("## main...origin/main [ahead 3]");
        assert_eq!(p.branch.as_deref(), Some("main"));
        assert_eq!(p.ahead, Some(3));
        assert_eq!(p.behind, Some(0));
    }
    #[test]
    fn parses_upstream_gone() {
        let p = parse_status_header("## main...origin/main [gone]");
        assert_eq!(p.branch.as_deref(), Some("main"));
        assert_eq!(p.ahead, None);
        assert_eq!(p.behind, None);
        assert!(p.upstream_gone);
    }
    #[test]
    fn parses_initial_commit() {
        let p = parse_status_header("## No commits yet on main");
        assert_eq!(p.branch.as_deref(), Some("main"));
        assert!(p.initial_commit);
        assert!(!p.detached);
    }
    #[test]
    fn parses_branch_with_slash() {
        let p = parse_status_header("## feature/long-branch-name...origin/feature/long-branch-name [ahead 1]");
        assert_eq!(p.branch.as_deref(), Some("feature/long-branch-name"));
        assert_eq!(p.ahead, Some(1));
    }

    // ---- unified diff parser ----

    fn find(changes: &[LineChange], line: u32, kind: &str) -> bool {
        changes.iter().any(|c| c.line == line && c.kind == kind)
    }

    #[test]
    fn diff_pure_add_counts_as_added() {
        // Added lines 5 and 6 in the new file.
        let diff = "@@ -4,0 +5,2 @@\n+new one\n+new two\n";
        let changes = parse_unified_diff(diff);
        assert!(find(&changes, 5, "added"));
        assert!(find(&changes, 6, "added"));
    }

    #[test]
    fn diff_modify_counts_as_modified() {
        // Replace 1 old line with 1 new line at line 3.
        let diff = "@@ -3 +3 @@\n-old\n+new\n";
        let changes = parse_unified_diff(diff);
        assert_eq!(changes.len(), 1);
        assert!(find(&changes, 3, "modified"));
    }

    #[test]
    fn diff_replace_with_extra_adds() {
        // 1 old line replaced by 3 new lines — 1 modified, 2 added.
        let diff = "@@ -3 +3,3 @@\n-old\n+new one\n+new two\n+new three\n";
        let changes = parse_unified_diff(diff);
        assert!(find(&changes, 3, "modified"));
        assert!(find(&changes, 4, "added"));
        assert!(find(&changes, 5, "added"));
    }

    #[test]
    fn diff_pure_deletion_marks_above() {
        // Remove lines with a context line after — removed-above marker at the
        // context line's new-line-no.
        let diff = "@@ -3,2 +2,0 @@\n-gone one\n-gone two\n";
        let changes = parse_unified_diff(diff);
        assert!(find(&changes, 2, "removed-above"));
    }

    #[test]
    fn diff_coalesced_no_context_hunk() {
        // With --unified=0, git may emit consecutive minus-then-plus runs
        // inside a single hunk. Each run should be classified independently.
        let diff = concat!(
            "@@ -3,2 +3,3 @@\n",
            "-old1\n+new1\n+new2\n",
            "-old2\n+new3\n",
        );
        let changes = parse_unified_diff(diff);
        assert!(find(&changes, 3, "modified"));
        assert!(find(&changes, 4, "added"));
        // After plus run flushes, new_line = 5; the second minus doesn't
        // advance; second plus lands at line 5 as modified.
        assert!(find(&changes, 5, "modified"));
    }

    #[test]
    fn diff_multiple_hunks() {
        let diff = concat!(
            "@@ -3 +3 @@\n-old1\n+new1\n",
            "@@ -10,0 +11,1 @@\n+added line\n",
        );
        let changes = parse_unified_diff(diff);
        assert!(find(&changes, 3, "modified"));
        assert!(find(&changes, 11, "added"));
    }

    // ---- blame porcelain parser ----

    #[test]
    fn parses_blame_basic() {
        let porcelain = concat!(
            "a1b2c3d4e5f6789012345678901234567890abcd 5 5 1\n",
            "author Jane Doe\n",
            "author-mail <jane@example.com>\n",
            "author-time 1712345678\n",
            "author-tz +0000\n",
            "summary Add heading\n",
            "previous feedbaaaa path/to/file.md\n",
            "filename path/to/file.md\n",
            "\tsome content\n",
        );
        let e = parse_blame_porcelain(porcelain);
        assert_eq!(e.sha, "a1b2c3d4e5f6789012345678901234567890abcd");
        assert_eq!(e.short, "a1b2c3d");
        assert_eq!(e.author, "Jane Doe");
        assert_eq!(e.email, "jane@example.com");
        assert_eq!(e.time, 1712345678);
        assert_eq!(e.summary, "Add heading");
        assert!(!e.not_committed);
    }

    // ---- URL safety ----

    #[test]
    fn accepts_common_git_urls() {
        assert!(is_safe_git_url("https://github.com/foo/bar.git"));
        assert!(is_safe_git_url("git@github.com:foo/bar.git"));
        assert!(is_safe_git_url("ssh://git@host.example.com/foo.git"));
        assert!(is_safe_git_url("git://git.kernel.org/pub/linux.git"));
        assert!(is_safe_git_url("http://internal.local/foo.git"));
    }

    #[test]
    fn rejects_unsafe_urls() {
        assert!(!is_safe_git_url(""));
        assert!(!is_safe_git_url("   "));
        assert!(!is_safe_git_url("javascript:alert(1)"));
        assert!(!is_safe_git_url("file:///etc/passwd"));
        assert!(!is_safe_git_url("--upload-pack=evil"));
        assert!(!is_safe_git_url("-c core.sshCommand=rm"));
    }

    #[test]
    fn rejects_whitespace_injection() {
        // A second token hidden in the "URL" must be rejected — otherwise git
        // would receive a separate argument.
        assert!(!is_safe_git_url(
            "https://github.com/foo/bar.git --upload-pack=evil"
        ));
        assert!(!is_safe_git_url("git@host:foo.git --upload-pack=evil"));
        // Interior tab / newline in the URL's path portion — also rejected.
        assert!(!is_safe_git_url("https://example.com/\trepo.git"));
        assert!(!is_safe_git_url("https://exa\nmple.com/repo.git"));
        // Trailing whitespace is fine — trim() strips it before use.
        assert!(is_safe_git_url("https://example.com/repo.git\n"));
        assert!(is_safe_git_url("  https://example.com/repo.git  "));
    }

    #[test]
    fn rejects_ssh_short_with_flag_path() {
        // Git's SSH transport helper would treat `--upload-pack=…` after the
        // colon as a remote option. Our allowlist must reject it.
        assert!(!is_safe_git_url("git@host:--upload-pack=evil"));
        assert!(!is_safe_git_url("user@host:-c core.sshCommand=rm"));
    }

    #[test]
    fn detects_uncommitted_line() {
        let porcelain = concat!(
            "0000000000000000000000000000000000000000 5 5 1\n",
            "author Not Committed Yet\n",
            "author-mail <not.committed.yet@example.com>\n",
            "author-time 1712345678\n",
            "summary Version of ...\n",
            "\tuncommitted\n",
        );
        let e = parse_blame_porcelain(porcelain);
        assert!(e.not_committed);
    }
}
