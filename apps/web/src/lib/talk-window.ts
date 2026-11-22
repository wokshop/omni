import { useSyncExternalStore } from "react";

let open: string | null = null;
const listeners = new Set<() => void>();
const set = (memberId: string | null) => {
  open = memberId;
  for (const listener of listeners) listener();
};

export const talkWindow = {
  get: () => open,
  open: (memberId: string) => set(memberId),
  close: () => set(null),
};

/** The member whose conversation is open, or null. */
export function useTalkWindow() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, talkWindow.get);
}
