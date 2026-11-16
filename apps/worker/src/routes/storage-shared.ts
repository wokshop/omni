// The link door (ADR 0034 decisions 3, 4 and 6), under `/api/storage/shared/:shareId`: what
// `/s/<shareId>` opens. A session is optional. Without one, only a link open to anyone answers,
// and only to list and download. With one, a person the item was shared with also gets in, by
// the grant door bounded to this link, and an Editor changes what is inside through the same
// routes a member uses (`storage-changes.ts`). Everything else is `404`, a Restricted link
// included: the answer never says whether a link exists.
//
// Mounted ahead of the member API, so the checks a member route gets from middleware are made
// here: the rate limit is per IP (`RATE_LIMIT_STORAGE_LINK`), and a change needs the shared
// node's workspace in good standing (ADR 0015), whatever workspace the person's own is.
import { storageSharedQuerySchema, type StorageSharedResponse } from "@omni/contracts";
import { forUser, publicStorage } from "@omni/db";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { inGoodStanding } from "../billing.ts";
import { resolveSession, type AppEnv } from "../context.ts";
import { checkRateLimit, clientIp, tooManyRequests } from "../rate-limiter.ts";
import { wireNode } from "../storage.ts";
import { zValidator } from "../validator.ts";
import { storageChanges } from "./storage-changes.ts";
import {
  decodeCursor,
  download,
  encodeCursor,
  fail,
  listCursor,
  refused,
  wireView,
  type SharedAccess,
} from "./storage-http.ts";

const open = createMiddleware<AppEnv>(async (c, next) => {
  const { db, config } = c.var;
  const wait = await checkRateLimit(c.env, config, "storageLink", clientIp(c.req.raw));
  if (wait) return tooManyRequests(wait);

  const shareId = c.req.param("shareId") ?? "";
  const session = await resolveSession(c);
  const granted = session
    ? forUser(db, session.user.id, session.user.scopeOrgId).storage.under(shareId)
    : null;
  const byGrant = (await granted?.nodeByShareId(shareId)) ?? null;
  const link = publicStorage(db, shareId);
  const root = byGrant ?? (await link.node());
  if (!root) return refused(c, "not_found");

  const shared: SharedAccess =
    byGrant && granted
      ? {
          root,
          node: granted.node,
          list: (parentId, page) => granted.list({ parentId }, page),
          file: granted.file,
          granted,
        }
      : {
          root,
          node: (nodeId) => link.node(nodeId),
          list: (parentId, page) => link.list({ parentId, ...page }),
          file: link.file,
          granted: null,
        };
  c.set("shared", shared);

  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    // A link alone never writes: an anonymous editor would be an open upload endpoint.
    if (!shared.granted) return refused(c, "forbidden");
    if (!(await inGoodStanding(db, config, root.node.orgId))) {
      return fail(
        c,
        402,
        "BILLING_INACTIVE",
        "this workspace is read-only until it has an active plan",
      );
    }
  }
  await next();
});

export const storageShared = new Hono<AppEnv>()
  .use("/:shareId/*", open)

  /** The shared node, or `?node=` inside it, and a folder's contents. */
  .get("/:shareId", zValidator("query", storageSharedQuerySchema), async (c) => {
    const { node, cursor, limit } = c.req.valid("query");
    const shared = c.var.shared!;
    const item = node ? await shared.node(node) : shared.root;
    if (!item) return refused(c, "not_found");
    if (item.node.kind !== "folder") {
      return c.json({
        item: wireView(item),
        nodes: [],
        nextCursor: null,
      } satisfies StorageSharedResponse);
    }
    const listed = await shared.list(item.node.id, {
      cursor: decodeCursor(cursor, listCursor),
      limit,
    });
    if (listed.status !== "ok") return refused(c, listed.status);
    return c.json({
      item: wireView(item),
      nodes: listed.nodes.map(wireNode),
      nextCursor: encodeCursor(listed.nextCursor),
    } satisfies StorageSharedResponse);
  })

  /** A shared file's bytes: the same download a member gets. */
  .get("/:shareId/files/:id/content", async (c) =>
    download(c, await c.var.shared!.file(c.req.param("id"))),
  )

  .route("/:shareId", storageChanges);
