import { randomUUID } from "node:crypto";
import type { Client } from "@modelcontextprotocol/client";
import { CANVAS_TYPE, sceneFromJson, sceneToJson, type CanvasElement } from "@omni/canvas";
import { afterAll, beforeAll, expect, test } from "vitest";
import { connectAgent } from "./mcp-support.ts";
import { startStorageStack, type Person, type StorageStack } from "./storage-support.ts";
import { WEB_ORIGIN } from "./support.ts";

let stack: StorageStack;
beforeAll(async () => {
  stack = await startStorageStack({
    vars: { WEB_APP_URL: WEB_ORIGIN, RATE_LIMIT_AUTH: "off", RATE_LIMIT_ACTIONS: "off" },
  });
}, 120_000);
afterAll(() => stack?.stop());

const WRITE = "openid mail:read drive:read drive:write";

type Answer = Record<string, unknown> & { error?: string };

async function call(agent: Client, name: string, args: Record<string, unknown>) {
  const result = await agent.callTool({ name, arguments: args });
  if (result.isError) return { error: (result.content as { text: string }[])[0]!.text } as Answer;
  return result.structuredContent as Answer;
}

async function person() {
  const org = await stack.company(`canvas-${randomUUID().slice(0, 8)}`);
  const ana = await stack.member(org.id);
  return { ana, agent: await connectAgent(stack.worker.url, ana.jar, { scope: WRITE }) };
}

async function body(who: Person, nodeId: string) {
  const text = await (await stack.download(who.jar, nodeId)).text();
  const read = sceneFromJson(text);
  if (!read.ok) throw new Error(read.error);
  return { text, scene: read.scene };
}

const byText = (elements: CanvasElement[], text: string) =>
  elements.find((element) => element.text === text)!;

async function roofPlan(agent: Client) {
  const made = await call(agent, "drive_create_canvas", {
    name: "Roof repair",
    space: "shared",
    ops: [
      { op: "frame", title: "Q1 plan", ref: "plan" },
      { op: "add", kind: "sticky", text: "Call the roofer", parent: "plan", ref: "call" },
      {
        op: "add",
        kind: "sticky",
        text: "Order tiles",
        place: { near: "call", side: "right" },
        ref: "tiles",
      },
      { op: "move", ids: ["tiles"], into: "plan" },
      { op: "connect", from: "call", to: "tiles", text: "then", ref: "then" },
    ],
  });
  expect(made).not.toHaveProperty("error");
  return made as Answer & { canvas: { id: string }; created: Record<string, string> };
}

test("an agent's canvas is a canvas named without an extension, one element per line, its refs wired and kept after an edit", async () => {
  const { ana, agent } = await person();
  const made = await roofPlan(agent);
  expect(made.canvas).toMatchObject({ title: "Roof repair", mime_type: CANVAS_TYPE });
  const { plan, call: callId, tiles, then } = made.created;
  expect(Object.keys(made.created).toSorted()).toEqual(["call", "plan", "then", "tiles"]);

  const saved = await body(ana, made.canvas.id);
  expect(saved.text).toBe(sceneToJson(saved.scene));
  expect(saved.text.split("\n").filter((line) => line.startsWith('    {"id"'))).toHaveLength(4);
  expect(saved.scene.elements.map((element) => element.id)).toEqual([plan, callId, tiles, then]);
  expect(byText(saved.scene.elements, "then")).toMatchObject({
    kind: "connector",
    from: { id: callId },
    to: { id: tiles },
  });
  expect(byText(saved.scene.elements, "Order tiles")).toMatchObject({ parent: plan });

  const edited = await call(agent, "drive_edit_canvas", {
    id: made.canvas.id,
    ops: [{ op: "update", id: tiles, text: "Order blue tiles", color: "blue" }],
  });
  expect(edited).toMatchObject({ canvas: { mime_type: CANVAS_TYPE, title: "Roof repair" } });
  expect(edited.changed).toBe(
    `# in frame ${plan} "Q1 plan"\n- sticky ${tiles} blue [280,80 200×200] "Order blue tiles"`,
  );

  const fetched = await call(agent, "drive_fetch", { id: made.canvas.id });
  expect(fetched.text).toBe(
    [
      `Canvas "Roof repair" · 4 elements · 1 frame · board 0,0 to 800,600`,
      `# frame ${plan} "Q1 plan" [0,0 800×600]`,
      `- sticky ${callId} yellow [40,80 200×200] "Call the roofer"`,
      `- sticky ${tiles} blue [280,80 200×200] "Order blue tiles"`,
      `- connector ${then} ${callId} → ${tiles} straight "then"`,
    ].join("\n"),
  );
});

test("an edit that misses changes nothing and answers with the canvas as it is now", async () => {
  const { ana, agent } = await person();
  const made = await roofPlan(agent);
  const before = await body(ana, made.canvas.id);

  const missed = await call(agent, "drive_edit_canvas", {
    id: made.canvas.id,
    ops: [
      { op: "update", id: made.created.call, text: "Call the roofer today" },
      { op: "delete", ids: ["nope"] },
    ],
  });
  expect(missed.error).toContain('Operation 2 (delete): No element "nope" on the canvas.');
  expect(missed.error).toContain(
    `- sticky ${made.created.call} yellow [40,80 200×200] "Call the roofer"`,
  );
  expect((await body(ana, made.canvas.id)).text).toBe(before.text);
});

test("an agent places things by their neighbours and is told when its layout collides", async () => {
  const { agent } = await person();
  const made = await roofPlan(agent);
  const { call: callId, tiles } = made.created;
  const edited = await call(agent, "drive_edit_canvas", {
    id: made.canvas.id,
    ops: [
      {
        op: "add",
        kind: "sticky",
        text: "Below",
        place: { near: callId, side: "below" },
        ref: "below",
      },
      { op: "add", kind: "sticky", text: "On top", at: { x: 300, y: 100 }, ref: "ontop" },
    ],
  });
  const { below, ontop } = edited.created as Record<string, string>;
  expect(edited.changed).toContain(`- sticky ${below} yellow [40,320 200×200] "Below"`);
  expect(edited.overlaps).toEqual([[ontop, tiles]]);
});

test("a canvas past its limits is refused whole", async () => {
  const { ana, agent } = await person();
  const made = await roofPlan(agent);
  const before = await body(ana, made.canvas.id);

  const many = Array.from({ length: 201 }, (_, i) => ({ op: "add", kind: "sticky", text: `${i}` }));
  const tooMany = await call(agent, "drive_edit_canvas", { id: made.canvas.id, ops: many });
  expect(tooMany.error).toBeDefined();

  const elements = Array.from({ length: 2_001 }, (_, i) => ({
    id: `s${i}`,
    kind: "sticky",
    box: [i * 10, 0, 10, 10],
  }));
  const huge = JSON.stringify({ omni: "canvas", v: 1, elements });
  const tooBig = await call(agent, "drive_edit_canvas", { id: made.canvas.id, scene: huge });
  expect(tooBig.error).toContain("A canvas holds at most 2000 elements; this would make 2001.");
  expect((await body(ana, made.canvas.id)).text).toBe(before.text);
});

test("deleting what a connector points at leaves the line where it was drawn", async () => {
  const { ana, agent } = await person();
  const made = (await call(agent, "drive_create_canvas", {
    name: "Flow",
    ops: [
      { op: "add", kind: "sticky", text: "From", at: { x: 0, y: 0 }, ref: "from" },
      { op: "add", kind: "sticky", text: "To", at: { x: 400, y: 0 }, ref: "to" },
      { op: "connect", from: "from", to: "to", ref: "line" },
    ],
  })) as Answer & { canvas: { id: string }; created: Record<string, string> };
  const deleted = await call(agent, "drive_edit_canvas", {
    id: made.canvas.id,
    ops: [{ op: "delete", ids: [made.created.to] }],
  });
  expect(deleted).not.toHaveProperty("error");
  const line = (await body(ana, made.canvas.id)).scene.elements.find((e) => e.kind === "connector");
  expect(line).toMatchObject({
    from: { id: made.created.from, at: [200, 100] },
    to: { at: [400, 100] },
  });
  expect(line!.to).not.toHaveProperty("id");
});

test("an edit to a canvas whose nested groups thinned out keeps what was inside them", async () => {
  const { ana, agent } = await person();
  const json = JSON.stringify({
    omni: "canvas",
    v: 1,
    elements: [
      { id: "kept", kind: "sticky", parent: "inner", box: [0, 0, 200, 200], text: "Inside" },
      { id: "inner", kind: "group", parent: "outer" },
      { id: "outer", kind: "group" },
    ],
  });
  const node = await stack.upload(
    ana.jar,
    { space: "personal" },
    "Groups",
    new TextEncoder().encode(json),
    CANVAS_TYPE,
  );
  const edited = await call(agent, "drive_edit_canvas", {
    id: node.id,
    ops: [{ op: "update", id: "kept", color: "pink" }],
  });
  expect(edited).not.toHaveProperty("error");
  expect((await body(ana, node.id)).scene.elements).toEqual([
    { id: "kept", kind: "sticky", box: [0, 0, 200, 200], color: "pink", text: "Inside" },
  ]);
});
