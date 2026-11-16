// The modules of the one Worker (ADR 0035 decision 3), and what each runs outside a request: its
// every-minute and daily jobs, its part when a member leaves or a workspace is deleted, and what it
// learns from a Stripe event the billing webhook applied.
// `index.ts` walks the jobs for the crons; `context.ts` hands the list to `createAuth`, which runs
// the lifecycle hooks without naming a module. Routes stay chained by hand in `app.ts`, because
// Hono RPC infers `AppType` from the chain.
import type { BillingConfig, ModuleLifecycle } from "@omni/auth";
import { deleteWorkspaceStorage, handOverMemberStorage, type Db } from "@omni/db";
import type Stripe from "stripe";
import { helpdeskClock } from "./sla.ts";
import { notePaymentMethod } from "./storage/billing.ts";
import { abortExpiredStorageUploads, storageDaily } from "./storage/jobs.ts";
import { cleanupExpiredUploads } from "./uploads.ts";

export interface Module extends ModuleLifecycle {
  /** Every minute. Safe to run twice, and bounded per run. */
  minute?: (env: Env) => Promise<unknown>;
  /** Once a day. Safe to run twice, and bounded per run. */
  daily?: (env: Env) => Promise<unknown>;
  /** After the Stripe webhook applied `event` (ADR 0015). Safe to run twice for one event. */
  stripeEvent?: (db: Db, billing: BillingConfig, event: Stripe.Event) => Promise<unknown>;
}

const mail: Module = {
  name: "mail",
  minute: helpdeskClock,
  // Attachments staged for a send that never went.
  daily: cleanupExpiredUploads,
};

const storage: Module = {
  name: "storage",
  // Uploads nobody completed.
  minute: abortExpiredStorageUploads,
  daily: storageDaily,
  // A subscription event with a card lifts the cap at once (ADR 0034 decision 7).
  stripeEvent: notePaymentMethod,
  // Their My files stay with the company, with whoever removed them (ADR 0034 decision 1).
  memberRemoved: (db, { memberId, byMemberId }) =>
    handOverMemberStorage(db, { memberId, toMemberId: byMemberId }),
  // `storage_nodes` would keep the members from being deleted; the files go with the workspace.
  workspaceDeleted: (db, { orgId }) => deleteWorkspaceStorage(db, orgId),
};

export const modules: readonly Module[] = [mail, storage];
