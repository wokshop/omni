// Personal spaces in the web app (ADR 0024 step 5), in a real Chromium, on the web app built and
// served by the real Worker under `wrangler dev`, on a real Postgres: someone in no company works
// in their Personal space instead of being sent to create one, and its settings leave out the
// pages only a company has.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createOrgWithOwner } from "@omni/db";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
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
  await browser?.close();
  await worker?.close();
  await mailService?.close();
  await database?.teardown();
});

afterEach(async () => {
  await context?.close();
  context = undefined;
});

/** Signed in as `email` (a magic link, so a new address signs up), on `path`. */
async function signedIn(email: string, path: string): Promise<Page> {
  const origin = String(worker.url);
  const cookie = await signIn({ url: new URL(origin) }, db, email);
  context = await browser.newContext();
  await context.addCookies(
    cookie.split("; ").map((pair) => {
      const at = pair.indexOf("=");
      return { name: pair.slice(0, at), value: pair.slice(at + 1), url: origin };
    }),
  );
  const page = await context.newPage();
  await page.goto(new URL(path, origin).toString());
  return page;
}

/** The settings dialog's workspace pages, by title. */
async function settingsPages(page: Page) {
  const nav = page.getByRole("dialog");
  await nav.getByText("Inboxes", { exact: true }).first().waitFor();
  const titles = ["General", "People", "Inboxes", "Shared", "Helpdesk"];
  const shown: string[] = [];
  for (const title of titles) {
    if ((await nav.getByText(title, { exact: true }).count()) > 0) shown.push(title);
  }
  return shown;
}

// Catches: a new person forced through creating a company before they can read their own mail.
test("someone in no company lands in their Personal space's inbox, not in company setup", async () => {
  const page = await signedIn(`solo-${Date.now()}@gmail.test`, "/");
  // The inbox shell's switcher renders only once the member guards let the page stay (a
  // redirect to setup passes through `/inbox` on its way, so the URL alone proves nothing).
  await page.getByRole("button", { name: /^Switch mailbox/ }).waitFor({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/inbox");
});

// Catches: a Personal space offering team, shared-inbox and helpdesk settings it can never use.
test("a Personal space's settings leave out the company pages; a company's keep them", async () => {
  const personal = await signedIn(`me-${Date.now()}@gmail.test`, "/settings");
  expect(await settingsPages(personal)).toEqual(["General", "Inboxes"]);
  await context?.close();

  const email = `owner-${Date.now()}@company.test`;
  await createOrgWithOwner(db, { name: "Acme", slug: `acme-${Date.now()}`, ownerEmail: email });
  const company = await signedIn(email, "/settings");
  expect(await settingsPages(company)).toEqual([
    "General",
    "People",
    "Inboxes",
    "Shared",
    "Helpdesk",
  ]);
});

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
