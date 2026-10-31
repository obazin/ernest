use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, State, Window, Wry};
use tauri_plugin_dialog::{
    DialogExt, FileDialogBuilder, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
};

use crate::access::{Concern, DocumentAccess, TEXT_EXTENSIONS};
use crate::blocking::on_blocking_pool;
use crate::error::{Error, Result};
use crate::files::{ABSENT, absolute, content_stamp, current_content_stamp, write_atomically_if};

#[derive(Debug, Serialize)]
pub struct Document {
    /// Absolute path, so the title and later writes do not depend on the
    /// working directory the app was launched from.
    pub path: PathBuf,
    pub text: String,
    /// False when the path names a file that does not exist yet: the writer
    /// gets an empty document under that name, created on first write.
    pub exists: bool,
    /// What was read (`files::content_stamp`, or `ABSENT` for a new file),
    /// handed back on save so a file changed by another application is not
    /// overwritten unseen.
    pub stamp: String,
}

/// What became of a save.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum Saved {
    /// Written at `path` (absolute), which now holds the text stamped `stamp`.
    Written { path: PathBuf, stamp: String },
    /// Not written: the file no longer holds what the writer read.
    ChangedOnDisk,
}

/// Reads a granted path or a text document by name, asking the writer about
/// anything else (`access.rs`).
#[tauri::command]
pub async fn read_document(app: AppHandle, window: Window, path: PathBuf) -> Result<Document> {
    on_blocking_pool(move || {
        let target = app
            .state::<DocumentAccess>()
            .check(&path, ask_writer(&app, &window, Action::Open))?;
        Ok(Document {
            // The name the writer used, so a symlink keeps its own title.
            path: absolute(&path),
            ..read(&target)?
        })
    })
    .await?
}

/// Writes a granted path or a text document by name, asking the writer about
/// anything else (`access.rs`), and refuses text over the limit
/// `read_document` enforces, so Ernest never saves a file it could not open
/// again. With `expected`, the stamp of what the document was read or last
/// saved as, a file another application has changed since is left alone and
/// `ChangedOnDisk` comes back instead; without it, the file is overwritten.
#[tauri::command]
pub async fn write_document(
    app: AppHandle,
    window: Window,
    path: PathBuf,
    text: String,
    expected: Option<String>,
) -> Result<Saved> {
    on_blocking_pool(move || {
        if text.len() as u64 > MAXIMUM_DOCUMENT_BYTES {
            return Err(Error::TooLarge {
                path: absolute(&path),
                limit: MAXIMUM_DOCUMENT_BYTES,
            });
        }
        let target = app
            .state::<DocumentAccess>()
            .check(&path, ask_writer(&app, &window, Action::Save))?;
        save(&target, &absolute(&path), &text, expected.as_deref())
    })
    .await?
}

/// Writes `text` to `target` unless the file there no longer holds what was
/// stamped `expected`. The check runs just before the rename that replaces
/// the file, so another application's save can slip in only between
/// re-reading the file and the rename. A file that appeared since an absent
/// one was read counts as changed; a file that has disappeared is simply
/// written again. `path` is the name the writer used, reported back as
/// written.
fn save(target: &Path, path: &Path, text: &str, expected: Option<&str>) -> Result<Saved> {
    let unchanged = |target: &Path| match expected {
        None => Ok(true),
        Some(expected) => current_content_stamp(target, MAXIMUM_DOCUMENT_BYTES)
            .map(|current| current == expected || current == ABSENT),
    };
    if !write_atomically_if(target, text.as_bytes(), unchanged)? {
        return Ok(Saved::ChangedOnDisk);
    }
    Ok(Saved::Written {
        path: path.to_path_buf(),
        stamp: content_stamp(text.as_bytes()),
    })
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
/// writer never made; it waits for the writer on the blocking pool.
#[tauri::command]
pub async fn choose_document_to_open(app: AppHandle, window: Window) -> Result<Option<PathBuf>> {
    on_blocking_pool(move || {
        let chosen = text_file_dialog(&app, &window)
            .blocking_pick_file()
            .and_then(|file| file.into_path().ok());
        grant_chosen(&app, chosen)
    })
    .await
}

/// Asks the writer where to save and grants the answer. `current`, the
/// document's path if it has one, only seeds the dialog's folder and name,
/// and only when the webview may already write it without asking: otherwise
/// a compromised webview could offer `~/.zshrc` to a hasty Enter.
#[tauri::command]
pub async fn choose_document_to_save(
    app: AppHandle,
    window: Window,
    current: Option<PathBuf>,
) -> Result<Option<PathBuf>> {
    on_blocking_pool(move || {
        let mut dialog = text_file_dialog(&app, &window);
        let access = app.state::<DocumentAccess>();
        let current = current.filter(|path| access.check(path, |_, _| false).is_ok());
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
        grant_chosen(&app, chosen)
    })
    .await
}

/// What the webview asked to do with a path `ask_writer` confirms.
#[derive(Clone, Copy)]
enum Action {
    Open,
    Save,
}

impl Action {
    /// As it reads in a sentence: "Ernest was asked to open …".
    fn verb(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Save => "save",
        }
    }

    /// As it reads on a button and in a title.
    fn label(self) -> &'static str {
        match self {
            Self::Open => "Open",
            Self::Save => "Save",
        }
    }
}

/// A native confirmation for a path `access.rs` has a concern about. It is
/// shown by the backend, so the webview can neither answer nor skip it.
///
/// Only a click on the action's own button allows. The dialog plugin maps
/// Escape, closing the dialog or a dialog that failed to show to the last
/// button's label, and Return presses (or, on Linux, starts focused on) the
/// first, so the action goes in the middle, where neither can reach it:
/// "Don't Open", "Open", "Cancel".
fn ask_writer<'context>(
    app: &'context AppHandle,
    window: &'context Window,
    action: Action,
) -> impl FnOnce(&Path, &Concern) -> bool + 'context {
    move |path, concern| {
        let allow = action.label().to_owned();
        let buttons = MessageDialogButtons::YesNoCancelCustom(
            format!("Don't {allow}"),
            allow.clone(),
            "Cancel".to_owned(),
        );
        app.dialog()
            .message(format!(
                "Ernest was asked to {} “{}”, which {}.\n\nAllow it only if you typed this path yourself.",
                action.verb(),
                path.display(),
                concern.describe()
            ))
            .title(format!("{allow} this file?"))
            .kind(MessageDialogKind::Warning)
            .buttons(buttons)
            .parent(window)
            .blocking_show_with_result()
            == MessageDialogResult::Custom(allow)
    }
}

fn text_file_dialog(app: &AppHandle, window: &Window) -> FileDialogBuilder<Wry> {
    app.dialog()
        .file()
        .set_parent(window)
        .add_filter("Text", TEXT_EXTENSIONS)
        .add_filter("All files", &["*"])
}

fn grant_chosen(app: &AppHandle, chosen: Option<PathBuf>) -> Option<PathBuf> {
    let path = absolute(&chosen?);
    app.state::<DocumentAccess>().grant(&path);
    Some(path)
}

/// Far beyond any manuscript (a long novel is a few megabytes), and small
/// enough that the editor stays responsive and the reply is not copied
/// gigabytes at a time.
pub const MAXIMUM_DOCUMENT_BYTES: u64 = 16 * 1024 * 1024;

pub fn read(path: &Path) -> Result<Document> {
    read_at_most(path, MAXIMUM_DOCUMENT_BYTES)
}

/// Reads at most `limit` bytes, refusing a longer file without loading the
/// rest of it, even one that grows while it is read.
fn read_at_most(path: &Path, limit: u64) -> Result<Document> {
    let opened = File::open(path).and_then(|file| {
        let mut bytes = Vec::new();
        file.take(limit + 1).read_to_end(&mut bytes)?;
        Ok(bytes)
    });
    let bytes = match opened {
        Ok(bytes) if bytes.len() as u64 > limit => {
            return Err(Error::TooLarge {
                path: path.to_path_buf(),
                limit,
            });
        }
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Document {
                path: absolute(path),
                text: String::new(),
                exists: false,
                stamp: ABSENT.to_owned(),
            });
        }
        // Opening a folder fails differently on each platform.
        Err(_) if path.is_dir() => return Err(Error::IsFolder(path.to_path_buf())),
        Err(error) => return Err(Error::io(path)(error)),
    };
    let stamp = content_stamp(&bytes);
    let text = String::from_utf8(bytes).map_err(|_| Error::NotText(path.to_path_buf()))?;
    Ok(Document {
        path: absolute(path),
        text,
        exists: true,
        stamp,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

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
    fn reading_a_file_over_the_limit_is_refused() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("huge.md");
        fs::write(&path, "0123456789!").unwrap();

        assert_eq!(read_at_most(&path, 11).unwrap().text, "0123456789!");
        assert!(matches!(
            read_at_most(&path, 10),
            Err(Error::TooLarge { limit: 10, .. })
        ));
    }

    /// Saves `text` over `path` as the editor would, expecting `expected`.
    fn save_over(path: &Path, text: &str, expected: &str) -> Saved {
        save(path, path, text, Some(expected)).unwrap()
    }

    #[test]
    fn saves_in_a_row_each_expect_what_the_last_one_wrote() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chapter.md");
        fs::write(&path, "draft").unwrap();
        let mut stamp = read(&path).unwrap().stamp;

        for text in ["revised", "revised again", "final"] {
            let Saved::Written { stamp: written, .. } = save_over(&path, text, &stamp) else {
                panic!("{text} was refused");
            };
            stamp = written;
        }

        assert_eq!(fs::read_to_string(&path).unwrap(), "final");
    }

    #[test]
    fn leaves_alone_a_file_changed_since_it_was_read_even_at_the_same_length() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chapter.md");
        fs::write(&path, "draft one").unwrap();
        let stamp = read(&path).unwrap().stamp;
        fs::write(&path, "draft two").unwrap();

        assert_eq!(save_over(&path, "mine", &stamp), Saved::ChangedOnDisk);
        assert_eq!(fs::read_to_string(&path).unwrap(), "draft two");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_file_rewritten_with_the_same_text_is_not_a_change() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chapter.md");
        fs::write(&path, "draft").unwrap();
        let stamp = read(&path).unwrap().stamp;
        fs::write(&path, "draft").unwrap();

        assert!(matches!(
            save_over(&path, "mine", &stamp),
            Saved::Written { .. }
        ));
    }

    #[test]
    fn saving_without_an_expected_stamp_overwrites() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chapter.md");
        fs::write(&path, "theirs").unwrap();

        save(&path, &path, "mine", None).unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "mine");
    }

    #[test]
    fn a_new_file_created_elsewhere_before_the_first_save_is_left_alone() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("new.md");
        let stamp = read(&path).unwrap().stamp;
        fs::write(&path, "theirs").unwrap();

        assert_eq!(save_over(&path, "mine", &stamp), Saved::ChangedOnDisk);
        assert_eq!(fs::read_to_string(&path).unwrap(), "theirs");
    }

    #[test]
    fn a_file_deleted_since_it_was_read_is_written_again() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chapter.md");
        fs::write(&path, "draft").unwrap();
        let stamp = read(&path).unwrap().stamp;
        fs::remove_file(&path).unwrap();

        assert!(matches!(
            save_over(&path, "mine", &stamp),
            Saved::Written { .. }
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), "mine");
    }

    #[cfg(unix)]
    #[test]
    fn a_file_that_cannot_be_read_back_is_an_error_not_a_change() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("chapter.md");
        fs::write(&path, "draft").unwrap();
        let stamp = read(&path).unwrap().stamp;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o200)).unwrap();

        assert!(save(&path, &path, "mine", Some(&stamp)).is_err());
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_save_outcome_crosses_to_the_webview_tagged() {
        let written = Saved::Written {
            path: PathBuf::from("/notes.md"),
            stamp: "stamp".to_owned(),
        };
        assert_eq!(
            serde_json::to_value(written).unwrap(),
            serde_json::json!({ "outcome": "written", "path": "/notes.md", "stamp": "stamp" })
        );
        assert_eq!(
            serde_json::to_value(Saved::ChangedOnDisk).unwrap(),
            serde_json::json!({ "outcome": "changedOnDisk" })
        );
    }

    #[test]
    fn reading_a_folder_is_refused_as_one() {
        let directory = tempfile::tempdir().unwrap();
        assert!(matches!(read(directory.path()), Err(Error::IsFolder(_))));
    }

    #[test]
    fn reading_binary_data_is_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("image.png");
        fs::write(&path, [0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]).unwrap();

        assert!(matches!(read(&path), Err(Error::NotText(_))));
    }
}
