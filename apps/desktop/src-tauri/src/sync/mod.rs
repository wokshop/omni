//! Drive sync, as the web app sees it (ADR 0043 decision 2): the three commands the server
//! origin may call. Settings → Drive reads `sync_status` and switches a workspace with
//! `sync_connect` / `sync_disconnect`.
//!
//! Scaffold: the shapes are final, the behaviour is not. The File Provider layer registers the
//! domain, holds the `storage:sync` token in the keychain and signals the extension here.

use serde::{Deserialize, Serialize};

/// Where sync stands for one workspace, as Settings → Drive shows it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncState {
    /// Sync is off for this workspace (the default: it puts a folder in Finder).
    Off,
    /// Turned on and up to date.
    Synced,
    /// Turned on, with changes going up or down.
    Syncing,
    /// Turned on, paused from the tray.
    Paused,
    /// Turned on, and the provider needs the person: sign in again, storage full.
    NeedsAttention,
}

/// `sync_status`'s answer: sync is per workspace, and this platform may not have it at all.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    /// False where this build has no sync provider yet (Windows until its layer, Linux always).
    pub available: bool,
    pub workspaces: Vec<WorkspaceSync>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSync {
    pub org_id: String,
    pub state: SyncState,
}

#[tauri::command]
pub fn sync_status() -> SyncStatus {
    SyncStatus {
        available: false,
        workspaces: Vec::new(),
    }
}

#[tauri::command]
pub fn sync_connect(org_id: String) -> Result<WorkspaceSync, String> {
    Err(format!("sync is not available in this build ({org_id})"))
}

#[tauri::command]
pub fn sync_disconnect(org_id: String) -> Result<WorkspaceSync, String> {
    Err(format!("sync is not available in this build ({org_id})"))
}
