// Request headers shared by the Worker and its clients.

/**
 * The workspace (organization id) a request is for. The web app sends the one in its URL, so two
 * tabs can be in two workspaces at once (ADR 0043); the Worker answers as the user's member there,
 * or 403 when they have none. Without it, the session's active organization is used, as before.
 * Member-scoped answers carry it back, naming the workspace they were read from.
 */
export const WORKSPACE_HEADER = "omni-workspace";
