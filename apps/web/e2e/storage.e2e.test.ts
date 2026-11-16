// Storage in the web app (ADR 0034 step 6), in a real Chromium, on the web app built and served by
// the real Worker under `wrangler dev` (its local R2), on a real Postgres: a file larger than one
// part goes up through the page's own file input and comes back byte for byte.
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  createMailbox,
  createOrg,
  createTestDatabase,
  signIn,
  startMailServiceEndpoint,
  startWorkerWithNetwork,
  SYSTEM_MAIL_FROM,
  type TestDb,
} from "../../worker/e2e/support.ts";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let db: TestDb;
let mailService: Awaited<ReturnType<typeof startMailServiceEndpoint>>;
let worker: Awaited<ReturnType<typeof startWorkerWithNetwork>>;
let browser: Browser;
let context: BrowserContext | undefined;

beforeAll(async () => {
  database = await createTestDatabase();
  db = database.db;
  mailService = await startMailServiceEndpoint();
  const port = await freePort();
  worker = await startWorkerWithNetwork({
    databaseUrl: database.url,
    mailServiceUrl: mailService.url,
    port,
    vars: { BETTER_AUTH_URL: `http://127.0.0.1:${port}` },
  });
  const system = await createOrg(db, "system");
  await createMailbox(db, system.id, SYSTEM_MAIL_FROM);
  browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
  await worker?.close();
  await mailService?.close();
  await database?.teardown();
});

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Catches: the browser's upload client cutting parts wrong (an off-by-one slice, a last part of
// the wrong length, a part skipped when several go at once), so a file over one part never
// completes or downloads corrupted.
test("a file larger than one part uploads from the page and downloads byte for byte", async () => {
  const origin = String(worker.url);
  const cookie = await signIn({ url: new URL(origin) }, db, `files-${Date.now()}@gmail.test`);
  context = await browser.newContext({ acceptDownloads: true });
  await context.addCookies(
    cookie.split("; ").map((pair) => {
      const at = pair.indexOf("=");
      return { name: pair.slice(0, at), value: pair.slice(at + 1), url: origin };
    }),
  );
  const page = await context.newPage();
  await page.goto(new URL("/files/my", origin).toString());

  // Two full parts and a short third: 16 MiB, 16 MiB, 1234 bytes.
  const bytes = randomBytes(2 * 16 * 1024 * 1024 + 1234);
  const parts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT") parts.push(request.url().split("/parts/")[1] ?? "");
  });
  await page.getByRole("button", { name: "Upload", exact: true }).waitFor({ timeout: 15_000 });
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "footage.bin", mimeType: "application/octet-stream", buffer: bytes });
  await page.getByRole("row", { name: /footage\.bin/ }).waitFor({ timeout: 60_000 });
  expect(parts.toSorted()).toEqual(["1", "2", "3"]);

  await page.getByRole("button", { name: "Actions for footage.bin" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("footage.bin");
  const saved = await readFile(await download.path());
  expect(saved.byteLength).toBe(bytes.byteLength);
  expect(sha256(saved)).toBe(sha256(bytes));
}, 120_000);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
