// The workspace's AI settings (ADR 0033): what each member handles, which triage reads to assign a
// shared inbox's conversations, and what each shared inbox's tags are for. Owners and admins of a
// company only, like the rest of the workspace admin surface.
import {
  listMemberRoleDescriptions,
  listSharedInboxTags,
  listWorkspaceMembers,
  MAX_ROLE_DESCRIPTION,
  setMemberRoleDescription,
  setTagDescription,
} from "@omni/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { requireCompanyManager } from "../inbox-admin.ts";
import { zValidator } from "../validator.ts";

/** A tag's description, as long as a role's. Blank clears it. */
const descriptionBody = z.object({ description: z.string().max(MAX_ROLE_DESCRIPTION) });

export const aiSettings = new Hono<AppEnv>()
  .use("/workspace/ai", requireCompanyManager)
  .use("/workspace/ai/*", requireCompanyManager)

  /** Everyone in the workspace with their role, and every shared inbox with its tags. */
  .get("/workspace/ai", async (c) => {
    const { db, member } = c.var;
    const [people, roles, inboxes] = await Promise.all([
      listWorkspaceMembers(db, member.orgId),
      listMemberRoleDescriptions(db, member.orgId),
      listSharedInboxTags(db, member.orgId),
    ]);
    return c.json({
      members: people.map((person) => ({
        id: person.id,
        user: person.user,
        sharedInboxes: person.sharedInboxes,
        roleDescription: roles.get(person.id) ?? null,
      })),
      sharedInboxes: inboxes,
    });
  })

  /** Sets what a member handles; blank clears it, and AI then never assigns them. */
  .put("/workspace/ai/members/:memberId/role", zValidator("json", descriptionBody), async (c) => {
    const { description } = c.req.valid("json");
    const found = await setMemberRoleDescription(
      c.var.db,
      c.var.member.orgId,
      c.req.param("memberId"),
      description,
    );
    if (!found) throw new HTTPException(404, { message: "no such member in this workspace" });
    return c.json({ roleDescription: description.trim() || null });
  })

  /** Sets what the team files under a shared inbox's tag; blank clears it. */
  .put("/workspace/ai/tags/:tagId/description", zValidator("json", descriptionBody), async (c) => {
    const tag = await setTagDescription(
      c.var.db,
      c.var.member.orgId,
      c.req.param("tagId"),
      c.req.valid("json").description,
    );
    if (!tag) throw new HTTPException(404, { message: "no such tag in this workspace" });
    return c.json({ tag });
  });
