//! OS-keychain secret storage for AI provider API keys.
//!
//! Service name is `TypeX`. Each secret is keyed by (service, name).
//! On Windows this lands in Credential Manager, macOS in Keychain,
//! Linux in Secret Service via libsecret (gnome-keyring / kwallet).

use keyring::Entry;

const SERVICE: &str = "TypeX";

fn entry(name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, name).map_err(|e| format!("keyring entry error: {e}"))
}

#[tauri::command]
pub async fn secret_set(name: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let e = entry(&name)?;
        if value.is_empty() {
            // Empty = delete.
            match e.delete_credential() {
                Ok(()) => Ok(()),
                Err(keyring::Error::NoEntry) => Ok(()),
                Err(err) => Err(format!("keyring delete error: {err}")),
            }
        } else {
            e.set_password(&value).map_err(|err| format!("keyring set error: {err}"))
        }
    })
    .await
    .unwrap_or_else(|_| Err("blocking task failed".into()))
}

#[tauri::command]
pub async fn secret_get(name: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, String> {
        let e = entry(&name)?;
        match e.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(format!("keyring get error: {err}")),
        }
    })
    .await
    .unwrap_or_else(|_| Err("blocking task failed".into()))
}

#[tauri::command]
pub async fn secret_has(name: String) -> Result<bool, String> {
    let got = secret_get(name).await?;
    Ok(got.map(|s| !s.is_empty()).unwrap_or(false))
}

#[tauri::command]
pub async fn secret_delete(name: String) -> Result<(), String> {
    secret_set(name, String::new()).await
}
