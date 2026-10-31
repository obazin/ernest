//! Running slow, synchronous work (file I/O, font parsing, native dialogs,
//! OS queries) on Tauri's blocking pool, so it never holds one of the async
//! runtime's few workers and delays other commands.

use crate::error::{Error, Result};

/// Runs `work` on the blocking pool. A panic inside it becomes an error
/// rather than a reply that never comes.
pub async fn on_blocking_pool<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| Error::Interrupted(error.to_string()))
}
