// Whether the app's history can go back or forward from here, for the desktop title bar's
// arrows (docs/spec/desktop.md, "Navigation changes in the web app"). Browsers say nothing about
// forward, so the furthest entry is tracked here: a push cuts off what was ahead of it.
import { useRouter } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";

interface Ends {
  back: boolean;
  forward: boolean;
}

let furthest = -1;
let ends: Ends = { back: false, forward: false };

function read(index: number): Ends {
  furthest = Math.max(furthest, index);
  const next = { back: index > 0, forward: index < furthest };
  if (next.back !== ends.back || next.forward !== ends.forward) ends = next;
  return ends;
}

export function useHistoryEnds(): Ends {
  const { history } = useRouter();
  return useSyncExternalStore(
    (notify) =>
      history.subscribe(({ action, location }) => {
        // What was ahead of a new entry can't be reached any more.
        if (action.type === "PUSH") furthest = location.state.__TSR_index;
        notify();
      }),
    () => read(history.location.state.__TSR_index),
  );
}
