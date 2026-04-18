use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

mod pandoc;

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
        .invoke_handler(tauri::generate_handler![
            app_info,
            launch_paths,
            pandoc::pandoc_version,
            pandoc::pandoc_convert_from_file,
            pandoc::pandoc_convert_to_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TypeX");
}
