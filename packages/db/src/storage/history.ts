import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { members, users } from "../schema/auth.ts";
import {
  storageContents,
  storageDocBaselines,
  storageDocChanges,
  storageDocJournals,
  storageNodes,
} from "../schema/storage.ts";

/** One run of a live document's change log, as the journal job writes it. */
export interface DocRun {
  firstSeq: number;
  lastSeq: number;
  by: string;
  authorName: string | null;
  agent: string | null;
  startedAt: Date;
  endedAt: Date;
  update: string;
}

/** Where a doc's journal stands; null when it has none yet. */
export async function docJournalOf(db: Db, nodeId: string) {
  const [row] = await db
    .select()
    .from(storageDocJournals)
    .where(eq(storageDocJournals.nodeId, nodeId));
  return row ?? null;
}

/**
 * Docs (Omni docs and Markdown files) whose content was written in the last day and moved past
 * their journal: the minute job's work list, for saves whose own journal run did not happen.
 */
export async function docsOwedJournal(db: Db, limit = 20) {
  return db
    .select({
      id: storageNodes.id,
      orgId: storageNodes.orgId,
      contentVersion: storageNodes.contentVersion,
    })
    .from(storageNodes)
    .innerJoin(storageContents, eq(storageContents.nodeId, storageNodes.id))
    .leftJoin(storageDocJournals, eq(storageDocJournals.nodeId, storageNodes.id))
    .where(
      and(
        eq(storageNodes.kind, "file"),
        isNull(storageNodes.trashedAt),
        sql`${storageContents.writtenAt} > now() - interval '1 day'`,
        or(
          sql`split_part(lower(${storageNodes.mimeType}), ';', 1) = 'text/vnd.omni.doc'`,
          sql`${storageNodes.name} ~* '\\.(md|markdown)$'`,
        ),
        or(
          isNull(storageDocJournals.nodeId),
          gt(storageNodes.contentVersion, storageDocJournals.contentVersion),
        ),
      ),
    )
    .orderBy(asc(storageContents.writtenAt))
    .limit(limit);
}

/** Names of these members now, by id. */
export async function memberNames(db: Db, memberIds: string[]) {
  if (memberIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: members.id, name: users.name })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(inArray(members.id, memberIds));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** The latest baseline of `epoch` at or before `seq`, and the runs after it through `seq`. */
export async function docReplayFrom(db: Db, nodeId: string, epoch: number, seq: number) {
  const [baseline] = await db
    .select()
    .from(storageDocBaselines)
    .where(
      and(
        eq(storageDocBaselines.nodeId, nodeId),
        eq(storageDocBaselines.epoch, epoch),
        lte(storageDocBaselines.seq, seq),
      ),
    )
    .orderBy(desc(storageDocBaselines.seq))
    .limit(1);
  if (!baseline) return null;
  const runs = await db
    .select()
    .from(storageDocChanges)
    .where(
      and(
        eq(storageDocChanges.nodeId, nodeId),
        eq(storageDocChanges.epoch, epoch),
        gt(storageDocChanges.firstSeq, baseline.seq),
        lte(storageDocChanges.lastSeq, seq),
      ),
    )
    .orderBy(asc(storageDocChanges.firstSeq));
  return { baseline, runs };
}

/**
 * Writes runs of `epoch` (and a baseline, when one is due) and moves the doc's journal to
 * `lastSeq`. Idempotent: a run or baseline already written is skipped, and a journal that is
 * already further on is left where it is.
 */
export async function writeDocJournal(
  db: Db,
  input: {
    orgId: string;
    nodeId: string;
    epoch: number;
    lastSeq: number;
    contentVersion: number;
    runs: DocRun[];
    baseline: { seq: number; state: string } | null;
    sinceBaseline: number;
  },
) {
  const { orgId, nodeId, epoch } = input;
  await db.transaction(async (tx) => {
    if (input.runs.length) {
      await tx
        .insert(storageDocChanges)
        .values(
          input.runs.map((run) => ({
            ...run,
            orgId,
            nodeId,
            epoch,
            contentVersion: input.contentVersion,
          })),
        )
        .onConflictDoNothing();
    }
    if (input.baseline) {
      await tx
        .insert(storageDocBaselines)
        .values({ orgId, nodeId, epoch, ...input.baseline })
        .onConflictDoNothing();
    }
    const at = {
      epoch,
      lastSeq: input.lastSeq,
      contentVersion: input.contentVersion,
      sinceBaseline: input.sinceBaseline,
      updatedAt: new Date(),
    };
    await tx
      .insert(storageDocJournals)
      .values({ nodeId, orgId, ...at })
      .onConflictDoUpdate({
        target: storageDocJournals.nodeId,
        set: at,
        setWhere: or(
          lt(storageDocJournals.epoch, epoch),
          and(eq(storageDocJournals.epoch, epoch), lte(storageDocJournals.lastSeq, input.lastSeq)),
        ),
      });
  });
}

/**
 * Deletes runs that ended before `before`, and the baselines no remaining run needs (every one
 * of an epoch older than its oldest remaining run, but the latest of those). The daily job's.
 */
export async function purgeDocHistory(db: Db, before: Date) {
  const gone = await db
    .delete(storageDocChanges)
    .where(lt(storageDocChanges.endedAt, before))
    .returning({ nodeId: storageDocChanges.nodeId });
  await db.execute(sql`
    delete from ${storageDocBaselines} b
    where b.created_at < ${before.toISOString()}::timestamptz
      and exists (
        select 1 from ${storageDocBaselines} newer
        where newer.node_id = b.node_id and newer.epoch = b.epoch and newer.seq > b.seq
          and newer.seq <= coalesce(
            (select min(c.first_seq) from ${storageDocChanges} c
              where c.node_id = b.node_id and c.epoch = b.epoch),
            2147483647)
      )`);
  return gone.length;
}
