//! The operating system's locale preferences, which the webview cannot report
//! reliably.

/// The operating system's preferred languages, most preferred first, as BCP 47
/// tags (`fr-FR`). The frontend picks the spelling language from them when
/// none is stored, as on first launch; the webview's `navigator.languages`
/// cannot stand in, since WKWebView reports the app's localisation rather
/// than the system's. A panic inside the platform query answers with no
/// languages instead of leaving startup waiting for a reply.
#[tauri::command]
pub async fn system_languages() -> Vec<String> {
    std::panic::catch_unwind(|| sys_locale::get_locales().collect()).unwrap_or_default()
}
