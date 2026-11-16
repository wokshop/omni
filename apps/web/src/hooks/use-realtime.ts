import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { onThreadsMerged, realtimeStatus, startRealtime } from "../lib/realtime.ts";
/**
 * Keeps the realtime socket for `orgId`, the active workspace, open while mounted. Only that one:
 * the lists show only the active workspace's mail (ADR 0014, amended: workspace isolation). A new
 * `memberId` or org (organization or account switch) reopens it.
 */
export function useRealtimeConnection(orgId: string, options: { memberId?: string } = {}) {
  const client = useQueryClient();
  useEffect(() => startRealtime(client, [], orgId), [client, orgId, options.memberId]);
}

/** `connecting`, `open` or `closed`: for a "reconnecting…" indicator. */
export function useRealtimeStatus() {
  return useSyncExternalStore(realtimeStatus.subscribe, realtimeStatus.get, realtimeStatus.get);
}

/**
 * Calls `follow(intoThreadId)` when the thread `threadId` is merged into another (its messages
 * and helpdesk state moved there), so a reader showing it can move to the survivor.
 */
export function useFollowMerge(threadId: string, follow: (intoThreadId: string) => void) {
  const latest = useRef(follow);
  latest.current = follow;
  useEffect(
    () =>
      onThreadsMerged((event) => {
        if (event.fromThreadIds.includes(threadId)) latest.current(event.intoThreadId);
      }),
    [threadId],
  );
}
