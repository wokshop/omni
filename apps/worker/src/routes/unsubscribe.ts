// Leaves a mailing list from the message it sent (List-Unsubscribe). One-click lists (RFC 8058)
// get their POST from here, without the reader's cookies or IP; a mailto list gets its message
// through the outbox like any send. A list that only offers a page is opened by the app.
import { unsubscribeMethod } from "@omni/mail-core/unsubscribe";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { apiError } from "../errors.ts";
import { limitPerMember } from "../rate-limiter.ts";
import { zValidator } from "../validator.ts";
import { enqueueSend, sendResponse, threadMessage } from "./compose.ts";
import { idempotencyHeader } from "./mail.ts";

/** How long the list's server has to answer the one-click POST. */
const POST_TIMEOUT_MS = 10_000;

const unsubscribeBody = z.object({
  /** The list message (`messages.id`); the thread's latest when absent. */
  messageId: z.string().min(1).optional(),
});

export const unsubscribe = new Hono<AppEnv>().post(
  "/threads/:id/unsubscribe",
  limitPerMember("send"),
  zValidator("header", idempotencyHeader),
  zValidator("json", unsubscribeBody),
  async (c) => {
    const { found, message } = await threadMessage(c, c.req.param("id"), c.req.valid("json"));
    const method = unsubscribeMethod(message.listUnsubscribe, message.listUnsubscribeOneClick);
    if (!method || method.kind === "link") {
      return apiError(c, "unprocessable_entity", "this message has no one-step unsubscribe");
    }
    if (method.kind === "mail") {
      const action = await enqueueSend(
        c,
        { orgId: found.orgId, mailboxId: found.mailboxId, kind: found.mailboxKind },
        {
          from: found.mailboxAddress,
          to: [method.to],
          subject: method.subject,
          text: method.body,
          attachments: [],
        },
        c.req.valid("header")["idempotency-key"],
      );
      return c.json({ kind: "mail" as const, ...sendResponse(action) }, 202);
    }
    const answer = await fetch(method.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    }).catch(() => null);
    if (!answer?.ok) {
      return apiError(c, "bad_gateway", "the list did not accept the unsubscribe");
    }
    return c.json({ kind: "post" as const }, 200);
  },
);
