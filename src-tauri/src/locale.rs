//! The operating system's locale preferences, which the webview cannot report
//! reliably.

use crate::blocking::on_blocking_pool;

/// The operating system's preferred languages, most preferred first, as BCP 47
/// tags (`fr-FR`). The frontend picks the spelling language from them when
/// none is stored, as on first launch; the webview's `navigator.languages`
/// cannot stand in, since WKWebView reports the app's localisation rather
/// than the system's. The platform query runs on the blocking pool; a panic
/// inside it answers with no languages instead of leaving startup waiting.
#[tauri::command]
pub async fn system_languages() -> Vec<String> {
    on_blocking_pool(|| sys_locale::get_locales().collect())
        .await
        .unwrap_or_default()
}
