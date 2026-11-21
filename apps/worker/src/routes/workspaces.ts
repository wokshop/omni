import { ensurePersonalSpace, listUserWorkspaces } from "@omni/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { resolveSession, type AppEnv } from "../context.ts";

export const workspaces = new Hono<AppEnv>().get("/", async (c) => {
  const resolved = await resolveSession(c);
  if (!resolved) throw new HTTPException(401, { message: "sign in first" });
  const { user } = resolved;
  const includePersonal = c.req.query("include") === "personal";
  const list = () => listUserWorkspaces(c.var.db, user.id, { includePersonal });
  let found = await list();
  let activeOrganizationId = resolved.member?.orgId ?? null;
  // WARNING: expand step for iOS builds that hang on an empty list; remove once they are gone.
  if (
    includePersonal &&
    c.req.query("personal") !== "on-demand" &&
    !user.scopeOrgId &&
    found.length === 0
  ) {
    activeOrganizationId = await ensurePersonalSpace(c.var.db, user.id);
    found = await list();
  }
  return c.json({
    activeOrganizationId,
    workspaces: found.filter((workspace) => !user.scopeOrgId || workspace.id === user.scopeOrgId),
    scopedTo: user.scopeOrgId,
  });
});
