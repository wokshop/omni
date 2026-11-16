//! The main window. Built here rather than in `tauri.conf.json` so it carries the navigation
//! guard (`navigation.rs`): web pages and the bundled shell load in it, `mailto:` and `tel:` open
//! their apps, and anything asking for a new window opens in the default browser. Downloads are
//! saved to the Downloads folder (WebKit cancels them when no handler is set).

use std::sync::Arc;

use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{App, AppHandle, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::navigation::{Destination, destination, local_origins};

pub fn create<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let dev_url = if cfg!(dev) {
        app.config().build.dev_url.clone()
    } else {
        None
    };
    let local = Arc::new(local_origins(dev_url.as_ref()));

    let on_navigation = {
        let (app, local) = (app.handle().clone(), local.clone());
        move |url: &Url| route(&app, url, &local, false)
    };
    let on_new_window = {
        let app = app.handle().clone();
        move |url: Url, _| {
            route(&app, &url, &local, true);
            NewWindowResponse::Deny
        }
    };

    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Omni")
        .inner_size(1280.0, 800.0)
        .min_inner_size(720.0, 480.0)
        .on_navigation(on_navigation)
        .on_new_window(on_new_window)
        // The destination arrives filled in: the Downloads folder, the suggested name, made unique.
        .on_download(|_, event| {
            if let DownloadEvent::Finished {
                url,
                success: false,
                ..
            } = event
            {
                eprintln!("download failed: {url}");
            }
            true
        })
        .build()?;
    Ok(())
}

/// True when the window may load `url`. A new-window request never loads in this window: the app
/// has one, so a web page asking for another opens in the default browser.
fn route<R: Runtime>(app: &AppHandle<R>, url: &Url, local: &[Url], new_window: bool) -> bool {
    match destination(url, local) {
        Destination::Window if !new_window => true,
        Destination::Window | Destination::Browser
            if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") =>
        {
            if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
                eprintln!("could not open {url}: {error}");
            }
            false
        }
        _ => false,
    }
}
