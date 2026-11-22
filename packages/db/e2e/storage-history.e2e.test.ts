import { eq } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { forMember } from "../src/for-member.ts";
import { storageDocBaselines, storageDocChanges } from "../src/schema/index.ts";
import { purgeDocHistory, writeDocJournal, type DocRun } from "../src/storage.ts";
import { addFile } from "./storage-support.ts";
import { createMember, createOrg, createTestDatabase } from "./support.ts";

const { db, teardown } = await createTestDatabase();
afterAll(teardown);

const DAY_MS = 24 * 60 * 60_000;

const run = (firstSeq: number, endedDaysAgo: number) => {
  const at = new Date(Date.now() - endedDaysAgo * DAY_MS);
  const made: DocRun = {
    firstSeq,
    lastSeq: firstSeq,
    by: "m:x",
    authorName: null,
    agent: null,
    startedAt: at,
    endedAt: at,
    update: "AA==",
  };
  return made;
};

test("the purge drops old runs and the baselines no remaining run needs, but keeps the one they start from", async () => {
  const org = await createOrg(db, "history-purge");
  const member = await createMember(db, org.id, "ana");
  const file = await addFile(forMember(db, member.id).storage, { space: "personal" }, "a.md", 3);
  const write = (
    runs: DocRun[],
    baseline: { seq: number; state: string } | null,
    lastSeq: number,
  ) =>
    writeDocJournal(db, {
      orgId: org.id,
      nodeId: file.id,
      epoch: 0,
      lastSeq,
      contentVersion: 1,
      runs,
      baseline,
      sinceBaseline: 0,
    });
  await write([run(1, 40), run(2, 40)], { seq: 0, state: "seed" }, 2);
  await write([run(3, 35)], { seq: 2, state: "checkpoint-2" }, 3);
  await write([run(4, 1)], { seq: 3, state: "checkpoint-3" }, 4);
  await write([run(4, 1)], null, 4);
  await db
    .update(storageDocBaselines)
    .set({ createdAt: new Date(Date.now() - 40 * DAY_MS) })
    .where(eq(storageDocBaselines.nodeId, file.id));

  expect(await purgeDocHistory(db, new Date(Date.now() - 30 * DAY_MS))).toBe(3);

  const runs = await db
    .select({ firstSeq: storageDocChanges.firstSeq })
    .from(storageDocChanges)
    .where(eq(storageDocChanges.nodeId, file.id));
  expect(runs).toEqual([{ firstSeq: 4 }]);
  const kept = await db
    .select({ seq: storageDocBaselines.seq })
    .from(storageDocBaselines)
    .where(eq(storageDocBaselines.nodeId, file.id));
  expect(kept).toEqual([{ seq: 3 }]);
});
