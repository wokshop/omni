import { type StorageHistoryResponse, type StorageHistorySessionResponse } from "@omni/contracts";
import { blockCounts, diffBlocks } from "@omni/docs";
import { STORAGE_VERSION_DAYS, type DocSession } from "@omni/db";
import { Hono } from "hono";
import type { AppEnv } from "../context.ts";
import { memberStorage, refused } from "./http.ts";

type Files = ReturnType<typeof memberStorage>;

const kindOf = (by: string) => {
  const kind: "agent" | "member" | "unknown" = by.startsWith("a:")
    ? "agent"
    : by.startsWith("m:")
      ? "member"
      : "unknown";
  return kind;
};

const wireSession = (session: DocSession, held: { versionId: string | null } | null) => ({
  id: session.id,
  startedAt: session.startedAt.toISOString(),
  endedAt: session.endedAt.toISOString(),
  authors: session.authors.map((author) => ({
    kind: kindOf(author.by),
    name: author.name,
    agent: author.agent,
  })),
  contentVersion: session.contentVersion,
  restorable: !!held,
  versionId: held?.versionId ?? null,
});

async function textAt(c: { env: Env }, files: Files, nodeId: string, contentVersion: number) {
  const held = await files.contentAt(nodeId, contentVersion);
  const object = held ? await c.env.STORAGE_BUCKET.get(held.r2Key) : null;
  return object ? await object.text() : null;
}

/** A doc's History: its editing sessions from the journal, and what each one changed. */
export const storageHistory = new Hono<AppEnv>()
  .get("/files/:id/history", async (c) => {
    const files = memberStorage(c);
    const nodeId = c.req.param("id");
    const listed = await files.history(nodeId);
    if (listed.status !== "ok") return refused(c, listed.status);
    const sessions = await Promise.all(
      listed.sessions.map(async (session) =>
        wireSession(session, await files.contentAt(nodeId, session.contentVersion)),
      ),
    );
    return c.json({ sessions, keepDays: STORAGE_VERSION_DAYS } satisfies StorageHistoryResponse);
  })

  .get("/files/:id/history/:sessionId", async (c) => {
    const files = memberStorage(c);
    const { id: nodeId, sessionId } = c.req.param();
    const listed = await files.history(nodeId);
    if (listed.status !== "ok") return refused(c, listed.status);
    const at = listed.sessions.findIndex((session) => session.id === sessionId);
    const session = listed.sessions[at];
    if (!session) return refused(c, "not_found");
    const older = listed.sessions[at + 1];
    const held = await files.contentAt(nodeId, session.contentVersion);
    const [after, before] = await Promise.all([
      textAt(c, files, nodeId, session.contentVersion),
      textAt(c, files, nodeId, older?.contentVersion ?? session.contentVersion - 1),
    ]);
    if (after === null) return refused(c, "not_found");
    const blocks = diffBlocks(before ?? "", after);
    return c.json({
      session: wireSession(session, held),
      blocks,
      counts: blockCounts(blocks),
    } satisfies StorageHistorySessionResponse);
  });
