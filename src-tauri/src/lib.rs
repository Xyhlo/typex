use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

mod cli_runner;
mod git;
mod pandoc;
mod secrets;
mod watcher;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "TypeX",
        version: env!("CARGO_PKG_VERSION"),
    }
}

/// Fetch the file paths this process was launched with (if any).
/// Called by the frontend at boot to open files passed via "Open with…".
#[tauri::command]
fn launch_paths() -> Vec<String> {
    collect_file_args(&std::env::args().collect::<Vec<_>>())
}

/// Open Windows' Default Apps settings so the user can promote TypeX to
/// the default handler. On Win11 22H2+, passing `typedFilter=.docx` focuses
/// the dialog on a specific extension; passing nothing shows the full
/// Default Apps page. Silent no-op on non-Windows builds.
#[tauri::command]
fn open_default_apps_settings(typed_filter: Option<String>) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let uri = match typed_filter.as_deref() {
            Some(ext) if !ext.is_empty() => {
                let clean = ext.trim_start_matches('.');
                format!("ms-settings:defaultapps?typedFilter=.{}", clean)
            }
            _ => "ms-settings:defaultapps".to_string(),
        };
        // `start` is a cmd builtin, so we invoke through cmd. The empty
        // string is the window title placeholder `start` expects before
        // the URL argument.
        Command::new("cmd")
            .args(["/C", "start", "", &uri])
            .spawn()
            .map_err(|e| format!("Failed to open settings: {e}"))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        let _ = typed_filter;
        Err("Default-app settings are Windows-only.".to_string())
    }
}

/// Extract file-path arguments from argv (skipping the binary and any flags).
fn collect_file_args(argv: &[String]) -> Vec<String> {
    argv.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .cloned()
        .collect()
}

/// Forward file paths from a second instance to the running window.
fn handle_new_instance(app: &AppHandle, args: Vec<String>, _cwd: String) {
    let files = collect_file_args(&args);
    let _ = app.emit("typex://open-paths", files);

    // Bring the main window to the front so the user sees the opened file.
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(handle_new_instance));
    }

    builder
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            watcher::register(&app.handle());
            cli_runner::register(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            launch_paths,
            open_default_apps_settings,
            pandoc::pandoc_version,
            pandoc::pandoc_convert_from_file,
            pandoc::pandoc_convert_to_file,
            git::git_is_repo,
            git::git_status,
            git::git_log_recent,
            git::git_diff_file,
            git::git_blame_line,
            git::git_commit_all,
            git::git_push,
            git::git_pull,
            git::git_clone,
            watcher::fs_watch,
            watcher::fs_watch_roots,
            watcher::fs_unwatch,
            secrets::secret_set,
            secrets::secret_get,
            secrets::secret_has,
            secrets::secret_delete,
            cli_runner::cli_which,
            cli_runner::cli_version,
            cli_runner::cli_exec_stream,
            cli_runner::cli_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TypeX");
}
