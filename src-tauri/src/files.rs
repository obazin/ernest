//! File-system primitives shared by every module that persists something:
//! documents, settings and the personal dictionary.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

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
    let temporary = directory.join(format!(".{file_name}.ernest-{}", std::process::id()));

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

/// `path` made absolute against the working directory, or unchanged when
/// that cannot be determined.
pub fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_round_trips_text_byte_for_byte() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chapter.md");
        let text = "# Title\r\n\r\nCRLF endings and ünïcödé stay untouched.\r\n";

        write_atomically(&path, text.as_bytes()).unwrap();

        assert_eq!(fs::read(&path).unwrap(), text.as_bytes());
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
}
