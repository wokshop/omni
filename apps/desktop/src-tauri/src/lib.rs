//! The desktop shell (ADR 0043): windows, deep links, tray, updater, keychain, and telling the
//! sync provider that something changed. No product logic lives here.
//!
//! Ownership: `sync/` belongs to the File Provider layer; the rest of the shell to the shell
//! layer. Plugins and commands are registered here, the one shared line between them.

mod deep_link;
mod navigation;
mod server;
mod sync;
mod window;

pub fn run() {
    tauri::Builder::default()
        // First: a second launch (how Linux and Windows deliver an `omni://` link to a running
        // app) hands its URL to the deep-link plugin below and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            deep_link::handle(app, &[]);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(server::Server::default())
        .manage(deep_link::SignIns::default())
        .invoke_handler(tauri::generate_handler![
            server::server_origin,
            server::open_server,
            deep_link::sign_in_callback,
            sync::sync_status,
            sync::sync_connect,
            sync::sync_disconnect,
        ])
        .setup(|app| {
            window::create(app)?;
            deep_link::listen(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Omni");
}
