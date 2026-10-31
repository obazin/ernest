use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State, Window};
use tauri_plugin_dialog::DialogExt;

use crate::access::{DocumentAccess, TEXT_EXTENSIONS};
use crate::error::{Error, Result};
use crate::files::{absolute, write_atomically};

#[derive(Debug, Serialize)]
pub struct Document {
    /// Absolute path, so the title and later writes do not depend on the
    /// working directory the app was launched from.
    pub path: PathBuf,
    pub text: String,
    /// False when the path names a file that does not exist yet: the writer
    /// gets an empty document under that name, created on first write.
    pub exists: bool,
}

/// Reads a granted path or a text document by name (`access.rs`).
#[tauri::command]
pub async fn read_document(access: State<'_, DocumentAccess>, path: PathBuf) -> Result<Document> {
    let target = access.check(&path)?;
    Ok(Document {
        // The name the writer used, so a symlink keeps its own title.
        path: absolute(&path),
        ..read(&target)?
    })
}

/// Writes a granted path or a text document by name (`access.rs`).
#[tauri::command]
pub async fn write_document(
    access: State<'_, DocumentAccess>,
    path: PathBuf,
    text: String,
) -> Result<PathBuf> {
    let target = access.check(&path)?;
    write_atomically(&target, text.as_bytes())?;
    Ok(absolute(&path))
}

/// The file named on the command line (`ernest notes.md`), if any, granted
/// since the writer named it. The file does not have to exist yet: like
/// `vim new.md`, the first write creates it.
#[tauri::command]
pub fn initial_document_path(access: State<'_, DocumentAccess>) -> Option<PathBuf> {
    let path = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        // macOS passes `-psn_…` process serial numbers to apps opened from Finder.
        .find(|argument| !argument.to_string_lossy().starts_with('-'))
        .map(|path| absolute(&path))?;
    access.grant(&path);
    Some(path)
}

/// Asks the writer for a file to open and grants it. The dialog runs here
/// rather than in the webview so the webview cannot claim a choice the
/// writer never made.
#[tauri::command]
pub async fn choose_document_to_open(
    app: AppHandle,
    window: Window,
    access: State<'_, DocumentAccess>,
) -> Result<Option<PathBuf>> {
    let chosen = app
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Text", TEXT_EXTENSIONS)
        .add_filter("All files", &["*"])
        .blocking_pick_file()
        .and_then(|file| file.into_path().ok());
    Ok(grant_chosen(&access, chosen))
}

/// Asks the writer where to save and grants the answer. `current`, the
/// document's path if it has one, only seeds the dialog's folder and name,
/// and only when the webview may already write it: otherwise a compromised
/// webview could offer `~/.zshrc` to a hasty Enter.
#[tauri::command]
pub async fn choose_document_to_save(
    app: AppHandle,
    window: Window,
    access: State<'_, DocumentAccess>,
    current: Option<PathBuf>,
) -> Result<Option<PathBuf>> {
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Text", TEXT_EXTENSIONS)
        .add_filter("All files", &["*"]);
    let current = current.filter(|path| access.check(path).is_ok());
    match current
        .as_deref()
        .map(|path| (path.parent(), path.file_name()))
    {
        Some((Some(directory), Some(name))) => {
            dialog = dialog
                .set_directory(directory)
                .set_file_name(name.to_string_lossy());
        }
        _ => dialog = dialog.set_file_name("Untitled.md"),
    }
    let chosen = dialog
        .blocking_save_file()
        .and_then(|file| file.into_path().ok());
    Ok(grant_chosen(&access, chosen))
}

fn grant_chosen(access: &DocumentAccess, chosen: Option<PathBuf>) -> Option<PathBuf> {
    let path = absolute(&chosen?);
    access.grant(&path);
    Some(path)
}

pub fn read(path: &Path) -> Result<Document> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Document {
                path: absolute(path),
                text: String::new(),
                exists: false,
            });
        }
        Err(error) => return Err(Error::io(path)(error)),
    };
    let text = String::from_utf8(bytes).map_err(|_| Error::NotText(path.to_path_buf()))?;
    Ok(Document {
        path: absolute(path),
        text,
        exists: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reading_a_missing_file_gives_an_empty_new_document() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("not-yet-written.md");

        let document = read(&path).unwrap();

        assert!(!document.exists);
        assert_eq!(document.text, "");
        assert_eq!(document.path, path);
    }

    #[test]
    fn reading_binary_data_is_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("image.png");
        fs::write(&path, [0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]).unwrap();

        assert!(matches!(read(&path), Err(Error::NotText(_))));
    }
}
