//! File-system primitives shared by every module that persists something:
//! documents, settings and the personal dictionary.

use std::fs::{self, File, OpenOptions};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::{self, ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::{Error, Result};

/// Writes through a temporary sibling and renames it over the target, so a
/// crash or full disk mid-write leaves the previous version intact rather
/// than a truncated file. Symlinks are resolved first so the link itself
/// survives, and the original permissions are carried over. Every write has
/// its own temporary file, so two writes to one path at once each rename a
/// complete file and the last one wins. A file the writer may not write is
/// refused before anything is created: Windows cannot rename over a
/// read-only file, and on Unix the rename would otherwise replace a file the
/// writer does not own.
pub fn write_atomically(path: &Path, contents: &[u8]) -> Result<()> {
    write_atomically_if(path, contents, |_| Ok(true)).map(|_| ())
}

/// `write_atomically`, asking `still_wanted` about the resolved target once
/// the new contents are safely on disk, just before the rename replaces it.
/// A `false` answer, or an error, removes the temporary file and leaves the
/// target as it is; the result says whether the target was replaced.
/// Checking this late keeps the window in which another application's save
/// could be lost down to the check itself and the rename.
pub fn write_atomically_if(
    path: &Path,
    contents: &[u8],
    still_wanted: impl FnOnce(&Path) -> io::Result<bool>,
) -> Result<bool> {
    let target = fs::canonicalize(path).unwrap_or_else(|_| absolute(path));
    let directory = target.parent().unwrap_or(Path::new("."));
    let file_name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let existing = fs::metadata(&target).ok();
    // Also caught here, where the write happens: a network path is only
    // inspected once the writer allowed it, and a file can become a folder
    // after it was checked.
    if existing.as_ref().is_some_and(fs::Metadata::is_dir) {
        return Err(Error::IsFolder(absolute(path)));
    }
    // Opening for writing, without truncating, answers for the read-only
    // attribute, Unix ownership and modes, ACLs and macOS locks alike.
    if existing.is_some()
        && let Err(error) = OpenOptions::new().write(true).open(&target)
        && error.kind() == ErrorKind::PermissionDenied
    {
        return Err(Error::ReadOnly(absolute(path)));
    }
    // Creating the temporary file fails on the folder (missing, or not
    // writable), so the message names the folder.
    let (temporary, mut file) =
        create_temporary(directory, &file_name).map_err(Error::io(directory))?;

    let result = (|| {
        file.write_all(contents)?;
        file.sync_all()?;
        if let Some(metadata) = &existing {
            fs::set_permissions(&temporary, metadata.permissions())?;
        }
        drop(file);
        if !still_wanted(&target)? {
            return Ok(false);
        }
        fs::rename(&temporary, &target).map(|_| true)
    })();

    if !matches!(result, Ok(true)) {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(Error::io(target))
}

/// Creates a new hidden sibling `.<name>.ernest-<process>-<count>`. It is
/// created exclusively, never opened if it exists, so a leftover file or a
/// symlink planted under that name is skipped rather than written through.
fn create_temporary(directory: &Path, file_name: &str) -> io::Result<(PathBuf, File)> {
    static COUNT: AtomicU64 = AtomicU64::new(0);
    let process = std::process::id();
    loop {
        let count = COUNT.fetch_add(1, Ordering::Relaxed);
        let temporary = directory.join(format!(".{file_name}.ernest-{process}-{count}"));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => return Ok((temporary, file)),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
}

/// The stamp of a file that does not exist, never the stamp of any contents.
pub const ABSENT: &str = "absent";

/// An opaque mark of a document's contents: a hash of its bytes and their
/// length. Two versions of a file have the same stamp only when they hold
/// the same text, however coarse the file system's clock, and a file merely
/// touched keeps its stamp. Stamps are compared within one run of the app,
/// so the hash only has to be stable for the life of the process.
pub fn content_stamp(contents: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    contents.hash(&mut hasher);
    format!("{:016x}-{}", hasher.finish(), contents.len())
}

/// The stamp of what the file at `path` holds now, `ABSENT` when there is no
/// file. At most `limit + 1` bytes are read: a longer file cannot match a
/// document that was read under the limit anyway.
pub fn current_content_stamp(path: &Path, limit: u64) -> io::Result<String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(ABSENT.to_owned()),
        Err(error) => return Err(error),
    };
    let mut contents = Vec::new();
    file.take(limit + 1).read_to_end(&mut contents)?;
    Ok(content_stamp(&contents))
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

    #[test]
    fn refuses_a_read_only_file_and_leaves_nothing_behind() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("locked.md");
        fs::write(&path, "kept").unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();

        assert!(matches!(
            write_atomically(&path, b"lost"),
            Err(Error::ReadOnly(_))
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), "kept");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn concurrent_writes_each_land_whole() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("race.md");
        let versions: Vec<String> = (0..8)
            .map(|index| index.to_string().repeat(100_000))
            .collect();

        std::thread::scope(|scope| {
            for version in &versions {
                let path = &path;
                scope.spawn(move || write_atomically(path, version.as_bytes()).unwrap());
            }
        });

        assert!(versions.contains(&fs::read_to_string(&path).unwrap()));
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn refuses_to_write_over_a_folder() {
        let directory = tempfile::tempdir().unwrap();
        let folder = directory.path().join("chapter.md");
        fs::create_dir(&folder).unwrap();

        assert!(matches!(
            write_atomically(&folder, b"text"),
            Err(Error::IsFolder(_))
        ));
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn an_unwanted_write_leaves_the_target_and_no_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        fs::write(&path, "kept").unwrap();

        assert!(!write_atomically_if(&path, b"lost", |_| Ok(false)).unwrap());

        assert_eq!(fs::read_to_string(&path).unwrap(), "kept");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn stamps_follow_the_contents_not_the_clock() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        let limit = 1024;
        assert_eq!(current_content_stamp(&path, limit).unwrap(), ABSENT);

        fs::write(&path, "same length").unwrap();
        let stamp = current_content_stamp(&path, limit).unwrap();
        assert_eq!(stamp, content_stamp(b"same length"));

        // Rewriting identical bytes keeps the stamp; same-length edits change it.
        fs::write(&path, "same length").unwrap();
        assert_eq!(current_content_stamp(&path, limit).unwrap(), stamp);
        fs::write(&path, "SAME length").unwrap();
        assert_ne!(current_content_stamp(&path, limit).unwrap(), stamp);
    }

    #[cfg(unix)]
    #[test]
    fn skips_a_symlink_planted_under_a_temporary_name() {
        let directory = tempfile::tempdir().unwrap();
        let victim = directory.path().join("victim");
        fs::write(&victim, "untouched").unwrap();
        let (first, _) = create_temporary(directory.path(), "notes.md").unwrap();
        let process = std::process::id();
        // Plant links under the next few names the counter may hand out.
        let count: u64 = first
            .to_string_lossy()
            .rsplit('-')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        for next in count + 1..count + 64 {
            let name = format!(".notes.md.ernest-{process}-{next}");
            std::os::unix::fs::symlink(&victim, directory.path().join(name)).unwrap();
        }

        write_atomically(&directory.path().join("notes.md"), b"text").unwrap();

        assert_eq!(fs::read_to_string(&victim).unwrap(), "untouched");
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
