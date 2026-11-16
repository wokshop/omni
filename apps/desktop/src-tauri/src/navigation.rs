//! Where a URL the main window is asked to load goes (ADR 0043 decision 2): the bundled local
//! shell and the chosen Omni server stay in the window; links elsewhere open in the default
//! browser; anything else is dropped. Pure, so the rules are tested without a window.

use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Destination {
    /// Load it in the window.
    Window,
    /// Cancel it and hand it to the default browser or mail app.
    Browser,
    /// Cancel it: a scheme nothing should open from here (`file:`, `javascript:`, …).
    Drop,
}

/// The origins the bundled shell is served from: Tauri's scheme on macOS and Linux, its
/// `tauri.localhost` host on Windows, and the Vite server in `tauri dev`.
pub fn local_origins(dev_url: Option<&Url>) -> Vec<Url> {
    let mut origins: Vec<Url> = [
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]
    .iter()
    .filter_map(|origin| Url::parse(origin).ok())
    .collect();
    origins.extend(dev_url.cloned());
    origins
}

/// Same scheme, host and port. `Url::origin` cannot be used: Tauri's own scheme has an opaque
/// origin, and two opaque origins never compare equal.
pub fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.port_or_known_default() == b.port_or_known_default()
}

/// Where `url` goes, given the chosen server (none before the picker has an answer).
pub fn destination(url: &Url, server: Option<&Url>, local: &[Url]) -> Destination {
    let allowed = |origin: &Url| same_origin(url, origin);
    if local.iter().any(allowed) || server.is_some_and(allowed) {
        return Destination::Window;
    }
    match url.scheme() {
        "about" if url.path() == "blank" => Destination::Window,
        "http" | "https" | "mailto" | "tel" => Destination::Browser,
        _ => Destination::Drop,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    fn local() -> Vec<Url> {
        local_origins(Some(&url("http://localhost:1420")))
    }

    // Bug: Tauri's own scheme has an opaque origin; comparing `Url::origin` would send the
    // bundled shell itself to the browser and leave the window blank on macOS and Linux.
    #[test]
    fn the_bundled_shell_stays_in_the_window() {
        let server = url("https://omni.example.com/");
        for shell in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/",
            "http://localhost:1420/",
        ] {
            assert_eq!(
                destination(&url(shell), Some(&server), &local()),
                Destination::Window,
                "{shell}"
            );
        }
    }

    // Bug: a look-alike host or another port of the same host would load with the remote
    // capability's commands in reach, or the server's own pages would bounce to the browser.
    #[test]
    fn only_the_chosen_server_origin_stays() {
        let server = url("http://127.0.0.1:8787/");
        let here = |s: &str| destination(&url(s), Some(&server), &local());
        assert_eq!(
            here("http://127.0.0.1:8787/inbox?view=all#top"),
            Destination::Window
        );
        assert_eq!(here("http://127.0.0.1:8788/inbox"), Destination::Browser);
        assert_eq!(here("https://127.0.0.1:8787/inbox"), Destination::Browser);
        assert_eq!(here("http://127.0.0.1.evil.example/"), Destination::Browser);
    }

    // Bug: before a server is chosen, any http page would load in the window.
    #[test]
    fn nothing_remote_stays_before_a_server_is_chosen() {
        assert_eq!(
            destination(&url("https://omni.example.com/"), None, &local()),
            Destination::Browser
        );
    }

    // Bug: a `file:` or `javascript:` link handed to the opener would run or reveal local files.
    #[test]
    fn unknown_schemes_are_dropped_and_mail_links_go_out() {
        let server = url("https://omni.example.com/");
        let here = |s: &str| destination(&url(s), Some(&server), &local());
        assert_eq!(here("file:///etc/passwd"), Destination::Drop);
        assert_eq!(here("javascript:alert(1)"), Destination::Drop);
        assert_eq!(here("mailto:someone@example.com"), Destination::Browser);
        assert_eq!(here("about:blank"), Destination::Window);
    }
}
