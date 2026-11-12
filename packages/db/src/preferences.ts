// A member's settings and phones (ADR 0021): notification channels per kind, theme, undo-send
// window, and Expo push tokens. No preferences row means every default.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import {
  memberPreferences,
  members,
  notificationKind,
  pushTokens,
  type NotificationChannels,
} from "./schema/index.ts";

export type NotificationKind = (typeof notificationKind.enumValues)[number];
export const NOTIFICATION_KINDS = notificationKind.enumValues;

const ALL_ON: NotificationChannels = { realtime: true, desktop: true, push: true };

/** The member's settings with every default filled in. */
export async function memberSettings(db: Db, memberId: string) {
  const [row] = await db
    .select()
    .from(memberPreferences)
    .where(eq(memberPreferences.memberId, memberId));
  const stored = row?.notifications ?? {};
  return {
    notifications: Object.fromEntries(
      NOTIFICATION_KINDS.map((kind) => [kind, { ...ALL_ON, ...stored[kind] }]),
    ) as Record<NotificationKind, NotificationChannels>,
    theme: row?.theme ?? "system",
    undoSendSeconds: row?.undoSendSeconds ?? 5,
  };
}

export interface SettingsPatch {
  notifications?: Partial<Record<NotificationKind, Partial<NotificationChannels>>>;
  theme?: "system" | "light" | "dark";
  undoSendSeconds?: number;
}

/**
 * Changes only what `patch` names; a notification kind merges channel by channel, so turning
 * off desktop for mentions leaves push for mentions as it was.
 */
export async function updateMemberSettings(db: Db, memberId: string, patch: SettingsPatch) {
  const current = await memberSettings(db, memberId);
  const notifications = { ...current.notifications };
  for (const [kind, channels] of Object.entries(patch.notifications ?? {})) {
    notifications[kind as NotificationKind] = {
      ...notifications[kind as NotificationKind],
      ...channels,
    };
  }
  const values = {
    notifications,
    theme: patch.theme ?? current.theme,
    undoSendSeconds: patch.undoSendSeconds ?? current.undoSendSeconds,
  };
  await db
    .insert(memberPreferences)
    .values({
      memberId,
      orgId: sql`(select ${members.organizationId} from ${members} where ${members.id} = ${memberId})`,
      ...values,
    })
    .onConflictDoUpdate({
      target: memberPreferences.memberId,
      set: { ...values, updatedAt: new Date() },
    });
  return memberSettings(db, memberId);
}

/**
 * Registers a phone for push. A token belongs to one member at a time: signing in as someone
 * else on the same phone moves it to them.
 */
export async function registerPushToken(
  db: Db,
  member: { id: string; orgId: string },
  token: { expoToken: string; device: string | null },
) {
  await db
    .insert(pushTokens)
    .values({ orgId: member.orgId, memberId: member.id, ...token })
    .onConflictDoUpdate({
      target: pushTokens.expoToken,
      set: {
        orgId: member.orgId,
        memberId: member.id,
        device: token.device,
        updatedAt: new Date(),
      },
    });
}

/** Removes the member's own token (sign-out). False when it isn't theirs. */
export async function unregisterPushToken(db: Db, memberId: string, expoToken: string) {
  const rows = await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.expoToken, expoToken), eq(pushTokens.memberId, memberId)))
    .returning({ id: pushTokens.id });
  return rows.length > 0;
}
