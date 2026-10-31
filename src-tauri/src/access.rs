//! Which files the webview may read and write as documents, and when the
//! writer is asked first.
//!
//! A path the writer chose outside the webview (in a file dialog the backend
//! shows, or on the command line) is granted whatever it is. A path that
//! arrives from the webview alone, as `:e`, `:w` and `:sav` paths do, is
//! accepted silently when it is a text document by name, in any folder.
//! Anything else (another kind of file, a link to one, a device, a network
//! location) is shown to the writer in a native confirmation the webview
//! cannot answer, and granted if they allow it. A compromised webview
//! therefore cannot quietly read `~/.ssh/id_ed25519` or overwrite `~/.zshrc`.
//! A folder is refused outright, before any grant or confirmation: there is
//! nothing to ask about, since it can be neither read nor written as a
//! document.

use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf, Prefix};
use std::sync::Mutex;

use crate::error::{Error, Result};
use crate::files::absolute;

/// The extensions a document is read or written under without asking.
pub const TEXT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt", "text"];

/// Windows device names, treated as devices on every platform alike.
const DEVICE_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Why a path needs the writer's confirmation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Concern {
    /// A network share, WebDAV or device path. Nothing has touched it yet:
    /// on Windows, merely resolving one sends the user's credentials.
    NetworkLocation,
    /// A name a Windows device answers to (`NUL.md`, `COM1.txt`).
    DeviceName,
    /// Not a Markdown or text file by its extension.
    NotText,
    /// A text name that leads through a symlink to this file, which is not.
    LinksTo(PathBuf),
    /// The path exists but cannot be resolved, so where it leads is unknown.
    Unresolved,
}

impl Concern {
    /// Completes "Ernest was asked to open “…”, which …".
    pub fn describe(&self) -> String {
        match self {
            Self::NetworkLocation => "is on another computer or device".to_owned(),
            Self::DeviceName => "names a system device rather than a file".to_owned(),
            Self::NotText => "is not a Markdown or text file".to_owned(),
            Self::LinksTo(target) => format!(
                "leads through a link to “{}”, which is not a Markdown or text file",
                target.display()
            ),
            Self::Unresolved => "exists but cannot be inspected".to_owned(),
        }
    }
}

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

    fn is_granted(&self, path: &Path) -> bool {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .contains(path)
    }

    /// The file to read or write for `path`, resolved through symlinks when
    /// it exists. A folder, or a typed path ending in a separator, is refused;
    /// a granted path or a text document by name passes; anything else goes
    /// to `confirm`, and is granted when it answers true. Callers use the
    /// returned path, so what was checked is what gets touched.
    pub fn check(
        &self,
        path: &Path,
        confirm: impl FnOnce(&Path, &Concern) -> bool,
    ) -> Result<PathBuf> {
        let given = absolute(path);
        if path
            .as_os_str()
            .to_string_lossy()
            .ends_with(std::path::is_separator)
        {
            return Err(Error::IsFolder(given));
        }
        // Before touching the file system: resolving a network path is
        // itself a network request.
        if !is_on_local_disk(&given) {
            if self.is_granted(&given) {
                return Ok(given);
            }
            return self.confirmed(given, None, &Concern::NetworkLocation, confirm);
        }
        match fs::canonicalize(&given) {
            Ok(target) => {
                // Nothing to ask about: a folder can be neither read nor
                // written as a document, whatever its name.
                if target.is_dir() {
                    return Err(Error::IsFolder(given));
                }
                if self.is_granted(&given) || self.is_granted(&target) {
                    return Ok(target);
                }
                let concern = name_concern(&given)
                    .or_else(|| name_concern(&target).map(|_| Concern::LinksTo(target.clone())));
                match concern {
                    None => Ok(target),
                    Some(concern) => self.confirmed(given, Some(target), &concern, confirm),
                }
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {
                if self.is_granted(&given) {
                    return Ok(given);
                }
                match name_concern(&given) {
                    None => Ok(given),
                    Some(concern) => self.confirmed(given, None, &concern, confirm),
                }
            }
            Err(_) => self.confirmed(given, None, &Concern::Unresolved, confirm),
        }
    }

    fn confirmed(
        &self,
        given: PathBuf,
        target: Option<PathBuf>,
        concern: &Concern,
        confirm: impl FnOnce(&Path, &Concern) -> bool,
    ) -> Result<PathBuf> {
        if !confirm(&given, concern) {
            return Err(Error::Declined(given));
        }
        self.grant(&given);
        Ok(target.unwrap_or(given))
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

/// What, if anything, the file name alone makes worth confirming.
fn name_concern(path: &Path) -> Option<Concern> {
    let name = path.file_name().and_then(|name| name.to_str());
    let stem = name.and_then(|name| name.split('.').next());
    if stem.is_some_and(|stem| {
        DEVICE_NAMES
            .iter()
            .any(|device| device.eq_ignore_ascii_case(stem))
    }) {
        return Some(Concern::DeviceName);
    }
    let text = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            TEXT_EXTENSIONS
                .iter()
                .any(|known| known.eq_ignore_ascii_case(extension))
        });
    (!text).then_some(Concern::NotText)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn never_asked(path: &Path, concern: &Concern) -> bool {
        panic!("asked about {} ({concern:?})", path.display())
    }

    /// The concern `path` raises, declining it.
    fn concern_for(access: &DocumentAccess, path: &Path) -> Option<Concern> {
        let mut raised = None;
        let _ = access.check(path, |_, concern| {
            raised = Some(concern.clone());
            false
        });
        raised
    }

    #[test]
    fn accepts_text_documents_in_any_folder_without_asking() {
        let directory = tempfile::tempdir().unwrap();
        let access = DocumentAccess::default();
        for path in [
            directory.path().join("notes.md"),
            directory.path().join("Draft.MARKDOWN"),
            directory.path().join(".config").join("todo.txt"),
            directory.path().join(".notes.md"),
        ] {
            assert!(
                access.check(&path, never_asked).is_ok(),
                "{}",
                path.display()
            );
        }
    }

    #[test]
    fn asks_about_other_files_and_devices() {
        let directory = tempfile::tempdir().unwrap();
        let access = DocumentAccess::default();
        for name in ["id_ed25519", "notes", "script.sh", "page.mdx"] {
            let path = directory.path().join(name);
            assert_eq!(
                concern_for(&access, &path),
                Some(Concern::NotText),
                "{name}"
            );
        }
        let device = directory.path().join("NUL.md");
        assert_eq!(concern_for(&access, &device), Some(Concern::DeviceName));
    }

    #[test]
    fn refuses_folders_without_asking_whatever_their_name() {
        let directory = tempfile::tempdir().unwrap();
        let access = DocumentAccess::default();
        for name in ["drafts", "chapter.md"] {
            let folder = directory.path().join(name);
            fs::create_dir(&folder).unwrap();
            assert!(
                matches!(access.check(&folder, never_asked), Err(Error::IsFolder(_))),
                "{name}"
            );
        }
        // Even a folder named on the command line.
        access.grant(directory.path());
        assert!(matches!(
            access.check(directory.path(), never_asked),
            Err(Error::IsFolder(_))
        ));
        // A typed folder that does not exist yet.
        let typed = format!("{}/drafts-to-come/", directory.path().display());
        assert!(matches!(
            access.check(Path::new(&typed), never_asked),
            Err(Error::IsFolder(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_text_name_that_links_to_a_folder_without_asking() {
        let directory = tempfile::tempdir().unwrap();
        let folder = directory.path().join("drafts");
        fs::create_dir(&folder).unwrap();
        let link = directory.path().join("notes.md");
        std::os::unix::fs::symlink(&folder, &link).unwrap();

        assert!(matches!(
            DocumentAccess::default().check(&link, never_asked),
            Err(Error::IsFolder(_))
        ));
    }

    #[test]
    fn asks_about_network_paths_without_resolving_them() {
        assert!(!is_on_local_disk(Path::new(
            r"\\attacker.example\share\a.md"
        )));
        assert!(!is_on_local_disk(Path::new(r"\\.\pipe\a.md")));
        assert!(!is_on_local_disk(Path::new("relative.md")));
    }

    #[test]
    fn a_declined_path_is_refused_and_not_granted() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("Makefile");
        let access = DocumentAccess::default();

        assert!(matches!(
            access.check(&path, |_, _| false),
            Err(Error::Declined(_))
        ));
        assert_eq!(concern_for(&access, &path), Some(Concern::NotText));
    }

    #[test]
    fn an_allowed_path_is_granted_from_then_on() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("Makefile");
        let access = DocumentAccess::default();

        assert!(access.check(&path, |_, _| true).is_ok());
        fs::write(&path, "all:").unwrap();
        assert!(access.check(&path, never_asked).is_ok());
    }

    #[test]
    fn a_granted_path_is_never_asked_about() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("Makefile");
        fs::write(&path, "all:").unwrap();
        let access = DocumentAccess::default();

        access.grant(&path);
        assert!(access.check(&path, never_asked).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn asks_about_a_text_name_that_links_to_another_file() {
        let directory = tempfile::tempdir().unwrap();
        let secret = directory.path().join("id_ed25519");
        let link = directory.path().join("innocent.md");
        fs::write(&secret, "key").unwrap();
        std::os::unix::fs::symlink(&secret, &link).unwrap();

        let mut raised = None;
        let _ = DocumentAccess::default().check(&link, |_, concern| {
            raised = Some(concern.describe());
            false
        });
        assert!(raised.unwrap().contains("id_ed25519"));
    }

    #[cfg(unix)]
    #[test]
    fn returns_the_file_a_link_resolves_to() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("real.md");
        let link = directory.path().join("link.md");
        fs::write(&target, "text").unwrap();
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let resolved = DocumentAccess::default().check(&link, never_asked).unwrap();
        assert_eq!(resolved, fs::canonicalize(&target).unwrap());
    }
}
