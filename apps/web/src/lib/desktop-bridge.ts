// Tauri's JS API, loaded only inside the desktop app (`desktop.ts` imports this dynamically).
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { DesktopSyncStatus, DesktopWorkspaceSync } from "@omni/client";

export const openOutside = (url: string) => openUrl(url);

// `undefined` removes the badge.
export const setBadge = (count: number) =>
  getCurrentWindow().setBadgeCount(count > 0 ? count : undefined);

/** `omni://auth?state=…`, issued once by the shell for this sign-in (`deep_link.rs`). */
export const signInCallback = () => invoke<string>("sign_in_callback");

/** Drive sync on this computer (`apps/desktop/src-tauri/src/sync`). */
export const syncStatus = () => invoke<DesktopSyncStatus>("sync_status");
export const syncConnect = (orgId: string) =>
  invoke<DesktopWorkspaceSync>("sync_connect", { orgId });
export const syncDisconnect = (orgId: string) =>
  invoke<DesktopWorkspaceSync>("sync_disconnect", { orgId });

export const startDragging = () => getCurrentWindow().startDragging();

export const toggleMaximize = () => getCurrentWindow().toggleMaximize();
