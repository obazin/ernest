mod access;
mod documents;
mod error;
mod files;
mod fonts;
mod locale;
mod settings;
mod spelling;

use tauri::{Emitter, Manager, RunEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(access::DocumentAccess::default())
        .manage(spelling::SpellingState::default())
        .invoke_handler(tauri::generate_handler![
            documents::read_document,
            documents::write_document,
            documents::initial_document_path,
            documents::choose_document_to_open,
            documents::choose_document_to_save,
            fonts::list_system_fonts,
            locale::system_languages,
            settings::load_settings,
            settings::save_settings,
            spelling::check_words,
            spelling::spelling_suggestions,
            spelling::add_to_dictionary,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the Ernest application");

    app.run(|app, event| {
        // An application-level quit (Cmd+Q, the app menu) while a window is
        // still open goes to the frontend first, which owns the unsaved-changes
        // check and destroys its window once it is safe; that last window
        // closing then ends the process. `code: Some(_)` is an explicit
        // `exit()` and is never intercepted.
        if let RunEvent::ExitRequested {
            code: None, api, ..
        } = &event
            && !app.webview_windows().is_empty()
        {
            api.prevent_exit();
            let _ = app.emit("quit-requested", ());
        }
    });
}
