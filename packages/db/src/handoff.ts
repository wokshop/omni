// Hand-off (ADR 0030, ADR 0032): a teammate answers a shared conversation from their own personal
// mailbox and carries it on one-to-one there. The send is queued on the personal mailbox, and in
// the same transaction the shared conversation gets a `handoff` event, its timeline line. Nothing
// else about the conversation changes: its status and owner stay as they were, and it stays in
// each teammate's Inbox until they mark it done (ADR 0032). Cancelling the send inside its undo
// window removes the event: the hand-off never happened.
//
// Idempotent: a retried request finds its send and its event and changes nothing more.
import type { SendAttachment } from "@omni/contracts";
import { and, eq } from "drizzle-orm";
import type { Db } from "./client.ts";
import { enqueueSendWithAttachments } from "./compose.ts";
import {
  lockConversation,
  type ConversationRow,
  type Status,
  type Tx,
} from "./conversation-core.ts";
import { applyStatus, assign } from "./conversations.ts";
import { conversationEvents } from "./schema/index.ts";
import type { NewMailAction } from "./writers.ts";

/** What a `handoff` event remembers: where the conversation went on, and the send that took it. */
interface HandoffData {
  mailboxId: string;
  address: string;
  actionId: string;
  /**
   * Only on hand-offs made before ADR 0032, which assigned and resolved the conversation: the
   * status and owner a cancelled send puts back.
   */
  previous?: { status: Status; assigneeMemberId: string | null };
}

const handoffKey = (actionId: string) => `handoff:${actionId}`;

/**
 * Queues the reply on the personal mailbox and records that `memberId` carried the shared
 * conversation `threadId` on there, in one transaction. The send's `payload.handoffThreadId` must
 * be `threadId`.
 */
export async function enqueueHandoff(
  db: Db,
  input: {
    threadId: string;
    memberId: string;
    send: NewMailAction & { kind: "send" };
    attachments: SendAttachment[];
    delaySeconds: number;
  },
) {
  return db.transaction(async (tx) => {
    // Locked first, so the event and a teammate's change to the conversation never interleave.
    const locked = await lockConversation(tx, input.threadId, input.memberId);
    if (!locked) return { ok: false as const, reason: "not_found" as const };
    const { kind, ...row } = locked;
    if (kind !== "shared") return { ok: false as const, reason: "personal_mailbox" as const };
    const queued = await enqueueSendWithAttachments(tx, input.send, input.attachments, {
      delaySeconds: input.delaySeconds,
    });
    // Nothing was written: the attachments are not the personal mailbox's to send.
    if ("invalid" in queued) return { ok: false as const, reason: "invalid_attachments" as const };
    // Only a draft send can find its draft gone, and a hand-off sends no draft.
    if (!("action" in queued)) return { ok: false as const, reason: "not_found" as const };
    const applied = await recordHandoff(tx, row, input.memberId, queued.action.id, input.send);
    return { ok: true as const, action: queued.action, ...applied };
  });
}

async function recordHandoff(
  tx: Tx,
  row: ConversationRow,
  memberId: string,
  actionId: string,
  send: NewMailAction,
) {
  const [written] = await tx
    .insert(conversationEvents)
    .values({
      orgId: row.orgId,
      mailboxId: row.mailboxId,
      threadId: row.id,
      actorMemberId: memberId,
      kind: "handoff",
      data: {
        mailboxId: send.mailboxId,
        address: (send.payload as { from: string }).from,
        actionId,
      } satisfies HandoffData,
      dedupeKey: handoffKey(actionId),
    })
    .onConflictDoNothing()
    .returning({ id: conversationEvents.id });
  // `changed`: a new timeline line for everyone watching. A retry writes nothing.
  return { conversation: row, changed: !!written, queuedActions: 0 };
}

/**
 * The send of a hand-off was cancelled (inside `cancelSend`'s transaction): the hand-off never
 * happened, so its event goes. A hand-off made before ADR 0032 (its event has `previous`) also
 * assigned and resolved the conversation: that one goes back to the team, reopened and with its
 * previous assignee, unless someone changed it since (it is no longer resolved, or no longer the
 * sender's). A send never sent answered nobody, so it reopens to `open` whatever it was before.
 */
export async function undoHandoff(
  tx: Tx,
  input: { threadId: string; actionId: string; memberId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const locked = await lockConversation(tx, input.threadId, null);
  if (!locked || locked.kind !== "shared") return null;
  const { kind: _kind, ...row } = locked;
  const mine = and(
    eq(conversationEvents.threadId, row.id),
    eq(conversationEvents.dedupeKey, handoffKey(input.actionId)),
    eq(conversationEvents.actorMemberId, input.memberId),
  );
  const [event] = await tx
    .select({ data: conversationEvents.data })
    .from(conversationEvents)
    .where(mine);
  if (!event) return null;
  const { previous } = event.data as unknown as HandoffData;
  if (!previous) {
    await tx.delete(conversationEvents).where(mine);
    return { conversation: row, changed: true, queuedActions: 0, notified: [] as string[] };
  }
  if (row.status !== "resolved" || row.assigneeMemberId !== input.memberId) {
    return { conversation: row, changed: false, queuedActions: 0, notified: [] as string[] };
  }
  const cause = { cause: "handoff_cancelled" };
  const reopened =
    previous.status === "resolved"
      ? { row, changed: false, queuedActions: 0 }
      : await applyStatus(tx, row, { type: "reopen" }, now, input.memberId, {
          data: cause,
          dedupeKey: `handoff_cancelled:${input.actionId}`,
        });
  const reassigned = await assign(
    tx,
    reopened.row,
    previous.assigneeMemberId,
    input.memberId,
    now,
    cause,
  );
  return {
    conversation: reassigned.row,
    changed: reopened.changed || reassigned.changed,
    queuedActions: reopened.queuedActions,
    /** Whoever had it before and got an `assigned` notification back: tell them in realtime. */
    notified: reassigned.notified ?? [],
  };
}
