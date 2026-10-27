use std::collections::BTreeSet;

/// Family names of every font installed on the system, sorted and unique.
///
/// The webview resolves CSS `font-family` against the same system fonts, so
/// any name returned here can be used directly in the editor's stylesheet.
/// Enumeration parses every font file's name table, which takes a noticeable
/// moment on machines with many fonts, hence an async command (run off the
/// main thread) that the frontend calls lazily.
#[tauri::command]
pub async fn list_system_fonts() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    family_names(&database)
}

fn family_names(database: &fontdb::Database) -> Vec<String> {
    database
        .faces()
        .filter_map(|face| {
            // Prefer the English name: localised names (e.g. Japanese fonts)
            // are not always accepted by the webview's font matching.
            face.families
                .iter()
                .find(|(_, language)| *language == fontdb::Language::English_UnitedStates)
                .or_else(|| face.families.first())
                .map(|(name, _)| name.clone())
        })
        // Fonts whose family starts with `.` are private system UI faces
        // (`.SF NS`, `.AppleSystemUIFont`) that cannot be selected by name.
        .filter(|name| !name.starts_with('.'))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
