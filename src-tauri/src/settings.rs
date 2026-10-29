use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::documents::write_atomically;
use crate::error::{Error, Result};

/// Settings are stored as an opaque JSON object: the frontend owns their
/// schema and defaults (`src/lib/settings.svelte.ts`), so adding a setting
/// never touches the backend.
#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<Option<serde_json::Value>> {
    let path = settings_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(serde_json::from_str(&text)?)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(Error::io(path)(error)),
    }
}

/// The operating system's preferred languages, most preferred first, as BCP 47
/// tags (`fr-FR`). The frontend picks the spelling language from them when
/// none is stored, as on first launch; the webview's `navigator.languages`
/// cannot stand in, since WKWebView reports the app's localisation rather
/// than the system's. A panic inside the platform query answers with no
/// languages instead of leaving startup waiting for a reply.
#[tauri::command]
pub async fn system_languages() -> Vec<String> {
    std::panic::catch_unwind(|| sys_locale::get_locales().collect()).unwrap_or_default()
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: serde_json::Value) -> Result<()> {
    let path = settings_path(&app)?;
    if let Some(directory) = path.parent() {
        fs::create_dir_all(directory).map_err(Error::io(directory))?;
    }
    write_atomically(&path, serde_json::to_string_pretty(&settings)?.as_bytes())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("settings.json"))
}
