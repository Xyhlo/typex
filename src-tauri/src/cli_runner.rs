//! Subprocess runner for AI CLI adapters.
//!
//! Spawns a binary with explicit arguments (never a shell string), pipes
//! an optional stdin, streams stdout line-by-line via Tauri events, and
//! reports exit. Cancellation kills the process.
//!
//! Wave 2 of Phase 4. Used by the Claude Code adapter and future
//! CLI-based providers.

use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;

#[derive(Serialize, Clone, Debug)]
pub struct CliChunk {
    pub id: String,
    pub stream: &'static str, // "stdout" | "stderr"
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CliDone {
    pub id: String,
    pub exit_code: i32,
    pub error: Option<String>,
}

pub struct CliRegistry {
    // Registered running processes, keyed by caller-supplied id.
    procs: Mutex<HashMap<String, CliHandle>>,
}

struct CliHandle {
    cancel: Option<oneshot::Sender<()>>,
}

impl Default for CliRegistry {
    fn default() -> Self {
        Self {
            procs: Mutex::new(HashMap::new()),
        }
    }
}

/// Locate a binary on PATH.
#[tauri::command]
pub async fn cli_which(name: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        which::which(&name)
            .ok()
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .unwrap_or(None)
}

/// Probe `<binary> --version` and return the first stdout line.
#[tauri::command]
pub async fn cli_version(binary: String, arg: Option<String>) -> Option<String> {
    let flag = arg.unwrap_or_else(|| "--version".to_string());
    let out = Command::new(&binary)
        .arg(&flag)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .output()
        .await
        .ok()?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let first = stdout.lines().next().unwrap_or_default().trim().to_string();
    if first.is_empty() {
        // Some CLIs print the version to stderr.
        let stderr = String::from_utf8_lossy(&out.stderr);
        let e = stderr.lines().next().unwrap_or_default().trim().to_string();
        if !e.is_empty() {
            return Some(e);
        }
    }
    if first.is_empty() {
        None
    } else {
        Some(first)
    }
}

/// Spawn a CLI, stream stdout/stderr via events, return exit via event.
///
/// Events:
///   typex://cli-chunk  — CliChunk per line on stdout or stderr
///   typex://cli-done   — CliDone on exit (or on error before start)
#[tauri::command]
pub async fn cli_exec_stream(
    app: AppHandle,
    id: String,
    binary: String,
    args: Vec<String>,
    stdin: Option<String>,
) -> Result<(), String> {
    if args.iter().any(|a| a.contains('\0')) {
        return Err("null byte in argument".into());
    }

    let mut child = Command::new(&binary)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .spawn()
        .map_err(|e| format!("spawn {binary} failed: {e}"))?;

    if let (Some(mut sin), Some(text)) = (child.stdin.take(), stdin) {
        // Write stdin asynchronously; if the write fails we still carry on
        // and let the child decide what to do.
        let _ = sin.write_all(text.as_bytes()).await;
        drop(sin);
    }

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    {
        let state: State<'_, CliRegistry> = app.state();
        let mut lock = state.procs.lock().map_err(|e| e.to_string())?;
        lock.insert(
            id.clone(),
            CliHandle {
                cancel: Some(cancel_tx),
            },
        );
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "stdout not captured".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "stderr not captured".to_string())?;

    let app_for_stdout = app.clone();
    let id_for_stdout = id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&buf).into_owned();
                    let _ = app_for_stdout.emit(
                        "typex://cli-chunk",
                        CliChunk {
                            id: id_for_stdout.clone(),
                            stream: "stdout",
                            text,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    let app_for_stderr = app.clone();
    let id_for_stderr = id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&buf).into_owned();
                    let _ = app_for_stderr.emit(
                        "typex://cli-chunk",
                        CliChunk {
                            id: id_for_stderr.clone(),
                            stream: "stderr",
                            text,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    let app_for_done = app.clone();
    let id_for_done = id.clone();
    tokio::spawn(async move {
        let code = wait_or_cancel(child, cancel_rx).await;
        // Remove from registry.
        if let Some(state) = app_for_done.try_state::<CliRegistry>() {
            if let Ok(mut lock) = state.procs.lock() {
                lock.remove(&id_for_done);
            }
        }
        let _ = app_for_done.emit(
            "typex://cli-done",
            CliDone {
                id: id_for_done,
                exit_code: code,
                error: None,
            },
        );
    });

    Ok(())
}

async fn wait_or_cancel(mut child: Child, cancel: oneshot::Receiver<()>) -> i32 {
    tokio::select! {
        status = child.wait() => {
            match status {
                Ok(s) => s.code().unwrap_or(-1),
                Err(_) => -1,
            }
        }
        _ = cancel => {
            let _ = child.kill().await;
            -2
        }
    }
}

#[tauri::command]
pub fn cli_cancel(app: AppHandle, id: String) -> Result<bool, String> {
    let state: State<'_, CliRegistry> = app.state();
    let mut lock = state.procs.lock().map_err(|e| e.to_string())?;
    if let Some(h) = lock.get_mut(&id) {
        if let Some(tx) = h.cancel.take() {
            let _ = tx.send(());
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn register(app: &AppHandle) {
    app.manage(CliRegistry::default());
}
