mod access;
mod blocking;
mod documents;
mod error;
mod files;
mod fonts;
mod locale;
mod menu;
mod settings;
mod spelling;

pub fn run() {
    menu::install(tauri::Builder::default())
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
        .run(tauri::generate_context!())
        .expect("error while running the Ernest application");
}
