//! The desktop shell (ADR 0043): windows, deep links, tray, updater, keychain, and telling the
//! sync provider that something changed. No product logic lives here.
//!
//! Ownership: `sync/` belongs to the File Provider layer; the rest of the shell to the shell
//! layer. Plugins and commands are registered here, the one shared line between them.

mod navigation;
mod server;
mod sync;
mod window;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(server::Server::default())
        .invoke_handler(tauri::generate_handler![
            server::server_origin,
            server::open_server,
            sync::sync_status,
            sync::sync_connect,
            sync::sync_disconnect,
        ])
        .setup(|app| Ok(window::create(app)?))
        .run(tauri::generate_context!())
        .expect("error while running Omni");
}
