//! Filesystem watcher — emits debounced `typex://fs-changed` events when
//! files under the watched root change externally (from another process,
//! git checkout, etc.).
//!
//! Wave 3 of the Phase 2 roadmap.
//!
//! The watcher is a process-wide singleton. Calling `fs_watch` with a new
//! path stops the old watcher and starts a fresh one. `fs_unwatch` stops
//! watching (used when the workspace is closed).

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind, Debouncer};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize, Clone, Debug)]
pub struct FsEvent {
    pub path: String,
    /// "changed" | "created" | "removed" (conservatively — debouncer-mini
    /// coalesces many kinds into "Any" + "AnyContinuous").
    pub kind: String,
}

pub struct WatcherState {
    inner: Mutex<Option<Debouncer<notify::RecommendedWatcher>>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn fs_watch(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    fs_watch_roots(app, state, vec![path])
}

/// Strip any path that is a descendant of another path in the list. Notify
/// would deliver one event per matching watch, so two nested watches cause
/// duplicate events for files in the overlap. Keep only the outermost roots.
fn prune_nested(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    for p in paths {
        let contained = paths.iter().any(|q| {
            if std::ptr::eq(p as *const _, q as *const _) {
                return false;
            }
            p.starts_with(q) && p != q
        });
        if !contained {
            out.push(p.clone());
        }
    }
    out
}

#[tauri::command]
pub fn fs_watch_roots(
    app: AppHandle,
    state: State<'_, WatcherState>,
    paths: Vec<String>,
) -> Result<(), String> {
    // Validate up-front so we don't start the debouncer with invalid roots.
    let all_roots: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    for (i, r) in all_roots.iter().enumerate() {
        if !r.exists() {
            return Err(format!("path does not exist: {}", paths[i]));
        }
    }
    // Dedupe nested roots — parent containing child gets watched once.
    let roots = prune_nested(&all_roots);

    // Drop any prior watcher first. Done under the lock so we never have two
    // active watchers emitting overlapping events.
    let mut slot = state.inner.lock().map_err(|e| e.to_string())?;
    *slot = None;

    if roots.is_empty() {
        return Ok(());
    }

    let app_handle = app.clone();
    // 80 ms debounce — tight enough that live streams (AI writes,
    // formatter-on-save chains) feel immediate, loose enough to coalesce the
    // multiple events a single save often produces.
    let mut debouncer = new_debouncer(
        Duration::from_millis(80),
        move |res: notify_debouncer_mini::DebounceEventResult| match res {
            Ok(events) => {
                for ev in events {
                    let kind = match ev.kind {
                        DebouncedEventKind::Any => "changed",
                        DebouncedEventKind::AnyContinuous => "changed",
                        _ => "changed",
                    };
                    let payload = FsEvent {
                        path: ev.path.to_string_lossy().into_owned(),
                        kind: kind.to_string(),
                    };
                    let _ = app_handle.emit("typex://fs-changed", payload);
                }
            }
            Err(e) => {
                eprintln!("[typex watcher] error: {e:?}");
            }
        },
    )
    .map_err(|e| format!("watcher init failed: {e}"))?;

    for r in &roots {
        debouncer
            .watcher()
            .watch(r, RecursiveMode::Recursive)
            .map_err(|e| format!("watch failed on {}: {e}", r.display()))?;
    }

    *slot = Some(debouncer);
    Ok(())
}

#[tauri::command]
pub fn fs_unwatch(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut slot = state.inner.lock().map_err(|e| e.to_string())?;
    *slot = None;
    Ok(())
}

/// Register watcher state with the Tauri app. Call once from `run()`.
pub fn register(app: &AppHandle) {
    app.manage(WatcherState::default());
}
