mod documents;
mod error;
mod fonts;
mod settings;

use tauri::{Emitter, Manager, RunEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            documents::read_document,
            documents::write_document,
            documents::initial_document_path,
            fonts::list_system_fonts,
            settings::load_settings,
            settings::save_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the Hemingway application");

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
