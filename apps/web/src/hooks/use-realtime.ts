import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { threadQuery } from "../lib/mail-queries.ts";
import { onThreadsMerged, realtimeStatus, startRealtime } from "../lib/realtime.ts";

/**
 * Keeps the realtime socket for `orgId`, the active workspace, open while mounted. The lists show
 * only the active workspace's mail (ADR 0014, amended: workspace isolation), so that is the one
 * socket, plus the open thread's workspace while a thread from another one is open (a link to it
 * opens it as that workspace's member): its new messages and its sends' results arrive there. A
 * new `memberId`, org, or open thread's workspace reopens them.
 */
export function useRealtimeConnection(orgId: string, options: { memberId?: string } = {}) {
  const client = useQueryClient();
  const { threadId } = useParams({ strict: false }) as { threadId?: string };
  // The reader's own query (same key), so this adds no request.
  const threadOrg = useQuery({
    ...threadQuery(threadId ?? ""),
    enabled: !!threadId,
    select: (thread) => thread.orgId,
  }).data;
  const other = threadId && threadOrg && threadOrg !== orgId ? threadOrg : "";
  useEffect(
    () => startRealtime(client, other ? [other] : [], orgId),
    [client, orgId, options.memberId, other],
  );
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
