use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{Error, Result};

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

/// The file named on the command line (`hemingway notes.md`), if any. The
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

/// Writes through a temporary sibling and renames it over the target, so a
/// crash or full disk mid-write leaves the previous version intact rather
/// than a truncated file. Symlinks are resolved first so the link itself
/// survives, and the original permissions are carried over.
pub fn write_atomically(path: &Path, contents: &[u8]) -> Result<()> {
    let target = fs::canonicalize(path).unwrap_or_else(|_| absolute(path));
    let directory = target.parent().unwrap_or(Path::new("."));
    let file_name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temporary = directory.join(format!(".{file_name}.hemingway-{}", std::process::id()));

    let result = (|| {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        if let Ok(metadata) = fs::metadata(&target) {
            fs::set_permissions(&temporary, metadata.permissions())?;
        }
        fs::rename(&temporary, &target)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(Error::io(target))
}

fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_round_trips_text_byte_for_byte() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chapter.md");
        let text = "# Title\r\n\r\nCRLF endings and ünïcödé stay untouched.\r\n";

        write_atomically(&path, text.as_bytes()).unwrap();

        assert_eq!(read(&path).unwrap().text, text);
    }

    #[test]
    fn write_replaces_existing_contents_and_leaves_no_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.txt");
        fs::write(&path, "a much longer first draft").unwrap();

        write_atomically(&path, b"short").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "short");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn write_through_a_symlink_keeps_the_link() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("real.md");
        let link = directory.path().join("link.md");
        fs::write(&target, "before").unwrap();
        std::os::unix::fs::symlink(&target, &link).unwrap();

        write_atomically(&link, b"after").unwrap();

        assert!(
            fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(fs::read_to_string(&target).unwrap(), "after");
    }

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
