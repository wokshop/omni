import { useSyncExternalStore } from "react";

/** The one Talk window: whose conversation it shows, and whether it is expanded. */
export interface TalkWindowState {
  memberId: string | null;
  expanded: boolean;
}

let state: TalkWindowState = { memberId: null, expanded: false };
const listeners = new Set<() => void>();
const set = (next: TalkWindowState) => {
  state = next;
  for (const listener of listeners) listener();
};

export const talkWindow = {
  get: () => state,
  open: (memberId: string) => set({ memberId, expanded: state.expanded }),
  close: () => set({ memberId: null, expanded: false }),
  toggleExpanded: () => set({ ...state, expanded: !state.expanded }),
};

export function useTalkWindow() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, talkWindow.get);
}
