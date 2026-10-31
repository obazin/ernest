//! The application menu, and quitting through the frontend's
//! unsaved-changes check.
//!
//! macOS gives every app a menu bar, whose stock Quit item sends
//! `terminate:` straight to `NSApp`: the process ends without a
//! `RunEvent::ExitRequested`, so unsaved changes would be lost. Ernest keeps
//! the default menu but swaps that item for its own, which emits
//! `quit-requested` for the frontend to ask and close the window. Quit from
//! the Dock and logging out still send `terminate:` directly and are not
//! intercepted. Windows and Linux have no menu bar, and quit by closing the
//! window, which the frontend already intercepts, so `install` leaves them as
//! they are.

use tauri::{Builder, Runtime};

/// Gives the app its menu: on macOS the default one with Ernest's own Quit,
/// elsewhere none, since Tauri gives Windows and Linux no default menu.
pub fn install<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    #[cfg(target_os = "macos")]
    let builder = macos::install(builder);
    builder
}

#[cfg(target_os = "macos")]
mod macos {
    use tauri::menu::{Menu, MenuItem, MenuItemKind};
    use tauri::{AppHandle, Builder, Emitter, Manager, Runtime};

    /// The id of Ernest's own Quit item.
    const QUIT: &str = "quit";

    pub fn install<R: Runtime>(builder: Builder<R>) -> Builder<R> {
        builder.menu(build).on_menu_event(|app, event| {
            if event.id() != QUIT {
                return;
            }
            // The frontend asks about unsaved changes and destroys the
            // window once it is safe; with no window left there is nothing
            // to ask about.
            if app.webview_windows().is_empty() {
                app.exit(0);
            } else {
                let _ = app.emit("quit-requested", ());
            }
        })
    }

    /// The default menu, with the stock Quit (the last item of the
    /// application submenu, titled "Quit Ernest") swapped for an item with
    /// the same title and shortcut that Ernest handles itself.
    fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
        let menu = Menu::default(app)?;
        let Some(MenuItemKind::Submenu(application)) = menu.items()?.into_iter().next() else {
            return Ok(menu);
        };
        // Tauri does not expose a predefined item's kind, so the title
        // identifies it; a different default menu fails loudly in debug
        // builds rather than quietly losing the unsaved-changes check.
        let Some(MenuItemKind::Predefined(stock)) = application.items()?.pop() else {
            debug_assert!(false, "the default menu no longer ends with Quit");
            return Ok(menu);
        };
        let title = stock.text()?;
        if !title.starts_with("Quit") {
            debug_assert!(false, "the default menu no longer ends with Quit");
            return Ok(menu);
        }
        application.remove(&stock)?;
        let quit = MenuItem::with_id(app, QUIT, title, true, Some("Cmd+Q"))?;
        application.append(&quit)?;
        Ok(menu)
    }
}
