import { and, eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import { mailboxes } from "../schema/index.ts";
import { ownedPersonalMailbox } from "./forwarding.ts";

/**
 * Sets what the user calls one of their own personal inboxes ("Work") and the From name mail
 * from it carries ("Rodrigo @ Chow Mein"); an absent field is left as it is, null clears it.
 * False when the mailbox is not a personal one they own.
 */
export async function setInboxNames(
  db: Db,
  input: {
    userId: string;
    scopeOrgId?: string | null;
    mailboxId: string;
    label?: string | null;
    senderName?: string | null;
  },
) {
  const rows = await db
    .update(mailboxes)
    .set({
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.senderName !== undefined ? { senderName: input.senderName } : {}),
    })
    .where(
      and(eq(mailboxes.id, input.mailboxId), ownedPersonalMailbox(input.userId, input.scopeOrgId)),
    )
    .returning({ id: mailboxes.id });
  return rows.length > 0;
}

/** The From name set on a mailbox, or null. */
export async function mailboxSenderName(db: Db, mailboxId: string) {
  const [row] = await db
    .select({ senderName: mailboxes.senderName })
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId));
  return row?.senderName ?? null;
}
