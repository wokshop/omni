// The CRM's HTTP API over the real Worker (ADR 0036): who it reaches, what it announces and the
// answers a client acts on. Access itself is proven at the door in `@omni/db`'s CRM suite; these
// catch the Worker getting it wrong around the door.
import { afterAll, beforeAll, expect, test } from "vitest";
import { startCrmStack, type CrmStack } from "./crm-support.ts";
import { CookieJar, signIn } from "./support.ts";

let stack: CrmStack;

beforeAll(async () => {
  stack = await startCrmStack();
}, 60_000);

afterAll(async () => {
  await stack?.stop();
});

test("crm.changed reaches a teammate's socket and no socket of another workspace", async () => {
  const acme = await stack.company("acme");
  const beta = await stack.company("beta");
  const ana = await stack.member(acme.id);
  const bea = await stack.member(acme.id);
  const cid = await stack.member(beta.id);
  const beaSocket = await stack.socket(bea.jar);
  const cidSocket = await stack.socket(cid.jar);

  const made = await stack.api(ana.jar, "POST", "/companies", { name: "Initech" });
  expect(made.status).toBe(201);
  const event = await beaSocket.waitFor((e) => e.type === "crm.changed");
  expect(event).toEqual({ type: "crm.changed", kind: "company", ids: [made.body.company.id] });

  // A write in Beta reaches Cid, so by then anything Acme sent him would have arrived too.
  const theirs = await stack.api(cid.jar, "POST", "/companies", { name: "Hooli" });
  await cidSocket.waitFor((e) => e.type === "crm.changed");
  expect(cidSocket.received.filter((e) => e.type === "crm.changed")).toEqual([
    { type: "crm.changed", kind: "company", ids: [theirs.body.company.id] },
  ]);
  beaSocket.close();
  cidSocket.close();
}, 60_000);

test("lookup finds a person by an address in any letter case, and nothing from another workspace", async () => {
  const acme = await stack.company("acme-lookup");
  const beta = await stack.company("beta-lookup");
  const ana = await stack.member(acme.id);
  const cid = await stack.member(beta.id);
  const carla = (
    await stack.api(ana.jar, "POST", "/people", { name: "Carla", address: "carla@northwind.com" })
  ).body.person;
  const deal = (
    await stack.api(ana.jar, "POST", "/deals", { name: "Website", personIds: [carla.id] })
  ).body.deal;
  const dora = (
    await stack.api(cid.jar, "POST", "/people", { name: "Dora", address: "dora@initech.com" })
  ).body.person;

  const found = await stack.api(
    ana.jar,
    "GET",
    `/lookup?address=${encodeURIComponent("CARLA@Northwind.COM,Dora@initech.com")}`,
  );
  expect(found.status).toBe(200);
  expect(found.body.people.map((p: { id: string }) => p.id)).toEqual([carla.id]);
  expect(found.body.companies.map((c: { id: string }) => c.id)).toEqual([carla.companyId]);
  expect(found.body.deals.map((d: { id: string }) => d.id)).toEqual([deal.id]);

  // Repeated `address` works too, and Beta's lookup of the same addresses finds only Dora.
  const theirs = await stack.api(
    cid.jar,
    "GET",
    "/lookup?address=carla%40northwind.com&address=DORA%40INITECH.COM",
  );
  expect(theirs.body.people.map((p: { id: string }) => p.id)).toEqual([dora.id]);
  expect(theirs.body.deals).toEqual([]);
}, 60_000);

test("adding an address twice answers the same person; giving it to someone else answers 409 with who holds it", async () => {
  const org = await stack.company("add-once");
  const ana = await stack.member(org.id);
  const first = await stack.api(ana.jar, "POST", "/people", {
    name: "Carla",
    address: "carla@northwind.com",
  });
  expect(first.status).toBe(201);
  const again = await stack.api(ana.jar, "POST", "/people", {
    name: "Carla N.",
    address: "Carla@Northwind.com",
  });
  expect(again.status).toBe(200);
  expect(again.body).toMatchObject({
    created: false,
    person: { id: first.body.person.id, name: "Carla" },
  });

  const other = (
    await stack.api(ana.jar, "POST", "/people", { name: "Dan", address: "dan@northwind.com" })
  ).body.person;
  const taken = await stack.api(ana.jar, "PATCH", `/people/${other.id}`, {
    addresses: { add: ["carla@northwind.com"] },
  });
  expect(taken.status).toBe(409);
  expect(taken.body).toMatchObject({
    code: "ADDRESS_TAKEN",
    address: "carla@northwind.com",
    personId: first.body.person.id,
  });
}, 60_000);

test("a Personal space answers 404 no_crm", async () => {
  const jar = new CookieJar();
  await signIn(stack.worker, stack.db, "solo@personal.test", jar);
  const listed = await stack.api(jar, "GET", "/companies");
  expect(listed.status).toBe(404);
  expect(listed.body).toMatchObject({ code: "NO_CRM" });
}, 60_000);
