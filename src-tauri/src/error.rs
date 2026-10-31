use std::path::PathBuf;

/// Every failure a command can report. Serialised as its display string: the
/// frontend only ever shows these to the writer, it never branches on them.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("{path} is larger than {limit} bytes")]
    TooLarge { path: PathBuf, limit: u64 },
    #[error("{0} is read-only")]
    ReadOnly(PathBuf),
    #[error("{0} is not a UTF-8 text file")]
    NotText(PathBuf),
    #[error("{0} names a folder, not a document")]
    IsFolder(PathBuf),
    #[error("{0}: not opened or saved, since you declined")]
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
