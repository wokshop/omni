// The workspace this tab is in: the one its URL names (`/<slug>/…`, ADR 0043). Every API call
// names it (`omni-workspace`), so the Worker answers for this tab's workspace even after another
// tab switched the session's. Set by the `$workspace` route before anything below it loads.
import { WORKSPACE_HEADER } from "@omni/client";

let current: string | undefined;

/** The organization id this tab's URL names, once a workspace route has resolved it. */
export const currentWorkspaceId = () => current;

export function setCurrentWorkspaceId(id: string | undefined) {
  current = id;
}

/**
 * For pages outside any workspace (onboarding, joining, an invitation): their calls name none, so
 * the Worker answers for the session's, which is the one they set up or join.
 */
export function leaveWorkspace(preload: boolean) {
  if (!preload) current = undefined;
}

/** The header every API call carries: none before a workspace route resolved one. */
export function workspaceHeaders(): Record<string, string> {
  return current ? { [WORKSPACE_HEADER]: current } : {};
}
