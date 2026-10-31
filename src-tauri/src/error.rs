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
    #[error("{0} is not a UTF-8 text file")]
    NotText(PathBuf),
    #[error(
        "{0}: only Markdown and text files open by name; choose others in the Open or Save dialog"
    )]
    NotPermitted(PathBuf),
    #[error("settings: {0}")]
    Settings(#[from] serde_json::Error),
    #[error("no configuration directory: {0}")]
    ConfigurationDirectory(#[from] tauri::Error),
    #[error("dictionary: {0}")]
    Dictionary(String),
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
