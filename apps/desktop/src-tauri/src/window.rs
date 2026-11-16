//! The main window. Built here rather than in `tauri.conf.json` so it carries the navigation
//! guard: the bundled shell and the chosen server load in it, every other link opens outside
//! (`navigation.rs`), and so does anything asking for a new window.

use std::sync::{Arc, Mutex};

use tauri::webview::NewWindowResponse;
use tauri::{App, AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::navigation::{Destination, destination, local_origins};
use crate::server::Server;

pub fn create<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let dev_url = if cfg!(dev) {
        app.config().build.dev_url.clone()
    } else {
        None
    };
    let local = Arc::new(local_origins(dev_url.as_ref()));
    let server = app.state::<Server>().origin.clone();

    let on_navigation = {
        let (app, local, server) = (app.handle().clone(), local.clone(), server.clone());
        move |url: &Url| route(&app, url, &server, &local, false)
    };
    let on_new_window = {
        let app = app.handle().clone();
        move |url: Url, _| {
            route(&app, &url, &server, &local, true);
            NewWindowResponse::Deny
        }
    };

    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Omni")
        .inner_size(1280.0, 800.0)
        .min_inner_size(720.0, 480.0)
        .on_navigation(on_navigation)
        .on_new_window(on_new_window)
        .build()?;
    Ok(())
}

/// True when the window may load `url`. A new-window request never loads in this window, so
/// with `new_window` even the server's own pages open outside: the app has one window.
fn route<R: Runtime>(
    app: &AppHandle<R>,
    url: &Url,
    server: &Mutex<Option<Url>>,
    local: &[Url],
    new_window: bool,
) -> bool {
    let current = Server::current(server);
    match destination(url, current.as_ref(), local) {
        Destination::Window if !new_window => true,
        Destination::Window | Destination::Browser if url.scheme() != "about" => {
            if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
                eprintln!("could not open {url}: {error}");
            }
            false
        }
        _ => false,
    }
}
