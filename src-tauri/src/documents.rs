use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

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

#[tauri::command]
pub async fn read_document(path: PathBuf) -> Result<Document> {
    read(&path)
}

#[tauri::command]
pub async fn write_document(path: PathBuf, text: String) -> Result<PathBuf> {
    write_atomically(&path, text.as_bytes())?;
    Ok(absolute(&path))
}

/// The file named on the command line (`ernest notes.md`), if any. The
/// file does not have to exist yet: like `vim new.md`, the first write
/// creates it.
#[tauri::command]
pub fn initial_document_path() -> Option<PathBuf> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        // macOS passes `-psn_…` process serial numbers to apps opened from Finder.
        .find(|argument| !argument.to_string_lossy().starts_with('-'))
        .map(|path| absolute(&path))
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
