import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { listUnsubscribes, type unsubscribeKind } from "../schema/index.ts";

type UnsubscribeKind = (typeof unsubscribeKind.enumValues)[number];

/**
 * Records that a mailbox left `sender`'s list. Pressing it again later moves `unsubscribed_at`
 * forward, so mail the list sent in between reads as left too. The caller has checked the grant.
 */
export async function recordUnsubscribe(
  db: Db,
  input: {
    orgId: string;
    mailboxId: string;
    sender: string;
    kind: UnsubscribeKind;
    memberId: string;
  },
) {
  const sender = input.sender.toLowerCase();
  await db
    .insert(listUnsubscribes)
    .values({ ...input, sender })
    .onConflictDoUpdate({
      target: [listUnsubscribes.mailboxId, listUnsubscribes.sender],
      set: {
        kind: input.kind,
        memberId: input.memberId,
        unsubscribedAt: sql`now()`,
      },
    });
}

/** When the mailbox last left each of `senders`' lists, by lowercased sender. */
export async function unsubscribedSenders(db: Db, mailboxId: string, senders: readonly string[]) {
  const wanted = [...new Set(senders.map((s) => s.toLowerCase()))];
  if (wanted.length === 0) return new Map<string, Date>();
  const rows = await db
    .select({ sender: listUnsubscribes.sender, at: listUnsubscribes.unsubscribedAt })
    .from(listUnsubscribes)
    .where(
      and(eq(listUnsubscribes.mailboxId, mailboxId), inArray(listUnsubscribes.sender, wanted)),
    );
  return new Map(rows.map((row) => [row.sender, row.at]));
}
