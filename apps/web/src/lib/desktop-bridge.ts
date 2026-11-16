// Tauri's JS API, loaded only inside the desktop app (`desktop.ts` imports this dynamically).
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";

export const openOutside = (url: string) => openUrl(url);

// `undefined` removes the badge.
export const setBadge = (count: number) =>
  getCurrentWindow().setBadgeCount(count > 0 ? count : undefined);
