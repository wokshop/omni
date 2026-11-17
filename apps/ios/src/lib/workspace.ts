// The workspace the app is in (ADR 0043). Every API call names it (`omni-workspace`), as each web
// tab names the one in its URL, so the Worker answers for it whatever the session's active org is.
// The choice survives a relaunch; until one is known, calls name none and the Worker answers for
// the session's.
import type { Workspace, Workspaces } from "@omni/client";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { api, call } from "./api.ts";
import { keys } from "./query-keys.ts";
import { queryClient } from "./query-client.ts";
import { currentWorkspaceId, storeWorkspaceId, subscribeWorkspaceId } from "./workspace-id.ts";

/** Opens a workspace: later calls name it, and nothing read for the last one is shown again. */
export function openWorkspace(id: string | null) {
  if (id === currentWorkspaceId()) return;
  // Every cached answer but the workspace list belongs to the workspace it was read in.
  void queryClient.cancelQueries();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.workspaces()[0] });
  storeWorkspaceId(id);
}

/** Every workspace the user belongs to, their Personal space included (ADR 0024). */
export const workspacesQuery = () =>
  queryOptions({
    queryKey: keys.workspaces(),
    queryFn: ({ signal }) =>
      call(api.workspaces.$get({ query: { include: "personal" } }, { init: { signal } })),
    staleTime: 5 * 60_000,
  });

/** The chosen workspace, else the session's active one, else the first. */
function resolve(data: Workspaces | undefined, id: string | null) {
  const list = data?.workspaces ?? [];
  return (
    list.find((w) => w.id === id) ??
    list.find((w) => w.id === data?.activeOrganizationId) ??
    list[0]
  );
}

/** The workspace list and the one the app is in (undefined until the list loads). */
export function useWorkspace() {
  const workspaces = useQuery(workspacesQuery());
  const id = useSyncExternalStore(subscribeWorkspaceId, currentWorkspaceId);
  const active = resolve(workspaces.data, id);
  // A workspace left or deleted since it was chosen: fall back to the one the list resolves.
  const stale = !!workspaces.data && id !== null && active?.id !== id;
  useEffect(() => {
    if (stale) openWorkspace(active?.id ?? null);
  }, [stale, active?.id]);
  return { workspaces, active, all: workspaces.data?.workspaces ?? [] };
}

/** A company by its name; the Personal space as the person's own, as the web app says it. */
export function workspaceLabel(workspace: Pick<Workspace, "kind" | "name">, userName?: string) {
  if (workspace.kind !== "personal") return workspace.name;
  const first = userName?.trim().split(/\s+/)[0];
  return first ? `${first}'s Workspace` : "Personal Workspace";
}

/** A Personal space has no CRM (`no_crm`). */
export const hasCrm = (workspace: Pick<Workspace, "kind"> | undefined) =>
  !!workspace && workspace.kind !== "personal";
