use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::blocking::on_blocking_pool;
use crate::error::{Error, Result};
use crate::files::write_atomically;

/// Settings are stored as an opaque JSON object: the frontend owns their
/// schema and defaults (`src/lib/settings.ts`), so adding a setting
/// never touches the backend.
#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<Option<serde_json::Value>> {
    let path = settings_path(&app)?;
    on_blocking_pool(move || match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(serde_json::from_str(&text)?)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(Error::io(path)(error)),
    })
    .await?
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: serde_json::Value) -> Result<()> {
    let path = settings_path(&app)?;
    on_blocking_pool(move || {
        if let Some(directory) = path.parent() {
            fs::create_dir_all(directory).map_err(Error::io(directory))?;
        }
        write_atomically(&path, serde_json::to_string_pretty(&settings)?.as_bytes())
    })
    .await?
}

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("settings.json"))
}
