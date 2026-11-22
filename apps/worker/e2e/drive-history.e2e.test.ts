import { randomUUID } from "node:crypto";
import { liveMarkdown, rewriteLive } from "@omni/docs";
import { schema } from "@omni/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import * as Y from "yjs";
import { base64, bytes, call, editor, S2, trim, WRITE } from "./live-support.ts";
import { connectAgent } from "./mcp-support.ts";
import { startStorageStack, type StorageStack } from "./storage-support.ts";
import { WEB_ORIGIN, type CookieJar } from "./support.ts";

let stack: StorageStack;
beforeAll(async () => {
  stack = await startStorageStack({
    vars: {
      WEB_APP_URL: WEB_ORIGIN,
      RATE_LIMIT_AUTH: "off",
      RATE_LIMIT_ACTIONS: "off",
      S2_BASIN_URL: S2.url,
      S2_BASIN: S2.basin,
    },
  });
}, 120_000);
afterAll(() => stack?.stop());

async function save(jar: CookieJar, nodeId: string, text: string, base: number) {
  const body = bytes(text);
  const opened = await stack.api(jar, "POST", `/files/${nodeId}/versions`, {
    size: body.length,
    mimeType: "text/markdown",
    ifContentVersion: base,
  });
  expect(opened.status).toBe(201);
  const { id } = opened.body.upload as { id: string };
  const part = await stack.putPart(jar, id, 1, body);
  expect(part.status).toBe(200);
  const done = await stack.api(jar, "POST", `/uploads/${id}/complete`);
  expect(done.status).toBe(200);
}

const changesOf = (nodeId: string) =>
  stack.db
    .select()
    .from(schema.storageDocChanges)
    .where(eq(schema.storageDocChanges.nodeId, nodeId))
    .orderBy(asc(schema.storageDocChanges.firstSeq));

test("a doc's change log outlives its stream: runs by author in the order typed, over the seed, written once", async () => {
  const org = await stack.company(`history-${randomUUID().slice(0, 8)}`);
  const ana = await stack.member(org.id);
  const bo = await stack.member(org.id);
  const first = "# Plan\n\nIntro";
  const doc = await stack.upload(ana.jar, { space: "shared" }, "plan.md", bytes(first));
  const [anaTab, boTab] = [
    await editor(stack, ana.jar, doc.id),
    await editor(stack, bo.jar, doc.id),
  ];

  const page = new Y.Doc();
  const seed = base64(rewriteLive(page, first));
  const epoch = await anaTab.append({ t: "seed", cv: 1, u: seed }, 0);
  const typed = [
    [anaTab, `${first}\n\nAna's line`],
    [boTab, `${first}\n\nAna's line\n\nBo's line`],
    [anaTab, `${first}\n\nAna's line\n\nBo's line, Ana edits it`],
    [anaTab, `${first}\n\nAna's line, twice\n\nBo's line, Ana edits it`],
  ] as const;
  for (const [tab, text] of typed) {
    await tab.append({ t: "update", e: epoch, u: base64(rewriteLive(page, text)) });
  }
  const last = typed.at(-1)![1];
  await save(ana.jar, doc.id, last, 1);

  await expect.poll(async () => (await changesOf(doc.id)).length, { timeout: 10_000 }).toBe(3);
  const runs = await changesOf(doc.id);
  expect(runs.map((run) => [run.by, run.authorName, run.firstSeq, run.lastSeq])).toEqual([
    [`m:${ana.id}`, ana.email, epoch + 1, epoch + 1],
    [`m:${bo.id}`, bo.email, epoch + 2, epoch + 2],
    [`m:${ana.id}`, ana.email, epoch + 3, epoch + 4],
  ]);
  const baselines = await stack.db
    .select()
    .from(schema.storageDocBaselines)
    .where(eq(schema.storageDocBaselines.nodeId, doc.id));
  expect(baselines.map((b) => [b.epoch, b.seq, b.state])).toEqual([[epoch, epoch, seed]]);

  const replayed = new Y.Doc();
  Y.applyUpdate(replayed, Buffer.from(baselines[0]!.state, "base64"));
  for (const run of runs) Y.applyUpdate(replayed, Buffer.from(run.update, "base64"));
  expect(liveMarkdown(replayed)).toBe(last);

  await trim(doc.id, epoch + 5);
  expect(await stack.cron("* * * * *")).toBe("ok");
  expect(await changesOf(doc.id)).toEqual(runs);
  for (const tab of [anaTab, boTab]) tab.socket.close();
});

test("typing left in an epoch when a new one starts is journaled before the journal moves on", async () => {
  const org = await stack.company(`epochs-${randomUUID().slice(0, 8)}`);
  const ana = await stack.member(org.id);
  const first = "# Notes\n\nOne";
  const doc = await stack.upload(ana.jar, { space: "shared" }, "notes.md", bytes(first));
  const tab = await editor(stack, ana.jar, doc.id);
  const page = new Y.Doc();
  const epoch = await tab.append({ t: "seed", cv: 1, u: base64(rewriteLive(page, first)) }, 0);
  const saved = `${first}\n\nTwo`;
  await tab.append({ t: "update", e: epoch, u: base64(rewriteLive(page, saved)) });
  await save(ana.jar, doc.id, saved, 1);
  await expect.poll(async () => (await changesOf(doc.id)).length, { timeout: 10_000 }).toBe(1);

  const left = await tab.append({
    t: "update",
    e: epoch,
    u: base64(rewriteLive(page, `${saved}\n\nThree, never saved`)),
  });
  const next = new Y.Doc();
  const newer = await tab.append({ t: "seed", cv: 2, u: base64(rewriteLive(next, saved)) });
  expect(await stack.cron("* * * * *")).toBe("ok");
  await save(ana.jar, doc.id, `${saved}\n\nFour`, 2);
  await expect
    .poll(async () => (await changesOf(doc.id)).map((run) => [run.epoch, run.firstSeq]))
    .toContainEqual([epoch, left]);
  const journalEpoch = async () =>
    (
      await stack.db
        .select({ epoch: schema.storageDocJournals.epoch })
        .from(schema.storageDocJournals)
        .where(eq(schema.storageDocJournals.nodeId, doc.id))
    )[0]?.epoch;
  await expect.poll(journalEpoch, { timeout: 10_000 }).toBe(newer);
  tab.socket.close();
});

test("History lists sessions newest first with who wrote in them, and an agent's edit as its own session, diffed by block", async () => {
  const org = await stack.company(`sessions-${randomUUID().slice(0, 8)}`);
  const ana = await stack.member(org.id);
  const bo = await stack.member(org.id);
  const outsider = await stack.member(
    (await stack.company(`other-${randomUUID().slice(0, 8)}`)).id,
  );
  const first = "# Launch\n\nBook the venue";
  const doc = await stack.upload(ana.jar, { space: "shared" }, "launch.md", bytes(first));
  const [anaTab, boTab] = [
    await editor(stack, ana.jar, doc.id),
    await editor(stack, bo.jar, doc.id),
  ];
  const page = new Y.Doc();
  const epoch = await anaTab.append({ t: "seed", cv: 1, u: base64(rewriteLive(page, first)) }, 0);
  const people = `${first}\n\nSend invites\n\nOrder food`;
  await anaTab.append({
    t: "update",
    e: epoch,
    u: base64(rewriteLive(page, `${first}\n\nSend invites`)),
  });
  const typedTo = await boTab.append({
    t: "update",
    e: epoch,
    u: base64(rewriteLive(page, people)),
  });
  await save(ana.jar, doc.id, people, 1);
  await anaTab.append({ t: "fold", e: epoch, cv: 2, s: typedTo });
  await expect.poll(async () => (await changesOf(doc.id)).length, { timeout: 10_000 }).toBe(2);

  const agent = await connectAgent(stack.worker.url, ana.jar, { scope: WRITE });
  const edited = await call(agent, "drive_edit_doc", {
    id: doc.id,
    edits: [{ find: "Order food", replace: "Order food for forty" }],
  });
  expect(edited).not.toHaveProperty("error");
  await expect.poll(async () => (await changesOf(doc.id)).length, { timeout: 10_000 }).toBe(3);

  const listed = await stack.api(ana.jar, "GET", `/files/${doc.id}/history`);
  expect(listed.status).toBe(200);
  expect(listed.body).toMatchObject({
    keepDays: 30,
    sessions: [
      {
        authors: [{ kind: "agent", name: ana.email, agent: "Drive agent" }],
        contentVersion: 3,
        restorable: true,
      },
      {
        authors: [
          { kind: "member", name: ana.email, agent: null },
          { kind: "member", name: bo.email, agent: null },
        ],
        contentVersion: 2,
        restorable: true,
      },
    ],
  });
  const [byAgent, byPeople] = listed.body.sessions as { id: string }[];

  const agentDiff = await stack.api(ana.jar, "GET", `/files/${doc.id}/history/${byAgent!.id}`);
  expect(agentDiff.body.counts).toEqual({ added: 0, removed: 0, changed: 1 });
  expect(agentDiff.body.blocks).toContainEqual(
    expect.objectContaining({
      kind: "changed",
      before: "Order food",
      after: "Order food for forty",
    }),
  );
  const peopleDiff = await stack.api(ana.jar, "GET", `/files/${doc.id}/history/${byPeople!.id}`);
  expect(peopleDiff.body.counts).toEqual({ added: 2, removed: 0, changed: 0 });

  expect((await stack.api(outsider.jar, "GET", `/files/${doc.id}/history`)).status).toBe(404);
  for (const tab of [anaTab, boTab]) tab.socket.close();
});

test("an agent's edit of a doc nobody has open is in its History too, named for the agent", async () => {
  const org = await stack.company(`quiet-${randomUUID().slice(0, 8)}`);
  const ana = await stack.member(org.id);
  const doc = await stack.upload(ana.jar, { space: "shared" }, "notes.md", bytes("# Notes\n\nOne"));
  const agent = await connectAgent(stack.worker.url, ana.jar, { scope: WRITE });
  const edited = await call(agent, "drive_edit_doc", {
    id: doc.id,
    markdown: "# Notes\n\nOne\n\nTwo",
  });
  expect(edited).not.toHaveProperty("error");
  await expect.poll(async () => (await changesOf(doc.id)).length, { timeout: 10_000 }).toBe(1);

  const listed = await stack.api(ana.jar, "GET", `/files/${doc.id}/history`);
  expect(listed.body.sessions).toMatchObject([
    { authors: [{ kind: "agent", name: ana.email, agent: "Drive agent" }], contentVersion: 2 },
  ]);
  const [only] = listed.body.sessions as { id: string }[];
  const diff = await stack.api(ana.jar, "GET", `/files/${doc.id}/history/${only!.id}`);
  expect(diff.body.counts).toEqual({ added: 1, removed: 0, changed: 0 });
  expect(await call(agent, "drive_versions", { id: doc.id })).toMatchObject({
    sessions: [{ id: only!.id, authors: [{ name: ana.email, agent: "Drive agent" }] }],
  });
});

test("a session's diff is rebuilt from the journal: from before its first save, per session when journaled late, and unavailable once its baseline is gone", async () => {
  const org = await stack.company(`replay-${randomUUID().slice(0, 8)}`);
  const ana = await stack.member(org.id);
  const first = "# Plan\n\nStart";
  const doc = await stack.upload(ana.jar, { space: "shared" }, "plan.md", bytes(first));
  const tab = await editor(stack, ana.jar, doc.id);
  const page = new Y.Doc();
  const epoch = await tab.append({ t: "seed", cv: 1, u: base64(rewriteLive(page, first)) }, 0);
  const one = `${first}\n\nOne`;
  const two = `${one}\n\nTwo`;
  let at = await tab.append({ t: "update", e: epoch, u: base64(rewriteLive(page, one)) });
  await save(ana.jar, doc.id, one, 1);
  await tab.append({ t: "fold", e: epoch, cv: 2, s: at });
  await expect.poll(async () => (await changesOf(doc.id)).length, { timeout: 10_000 }).toBe(1);
  at = await tab.append({ t: "update", e: epoch, u: base64(rewriteLive(page, two)) });
  await save(ana.jar, doc.id, two, 2);
  await tab.append({ t: "fold", e: epoch, cv: 3, s: at });
  await expect.poll(async () => (await changesOf(doc.id)).length, { timeout: 10_000 }).toBe(2);

  const sessionsOf = async () =>
    (await stack.api(ana.jar, "GET", `/files/${doc.id}/history`)).body.sessions as {
      id: string;
      versionId: string | null;
    }[];
  const diffOf = async (id: string) =>
    (await stack.api(ana.jar, "GET", `/files/${doc.id}/history/${id}`)).body;
  const [both] = await sessionsOf();
  expect(await diffOf(both!.id)).toMatchObject({
    available: true,
    counts: { added: 2, removed: 0, changed: 0 },
  });

  const [, second] = await changesOf(doc.id);
  await stack.db
    .update(schema.storageDocChanges)
    .set({
      startedAt: new Date(Date.now() + 10 * 60_000),
      endedAt: new Date(Date.now() + 10 * 60_000),
    })
    .where(eq(schema.storageDocChanges.id, second!.id));
  await stack.db
    .update(schema.storageDocChanges)
    .set({ contentVersion: 3 })
    .where(eq(schema.storageDocChanges.nodeId, doc.id));
  const late = await sessionsOf();
  expect(late).toHaveLength(2);
  expect(late.map((s) => s.versionId)).toEqual([null, null]);
  expect((await diffOf(late[0]!.id)).blocks).toEqual([
    { kind: "same", text: "# Plan" },
    { kind: "same", text: "Start" },
    { kind: "same", text: "One" },
    { kind: "added", text: "Two" },
  ]);
  expect((await diffOf(late[1]!.id)).counts).toEqual({ added: 1, removed: 0, changed: 0 });

  await stack.db
    .delete(schema.storageDocBaselines)
    .where(eq(schema.storageDocBaselines.nodeId, doc.id));
  expect(await diffOf(late[1]!.id)).toMatchObject({ available: false, blocks: [] });
  tab.socket.close();
});
