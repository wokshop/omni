// How Storage lays out a folder, list or grid: one choice for every folder, remembered in this
// browser, like the reader's full screen.
import { useCallback, useSyncExternalStore } from "react";

export type StorageView = "list" | "grid";

const KEY = "omni:storage-view";
const listeners = new Set<() => void>();

function read(): StorageView {
  try {
    return localStorage.getItem(KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list"; // Storage unavailable (private mode).
  }
}

let current = read();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `[view, setView]`. A list until the person picks the grid. */
export function useStorageView() {
  const view = useSyncExternalStore(subscribe, () => current);
  const setView = useCallback((next: StorageView) => {
    current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The choice lasts for this page only.
    }
    for (const listener of listeners) listener();
  }, []);
  return [view, setView] as const;
}
