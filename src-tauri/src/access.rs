//! Which files the webview may read and write as documents.
//!
//! A path the writer chose outside the webview (in a file dialog the backend
//! shows, or on the command line) is granted whatever its name. A path that
//! arrives from the webview alone, as `:e`, `:w` and `:sav` paths do, must be
//! a text document by name: on a local disk, outside hidden folders, with a
//! text extension, and resolving through symlinks to a file that is one too.
//! A compromised webview therefore cannot read `~/.ssh/id_ed25519`, overwrite
//! `~/.zshrc`, or make Windows contact a network share.

use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf, Prefix};
use std::sync::Mutex;

use crate::error::{Error, Result};
use crate::files::absolute;

/// The extensions a document may be opened or written under by name alone.
pub const TEXT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt", "text"];

/// Windows device names, refused as file stems on every platform alike.
const DEVICE_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// The paths granted so far, both as given (absolute) and resolved, for the
/// life of the process.
#[derive(Default)]
pub struct DocumentAccess(Mutex<HashSet<PathBuf>>);

impl DocumentAccess {
    /// Lets the webview read and write `path` from now on.
    pub fn grant(&self, path: &Path) {
        let mut granted = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        granted.insert(absolute(path));
        if let Ok(target) = fs::canonicalize(path) {
            granted.insert(target);
        }
    }

    /// The file to read or write for `path`, resolved through symlinks, when
    /// `path` was granted or is a text document by name. Callers use the
    /// returned path, so what was checked is what gets touched.
    pub fn check(&self, path: &Path) -> Result<PathBuf> {
        let given = absolute(path);
        let refused = || Error::NotPermitted(given.clone());
        let granted = |candidate: &Path| {
            self.0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .contains(candidate)
        };

        // Before touching the file system: resolving a network path is
        // itself a network request.
        if !is_on_local_disk(&given) {
            return if granted(&given) {
                Ok(given)
            } else {
                Err(refused())
            };
        }
        match fs::canonicalize(&given) {
            Ok(target) if granted(&given) || granted(&target) => Ok(target),
            Ok(target) if is_text_name(&given) && is_text_name(&target) => Ok(target),
            Err(error) if error.kind() == ErrorKind::NotFound => {
                if granted(&given) || is_text_name(&given) {
                    Ok(given)
                } else {
                    Err(refused())
                }
            }
            _ => Err(refused()),
        }
    }
}

/// An absolute path on a local drive: a Unix path from the root, or a
/// Windows path with a drive letter. UNC shares (`\\host\share`), WebDAV and
/// device paths (`\\.\pipe`) are not.
fn is_on_local_disk(path: &Path) -> bool {
    match path.components().next() {
        Some(Component::Prefix(prefix)) => {
            matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))
        }
        Some(Component::RootDir) => !cfg!(windows),
        _ => false,
    }
}

/// A text extension, no hidden folder or file on the way, and not a device.
fn is_text_name(path: &Path) -> bool {
    let hidden = path.components().any(|component| match component {
        Component::Normal(name) => name.to_string_lossy().starts_with('.'),
        _ => false,
    });
    let device = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.split('.').next())
        .is_some_and(|stem| {
            DEVICE_NAMES
                .iter()
                .any(|device| device.eq_ignore_ascii_case(stem))
        });
    let text = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            TEXT_EXTENSIONS
                .iter()
                .any(|known| known.eq_ignore_ascii_case(extension))
        });
    text && !hidden && !device
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `tempfile`'s default names start with `.`, which reads as hidden.
    fn visible_directory() -> tempfile::TempDir {
        tempfile::Builder::new().prefix("ernest").tempdir().unwrap()
    }

    fn checks(path: &Path) -> bool {
        DocumentAccess::default().check(path).is_ok()
    }

    #[test]
    fn accepts_text_documents_by_name() {
        let directory = visible_directory();
        for name in ["notes.md", "Draft.MARKDOWN", "todo.txt"] {
            assert!(checks(&directory.path().join(name)), "{name}");
        }
    }

    #[test]
    fn refuses_other_files_by_name() {
        let directory = visible_directory();
        for name in [
            "id_ed25519",
            "notes",
            "script.sh",
            "notes.md.sh",
            "page.mdx",
            "NUL.md",
        ] {
            assert!(!checks(&directory.path().join(name)), "{name}");
        }
    }

    #[test]
    fn refuses_hidden_files_and_folders_by_name() {
        let directory = visible_directory();
        assert!(!checks(&directory.path().join(".notes.md")));
        assert!(!checks(&directory.path().join(".claude").join("CLAUDE.md")));
    }

    #[test]
    fn refuses_network_paths_without_resolving_them() {
        assert!(!is_on_local_disk(Path::new(
            r"\\attacker.example\share\a.md"
        )));
        assert!(!is_on_local_disk(Path::new(r"\\.\pipe\a.md")));
        assert!(!is_on_local_disk(Path::new("relative.md")));
    }

    #[test]
    fn accepts_any_granted_path() {
        let directory = visible_directory();
        let path = directory.path().join("Makefile");
        fs::write(&path, "all:").unwrap();
        let access = DocumentAccess::default();

        assert!(access.check(&path).is_err());
        access.grant(&path);
        assert!(access.check(&path).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_text_name_that_links_to_another_file() {
        let directory = visible_directory();
        let secret = directory.path().join("id_ed25519");
        let link = directory.path().join("innocent.md");
        fs::write(&secret, "key").unwrap();
        std::os::unix::fs::symlink(&secret, &link).unwrap();

        assert!(!checks(&link));
    }

    #[cfg(unix)]
    #[test]
    fn returns_the_file_a_link_resolves_to() {
        let directory = visible_directory();
        let target = directory.path().join("real.md");
        let link = directory.path().join("link.md");
        fs::write(&target, "text").unwrap();
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let resolved = DocumentAccess::default().check(&link).unwrap();
        assert_eq!(resolved, fs::canonicalize(&target).unwrap());
    }
}
