// The workspace's AI settings (ADR 0033): what each member handles, and the tags triage chooses
// from with what the team files under each. Read by the settings page and by the AI queue.

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import { mailboxAccess, mailboxes, memberRoleDescriptions, members, tags } from "./schema/index.ts";
import { orgMember } from "./workspace-mailboxes.ts";

/** A role description's longest form; the settings page and the API cap it here. */
export const MAX_ROLE_DESCRIPTION = 500;
/** At most this many teammates are offered to triage for one inbox. */
export const HELPDESK_TEAMMATES_FOR_AI = 10;

/** Every member's role description in the workspace, by member id. */
export async function listMemberRoleDescriptions(db: Db, orgId: string) {
  const rows = await db
    .select({
      memberId: memberRoleDescriptions.memberId,
      description: memberRoleDescriptions.description,
    })
    .from(memberRoleDescriptions)
    .where(eq(memberRoleDescriptions.orgId, orgId));
  return new Map(rows.map((row) => [row.memberId, row.description]));
}

/**
 * Sets what a member of the workspace handles; blank clears it, and then AI never assigns them.
 * False when they are not a member of `orgId`. Idempotent.
 */
export async function setMemberRoleDescription(
  db: Db,
  orgId: string,
  memberId: string,
  description: string,
) {
  if (!(await orgMember(db, orgId, memberId))) return false;
  const text = description.trim();
  if (!text) {
    await db
      .delete(memberRoleDescriptions)
      .where(
        and(eq(memberRoleDescriptions.memberId, memberId), eq(memberRoleDescriptions.orgId, orgId)),
      );
    return true;
  }
  await db
    .insert(memberRoleDescriptions)
    .values({ memberId, orgId, description: text })
    .onConflictDoUpdate({
      target: memberRoleDescriptions.memberId,
      set: { description: text, orgId, updatedAt: new Date() },
    });
  return true;
}

/**
 * Who triage may hand a shared inbox's conversation to: members of its org who can see it and
 * have a role description, ordered by that description (stable across workspaces and ids, so the
 * same team always sends the same request).
 */
export async function helpdeskTeammatesForAi(db: Db, mailboxId: string) {
  return db
    .select({ id: members.id, role: memberRoleDescriptions.description })
    .from(mailboxAccess)
    .innerJoin(mailboxes, eq(mailboxes.id, mailboxAccess.mailboxId))
    .innerJoin(
      members,
      and(eq(members.id, mailboxAccess.memberId), eq(members.organizationId, mailboxes.orgId)),
    )
    .innerJoin(
      memberRoleDescriptions,
      and(
        eq(memberRoleDescriptions.memberId, members.id),
        eq(memberRoleDescriptions.orgId, mailboxes.orgId),
      ),
    )
    .where(eq(mailboxAccess.mailboxId, mailboxId))
    .orderBy(asc(sql`lower(${memberRoleDescriptions.description})`), asc(members.id))
    .limit(HELPDESK_TEAMMATES_FOR_AI);
}

/** The workspace's shared inboxes with their tags, as the AI settings page lists them. */
export async function listSharedInboxTags(db: Db, orgId: string) {
  const inboxes = await db
    .select({ id: mailboxes.id, address: mailboxes.address })
    .from(mailboxes)
    .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.kind, "shared")))
    .orderBy(asc(mailboxes.address));
  if (inboxes.length === 0) return [];
  const rows = await db
    .select({
      id: tags.id,
      mailboxId: tags.mailboxId,
      name: tags.name,
      color: tags.color,
      description: tags.description,
    })
    .from(tags)
    .where(
      and(
        eq(tags.orgId, orgId),
        inArray(
          tags.mailboxId,
          inboxes.map((inbox) => inbox.id),
        ),
      ),
    )
    .orderBy(asc(sql`lower(${tags.name})`), asc(tags.id));
  return inboxes.map((inbox) => ({
    ...inbox,
    tags: rows
      .filter((tag) => tag.mailboxId === inbox.id)
      .map(({ mailboxId: _mailboxId, ...tag }) => tag),
  }));
}

/** Sets what the team files under a tag of the workspace; blank clears it. Null when not found. */
export async function setTagDescription(db: Db, orgId: string, tagId: string, description: string) {
  const [tag] = await db
    .update(tags)
    .set({ description: description.trim() || null, updatedAt: new Date() })
    .where(and(eq(tags.id, tagId), eq(tags.orgId, orgId)))
    .returning({ id: tags.id, name: tags.name, color: tags.color, description: tags.description });
  return tag ?? null;
}
