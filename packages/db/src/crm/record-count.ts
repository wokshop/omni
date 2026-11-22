import { count, eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import { crmCompanies, crmDeals, crmPeople } from "../schema/crm.ts";

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
