// Writing mail (ADR 0021): staged uploads, new mail, replies and forwards. Sends go to the outbox
// like every other action; the mail service streams attachments from R2 into the MIME. On a
// shared inbox the mail is from the inbox's address with the agent's name.
import type { SendAttachment, SendPayload } from "@omni/contracts";
import {
  createUpload,
  deleteUnsentUpload,
  forMember,
  invalidSendAttachments,
  markUploadsUsed,
  memberMailbox,
  memberUpload,
  newUploadId,
  senderIdentity,
  threadActionTargets,
  uploadKey,
  type MailActionRequest,
} from "@omni/db";
import { sendAttachmentSchema } from "@omni/contracts";
import { forwardBody, forwardSubject, replySubject } from "@omni/mail-core/compose";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { limitPerMember } from "../rate-limiter.ts";
import { zValidator } from "../validator.ts";
import { attachmentResponse } from "./assets.ts";
import {
  enqueue,
  idempotencyHeader,
  notFound,
  outboxKey,
  pingLater,
  type ActionMailbox,
} from "./mail.ts";

/** An upload nobody sends is deleted after this long. */
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

const address = z.email();
const recipients = z.array(address).max(100);
const attachmentList = z.array(sendAttachmentSchema).max(50).default([]);

const sendBody = z.object({
  mailboxId: z.string().min(1),
  to: recipients.min(1),
  cc: recipients.optional(),
  bcc: recipients.optional(),
  subject: z.string().max(998),
  text: z.string().max(1_000_000),
  html: z.string().max(2_000_000).optional(),
  attachments: attachmentList,
});

const replyBody = z.object({
  text: z.string().min(1).max(1_000_000),
  html: z.string().max(2_000_000).optional(),
  replyAll: z.boolean().default(false),
  /** The message replied to (`messages.id`); the thread's latest when absent. */
  messageId: z.string().min(1).optional(),
  /** Recipients the composer edited; absent means the reply (or reply-all) defaults. */
  to: recipients.min(1).optional(),
  cc: recipients.optional(),
  bcc: recipients.optional(),
  attachments: attachmentList,
});

const forwardBodySchema = z.object({
  /** The message forwarded (`messages.id`); the thread's latest when absent. */
  messageId: z.string().min(1).optional(),
  to: recipients.min(1),
  cc: recipients.optional(),
  bcc: recipients.optional(),
  text: z.string().max(1_000_000).default(""),
  html: z.string().max(2_000_000).optional(),
  /** Keep the original's files (not its inline images). On by default. */
  includeAttachments: z.boolean().default(true),
  /** Files added to the forward. */
  attachments: attachmentList,
});

const uploadQuery = z.object({
  mailboxId: z.string().min(1),
  filename: z.string().trim().min(1).max(255),
});

/** Chosen here so a send can return it before the mail goes out. */
function newMessageId(address: string) {
  const domain = address.slice(address.lastIndexOf("@") + 1);
  return `<${crypto.randomUUID()}@${domain}>`;
}

/**
 * A retried request finds the action it already wrote, so it answers with that send's
 * Message-ID, not the fresh one it just made. The thread's message carries the same id once
 * the mail service stores the sent copy.
 */
function sendResponse(action: { id: string; payload: Record<string, unknown> }) {
  return {
    actionId: action.id,
    messageIdHeader: (action.payload as SendPayload).messageId ?? null,
  };
}

/** The From display name: the agent, and on a shared inbox the team they write for. */
async function fromName(c: Context<AppEnv>, mailboxKind: "personal" | "shared") {
  const identity = await senderIdentity(c.var.db, c.var.member.id);
  if (!identity?.name) return undefined;
  return mailboxKind === "shared" ? `${identity.name} from ${identity.orgName}` : identity.name;
}

/**
 * Queues one send. Refuses (400) attachments the mailbox may not carry, and marks the uploads it
 * takes as used so the expiry cleanup leaves them for the mail service.
 */
async function enqueueSend(
  c: Context<AppEnv>,
  mailbox: ActionMailbox & { kind: "personal" | "shared" },
  payload: Omit<SendPayload, "fromName" | "messageId" | "attachments"> & {
    attachments: SendAttachment[];
  },
  key: string,
) {
  const { attachments, ...rest } = payload;
  const invalid = await invalidSendAttachments(c.var.db, mailbox.mailboxId, attachments);
  if (invalid.length) {
    throw new HTTPException(400, { message: "attachments not available to this mailbox" });
  }
  const name = await fromName(c, mailbox.kind);
  const request: MailActionRequest = {
    kind: "send",
    payload: {
      ...rest,
      ...(name ? { fromName: name } : {}),
      ...(attachments.length ? { attachments } : {}),
      messageId: newMessageId(payload.from),
    },
  };
  const action = await enqueue(c, mailbox, request, outboxKey(c, key, "send"));
  await markUploadsUsed(
    c.var.db,
    attachments.flatMap((a) => (a.kind === "upload" ? [a.uploadId] : [])),
  );
  pingLater(c);
  return action;
}

/** Drops empty optional recipient lists so payloads stay as small as before. */
function optionalList(name: "cc" | "bcc", list: string[] | undefined) {
  return list?.length ? { [name]: list } : {};
}

/** The thread with the chosen message (or its latest), and where its actions run. */
async function threadMessage(c: Context<AppEnv>, threadId: string, messageId?: string) {
  const [thread, found] = await Promise.all([
    forMember(c.var.db, c.var.member.id).getThread(threadId),
    threadActionTargets(c.var.db, c.var.member.id, threadId),
  ]);
  const message = messageId
    ? thread?.messages.find((m) => m.id === messageId)
    : thread?.messages.at(-1);
  if (!thread || !found || !message) notFound();
  return { found, message };
}

export const compose = new Hono<AppEnv>()
  /**
   * Stages a file for a send: the raw request body (with its `content-type` and a
   * `content-length` up to `UPLOAD_MAX_BYTES`) is streamed into R2. Unsent uploads expire after
   * a day. Answers the upload to list in a send's `attachments` as `{ kind: "upload", uploadId }`.
   */
  .post("/uploads", limitPerMember("actions"), zValidator("query", uploadQuery), async (c) => {
    const { mailboxId, filename } = c.req.valid("query");
    const size = Number(c.req.header("content-length"));
    if (!Number.isSafeInteger(size) || size <= 0) {
      return c.json({ error: "content-length required", requestId: c.var.requestId }, 411);
    }
    if (size > c.var.config.UPLOAD_MAX_BYTES) {
      return c.json(
        {
          error: `file is larger than ${c.var.config.UPLOAD_MAX_BYTES} bytes`,
          requestId: c.var.requestId,
        },
        413,
      );
    }
    const body = c.req.raw.body;
    if (!body) return c.json({ error: "empty body", requestId: c.var.requestId }, 400);
    const mailbox = await memberMailbox(c.var.db, c.var.member.id, mailboxId);
    if (!mailbox) notFound();

    const id = newUploadId();
    const r2Key = uploadKey({ orgId: mailbox.orgId, mailboxId, id });
    const mimeType =
      c.req.header("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    // A fixed-length stream errors if the body is longer or shorter than declared, so the cap
    // holds whatever the client sends.
    const { readable, writable } = new FixedLengthStream(size);
    const [stored] = await Promise.all([
      c.env.MAIL_BUCKET.put(r2Key, readable, { httpMetadata: { contentType: mimeType } }),
      body.pipeTo(writable),
    ]);
    if (!stored) throw new Error("upload was not stored");
    const upload = await createUpload(c.var.db, {
      id,
      orgId: mailbox.orgId,
      mailboxId,
      memberId: c.var.member.id,
      filename,
      mimeType,
      size,
      r2Key,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
    });
    return c.json(
      {
        id: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        size: upload.size,
        expiresAt: upload.expiresAt,
      },
      201,
    );
  })

  /** A staged file, for the composer's preview. Downloads unless it is a raster image. */
  .get("/uploads/:id", async (c) => {
    const upload = await memberUpload(c.var.db, c.var.member.id, c.req.param("id"));
    if (!upload) notFound();
    const object = await c.env.MAIL_BUCKET.get(upload.r2Key);
    if (!object) notFound();
    return attachmentResponse(object, upload);
  })

  /** Removes a staged file the composer dropped. A file a send already took stays. */
  .delete("/uploads/:id", async (c) => {
    const r2Key = await deleteUnsentUpload(c.var.db, c.var.member.id, c.req.param("id"));
    if (!r2Key) notFound();
    c.executionCtx.waitUntil(c.env.MAIL_BUCKET.delete(r2Key));
    return c.body(null, 204);
  })

  .post(
    "/send",
    limitPerMember("send"),
    zValidator("header", idempotencyHeader),
    zValidator("json", sendBody),
    async (c) => {
      const key = c.req.valid("header")["idempotency-key"];
      const { mailboxId, cc, bcc, ...message } = c.req.valid("json");
      const mailbox = await memberMailbox(c.var.db, c.var.member.id, mailboxId);
      if (!mailbox) notFound();
      const action = await enqueueSend(
        c,
        { orgId: mailbox.orgId, mailboxId: mailbox.id, kind: mailbox.kind },
        {
          from: mailbox.address,
          ...message,
          ...optionalList("cc", cc),
          ...optionalList("bcc", bcc),
        },
        key,
      );
      return c.json(sendResponse(action), 202);
    },
  )

  /**
   * Replies to `messageId` (default: the latest message) with In-Reply-To and References so it
   * threads everywhere. Recipients default to the sender (reply) or everyone on it (reply all);
   * `to`, `cc` and `bcc` replace them when the composer changed them.
   */
  .post(
    "/threads/:id/reply",
    limitPerMember("send"),
    zValidator("header", idempotencyHeader),
    zValidator("json", replyBody),
    async (c) => {
      const key = c.req.valid("header")["idempotency-key"];
      const body = c.req.valid("json");
      const { found, message } = await threadMessage(c, c.req.param("id"), body.messageId);

      const self = found.mailboxAddress.toLowerCase();
      const isSelf = (a: string) => a.toLowerCase() === self;
      // Replying to our own message continues to the same people.
      const fromUs = isSelf(message.fromAddress);
      const defaultTo = fromUs ? message.to.map((a) => a.address) : [message.fromAddress];
      const defaultCc = body.replyAll
        ? [...(fromUs ? [] : message.to), ...message.cc]
            .map((a) => a.address)
            .filter((a) => !isSelf(a) && !defaultTo.includes(a))
        : [];
      const to = body.to ?? defaultTo;
      const cc = body.to || body.cc ? (body.cc ?? []) : defaultCc;

      const action = await enqueueSend(
        c,
        { orgId: found.orgId, mailboxId: found.mailboxId, kind: found.mailboxKind },
        {
          from: found.mailboxAddress,
          to,
          ...optionalList("cc", cc),
          ...optionalList("bcc", body.bcc),
          subject: replySubject(message.subject),
          text: body.text,
          ...(body.html ? { html: body.html } : {}),
          inReplyTo: message.messageIdHeader,
          references: [...message.references, message.messageIdHeader],
          inReplyToMessageId: message.id,
          attachments: body.attachments,
        },
        key,
      );
      // TODO(B1): applyAgentReply(db, { threadId, memberId }) once the workflow layer merges.
      return c.json(sendResponse(action), 202);
    },
  )

  /**
   * Forwards `messageId` (default: the latest message) with what the agent wrote above it and,
   * unless `includeAttachments` is false, its files by reference: the mail service copies them
   * from R2, nothing is uploaded again. Threads with the original in Omni, not for the recipient.
   */
  .post(
    "/threads/:id/forward",
    limitPerMember("send"),
    zValidator("header", idempotencyHeader),
    zValidator("json", forwardBodySchema),
    async (c) => {
      const key = c.req.valid("header")["idempotency-key"];
      const body = c.req.valid("json");
      const { found, message } = await threadMessage(c, c.req.param("id"), body.messageId);
      const kept: SendAttachment[] = body.includeAttachments
        ? message.attachments
            .filter((a) => !a.inline)
            .map((a) => ({ kind: "attachment", attachmentId: a.id }))
        : [];
      const content = forwardBody(
        { text: body.text, ...(body.html !== undefined ? { html: body.html } : {}) },
        {
          fromName: message.fromName,
          fromAddress: message.fromAddress,
          to: message.to,
          cc: message.cc,
          sentAt: message.sentAt,
          subject: message.subject,
          text: message.cleanText,
        },
      );

      const action = await enqueueSend(
        c,
        { orgId: found.orgId, mailboxId: found.mailboxId, kind: found.mailboxKind },
        {
          from: found.mailboxAddress,
          to: body.to,
          ...optionalList("cc", body.cc),
          ...optionalList("bcc", body.bcc),
          subject: forwardSubject(message.subject),
          ...content,
          inReplyToMessageId: message.id,
          attachments: [...kept, ...body.attachments],
        },
        key,
      );
      return c.json(sendResponse(action), 202);
    },
  );
