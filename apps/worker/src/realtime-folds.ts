import type { StorageDocEvent } from "@omni/contracts";
import { addCoauthors, type StorageCoauthor, type StorageNode } from "@omni/db";
import { openDb } from "./db.ts";
import { createLogger } from "./log.ts";
import { allOutsiders, OUTSIDE_SWEEP_MS, outsideOf, recheckOutsider } from "./realtime-outside.ts";
import { modules } from "./modules.ts";

/** The pause after an outsider's last record before the Worker saves the doc, as a tab waits. */
export const FOLD_MS = 2000;
/** And never later than this after the first record it owes a save for. */
export const FOLD_MAX_MS = 10_000;
const RETRY_MS = 5000;
const MAX_TRIES = 5;
/** What outsiders may add to one doc's stream in an hour. */
export const OUTSIDE_BYTES_PER_HOUR = 20 * 1024 * 1024;

interface Owed {
  orgId: string;
  firstAt: number;
  dueAt: number;
  tries: number;
  authors: Record<string, FoldAuthor>;
}

/** An outsider whose records a save holds, and the last of them it holds. */
export interface FoldAuthor extends StorageCoauthor {
  lastSeq: number;
}

const owedKey = (nodeId: string) => `owed:${nodeId}`;
const bytesKey = (nodeId: string) => `bytes:${nodeId}`;

/**
 * Counts `bytes` an outsider adds to the doc's stream this hour; false when that would pass
 * `OUTSIDE_BYTES_PER_HOUR`, which keeps a link from growing a stream without bound.
 */
export async function takeBytes(ctx: DurableObjectState, nodeId: string, bytes: number) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const used = await ctx.storage.get<{ hour: number; bytes: number }>(bytesKey(nodeId));
  const now = used?.hour === hour ? used.bytes : 0;
  if (now + bytes > OUTSIDE_BYTES_PER_HOUR) return false;
  await ctx.storage.put(bytesKey(nodeId), { hour, bytes: now + bytes });
  return true;
}

/** The doc owes a save for an outsider's record: due `FOLD_MS` later, `FOLD_MAX_MS` at most. */
export async function noteOwed(
  ctx: DurableObjectState,
  input: { nodeId: string; orgId: string; by: string; author: FoldAuthor },
) {
  const now = Date.now();
  const owed = (await ctx.storage.get<Owed>(owedKey(input.nodeId))) ?? {
    orgId: input.orgId,
    firstAt: now,
    dueAt: now,
    tries: 0,
    authors: {},
  };
  owed.authors[input.by] = input.author;
  owed.dueAt = Math.min(now + FOLD_MS, owed.firstAt + FOLD_MAX_MS);
  await ctx.storage.put(owedKey(input.nodeId), owed);
  await scheduleAlarm(ctx);
}

/**
 * A member's tab saved the doc through record `s` as `contentVersion`: the outsiders whose
 * records that holds are its coauthors, and the doc no longer owes a save for them.
 */
export async function settleOwed(
  ctx: DurableObjectState,
  env: Env,
  fold: { nodeId: string; contentVersion: number; s: number },
) {
  const owed = await ctx.storage.get<Owed>(owedKey(fold.nodeId));
  if (!owed) return;
  const held = Object.entries(owed.authors).filter(([, author]) => author.lastSeq <= fold.s);
  if (held.length === 0) return;
  const { db, close } = openDb(env, 1);
  try {
    await addCoauthors(db, {
      nodeId: fold.nodeId,
      contentVersion: fold.contentVersion,
      coauthors: held.map(([, { kind, id, name }]) => ({ kind, id, name })),
    });
  } finally {
    await close({ timeout: 0 });
  }
  for (const [by] of held) delete owed.authors[by];
  if (Object.keys(owed.authors).length === 0) await ctx.storage.delete(owedKey(fold.nodeId));
  else await ctx.storage.put(owedKey(fold.nodeId), owed);
}

/**
 * Sets the object's alarm for its next job: the soonest save a doc owes, the next sweep of its
 * outsiders while any is connected, or the soonest time an outsider's door closes on its own.
 */
export async function scheduleAlarm(ctx: DurableObjectState) {
  const owed = await ctx.storage.list<Owed>({ prefix: "owed:" });
  const times = [...owed.values()].map((one) => one.dueAt);
  const outsiders = allOutsiders(ctx);
  if (outsiders.length > 0) times.push(Date.now() + OUTSIDE_SWEEP_MS);
  for (const socket of outsiders) {
    const endsAt = outsideOf(socket)?.endsAt;
    if (endsAt) times.push(endsAt);
  }
  if (times.length === 0) return;
  const next = Math.min(...times);
  const current = await ctx.storage.getAlarm();
  if (current === null || current > next || current < Date.now()) {
    await ctx.storage.setAlarm(Math.max(next, Date.now() + 50));
  }
}

/**
 * The object's alarm: checks every outsider again, then saves each doc whose save is due. A
 * failed save is tried again `RETRY_MS` later, `MAX_TRIES` times, then dropped with a log line:
 * the records stay in the stream for the next save, a member's or the Worker's.
 */
export async function runAlarm(
  ctx: DurableObjectState,
  env: Env,
  saved: (nodeId: string, node: StorageNode, events: StorageDocEvent[]) => Promise<void>,
) {
  await Promise.all(allOutsiders(ctx).map((socket) => recheckOutsider(env, socket)));
  const log = createLogger({ component: "realtime" });
  const owed = await ctx.storage.list<Owed>({ prefix: "owed:" });
  for (const [key, one] of owed) {
    if (one.dueAt > Date.now()) continue;
    const nodeId = key.slice("owed:".length);
    try {
      const fold = modules.find((one) => one.foldLive)?.foldLive;
      if (!fold) throw new Error("realtime: no module saves live documents");
      const outcome = await fold(env, {
        orgId: one.orgId,
        nodeId,
        authors: Object.values(one.authors),
      });
      if (outcome.status === "saved") await saved(nodeId, outcome.node, outcome.events);
      if (outcome.status === "refused") {
        log.warn("doc.fold_refused", { nodeId, reason: outcome.reason });
      }
      const now = await ctx.storage.get<Owed>(key);
      if (now?.dueAt === one.dueAt) await ctx.storage.delete(key);
    } catch (error) {
      log.error("doc.fold_failed", { error, nodeId, tries: one.tries + 1 });
      if (one.tries + 1 >= MAX_TRIES) await ctx.storage.delete(key);
      else
        await ctx.storage.put(key, { ...one, tries: one.tries + 1, dueAt: Date.now() + RETRY_MS });
    }
  }
  await scheduleAlarm(ctx);
}
