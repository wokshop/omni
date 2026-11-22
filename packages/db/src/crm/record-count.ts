import { companyFromAddress, parseAddress } from "@omni/mail-core/addresses";
import { and, count, eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import {
  crmCompanies,
  crmCompanyDomains,
  crmDeals,
  crmPeople,
  crmPersonEmails,
} from "../schema/crm.ts";

/** People, companies and deals in `orgId`, archived ones included: archiving is not deleting. */
export async function crmRecordCount(db: Pick<Db, "select">, orgId: string) {
  const counts = await Promise.all(
    [crmPeople, crmCompanies, crmDeals].map(async (table) => {
      const [row] = await db.select({ n: count() }).from(table).where(eq(table.orgId, orgId));
      return row?.n ?? 0;
    }),
  );
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * How many records adding the person at `rawAddress` would create in `orgId`, as `addPerson`
 * would add it: none when the address already has a person, two when no `companyId` is given
 * and no company yet holds the address's domain (the company is made too), else one.
 */
export async function personAddRecords(
  db: Pick<Db, "select">,
  orgId: string,
  input: { address: string; companyId?: string | null },
) {
  const address = parseAddress(input.address);
  if (!address) return 0;
  const [known] = await db
    .select({ personId: crmPersonEmails.personId })
    .from(crmPersonEmails)
    .where(and(eq(crmPersonEmails.orgId, orgId), eq(crmPersonEmails.address, address)));
  if (known) return 0;
  if (input.companyId !== undefined) return 1;
  const guess = companyFromAddress(address);
  if (!guess.domain || !guess.company) return 1;
  const [held] = await db
    .select({ companyId: crmCompanyDomains.companyId })
    .from(crmCompanyDomains)
    .where(and(eq(crmCompanyDomains.orgId, orgId), eq(crmCompanyDomains.domain, guess.domain)));
  return held ? 1 : 2;
}
