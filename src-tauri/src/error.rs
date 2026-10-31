use std::path::{Path, PathBuf};

/// Every failure a command can report. Serialised as its display string: the
/// frontend only ever shows these to the writer, it never branches on them.
/// They appear on the one-line status line, so a file is named as the status
/// line names it (`“notes.md”`) and the reason stays in view.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{}: {}", named(path), reason(source))]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("{} is larger than {limit} bytes", named(path))]
    TooLarge { path: PathBuf, limit: u64 },
    #[error("{} is read-only", named(.0))]
    ReadOnly(PathBuf),
    #[error("{} is not a UTF-8 text file", named(.0))]
    NotText(PathBuf),
    #[error("{} names a folder, not a document", named(.0))]
    IsFolder(PathBuf),
    #[error("{}: not opened or saved, since you declined", named(.0))]
    Declined(PathBuf),
    #[error("settings: {0}")]
    Settings(#[from] serde_json::Error),
    #[error("no configuration directory: {0}")]
    ConfigurationDirectory(#[from] tauri::Error),
    #[error("dictionary: {0}")]
    Dictionary(String),
    #[error("background task failed: {0}")]
    Interrupted(String),
}

impl Error {
    pub fn io(path: impl Into<PathBuf>) -> impl FnOnce(std::io::Error) -> Self {
        let path = path.into();
        move |source| Self::Io { path, source }
    }
}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

/// `path` by its file name in quotes, or whole when it has none (`/`).
fn named(path: &Path) -> String {
    match path.file_name() {
        Some(name) => format!("“{}”", name.to_string_lossy()),
        None => path.display().to_string(),
    }
}

/// The operating system's description of `error`, without the
/// `(os error 21)` code it appends, which means nothing to the writer.
fn reason(error: &std::io::Error) -> String {
    let description = error.to_string();
    match description.rfind(" (os error ") {
        Some(suffix_start) if error.raw_os_error().is_some() => {
            description[..suffix_start].to_owned()
        }
        _ => description,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_a_file_by_its_name_and_keeps_the_reason() {
        let error = Error::io("/a/long/path/to/chapter.md")(std::io::Error::from_raw_os_error(2));
        let message = error.to_string();
        assert!(message.starts_with("“chapter.md”: "), "{message}");
        assert!(!message.contains("os error"), "{message}");
    }

    #[test]
    fn names_a_path_without_a_file_name_whole() {
        assert_eq!(
            Error::IsFolder(PathBuf::from("/")).to_string(),
            "/ names a folder, not a document"
        );
    }
}
