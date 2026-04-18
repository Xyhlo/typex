//! Pandoc integration — import/export via a bundled sidecar or system binary.
//!
//! Resolution order:
//!   1. `<exe-dir>/binaries/pandoc[.exe]`  (what `scripts/fetch-pandoc` drops in)
//!   2. `pandoc` on the user's PATH
//!
//! Commands suppress the console window on Windows so GUI launches stay clean.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn configure(cmd: &mut Command) {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
}

fn bundled_pandoc() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let name = if cfg!(windows) { "pandoc.exe" } else { "pandoc" };

    // Primary: Tauri's externalBin places the sidecar next to the main exe.
    let primary = dir.join(name);
    if primary.exists() {
        return Some(primary);
    }

    // Secondary: a `binaries/` subfolder (dev builds, alternative layouts).
    let sub = dir.join("binaries").join(name);
    if sub.exists() {
        return Some(sub);
    }

    None
}

fn system_pandoc() -> Option<PathBuf> {
    let name = if cfg!(windows) { "pandoc.exe" } else { "pandoc" };
    let mut cmd = Command::new(name);
    cmd.arg("--version");
    configure(&mut cmd);
    match cmd.output() {
        Ok(out) if out.status.success() => Some(PathBuf::from(name)),
        _ => None,
    }
}

fn find_pandoc() -> Option<PathBuf> {
    bundled_pandoc().or_else(system_pandoc)
}

/// Returns the first line of `pandoc --version`, or None if pandoc is unavailable.
#[tauri::command]
pub async fn pandoc_version() -> Option<String> {
    let bin = find_pandoc()?;
    let mut cmd = Command::new(&bin);
    cmd.arg("--version");
    configure(&mut cmd);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(|s| s.trim().to_string())
}

/// Read a file (any pandoc-supported format) and return it as GFM Markdown.
#[tauri::command]
pub async fn pandoc_convert_from_file(
    input_path: String,
    from_format: Option<String>,
) -> Result<String, String> {
    let bin = find_pandoc().ok_or_else(|| "Pandoc is not installed or not on PATH".to_string())?;

    let mut cmd = Command::new(&bin);
    cmd.arg(&input_path);
    cmd.arg("-t").arg("gfm");
    cmd.arg("--wrap=none");
    cmd.arg("--extract-media=./media");
    if let Some(from) = from_format.as_deref() {
        if !from.is_empty() {
            cmd.arg("-f").arg(from);
        }
    }
    configure(&mut cmd);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to launch pandoc: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err.trim().is_empty() {
            format!("pandoc exited with status {}", output.status)
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Write `markdown` to `output_path` converted into `to_format` by pandoc.
#[tauri::command]
pub async fn pandoc_convert_to_file(
    markdown: String,
    to_format: String,
    output_path: String,
) -> Result<(), String> {
    let bin = find_pandoc().ok_or_else(|| "Pandoc is not installed or not on PATH".to_string())?;

    let mut cmd = Command::new(&bin);
    cmd.arg("-f").arg("gfm");
    cmd.arg("-t").arg(&to_format);
    cmd.arg("-o").arg(&output_path);

    // Formats that benefit from --standalone so they get proper headers/structure
    let needs_standalone = matches!(
        to_format.as_str(),
        "docx"
            | "odt"
            | "rtf"
            | "epub"
            | "epub2"
            | "epub3"
            | "html"
            | "html5"
            | "html4"
            | "latex"
            | "beamer"
            | "man"
            | "ms"
    );
    if needs_standalone {
        cmd.arg("--standalone");
    }

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to launch pandoc: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(markdown.as_bytes())
            .map_err(|e| format!("Failed to write to pandoc stdin: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed waiting on pandoc: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err.trim().is_empty() {
            format!("pandoc exited with status {}", output.status)
        } else {
            err
        });
    }
    Ok(())
}
