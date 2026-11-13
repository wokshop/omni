// A hosted mailbox whose app password stopped working gets a new one (plan H-4). Omni operates
// the host, so it can mint a login itself instead of leaving the mailbox in `error` until someone
// notices: a password revoked by hand at Purelymail, or rotated by an admin, heals on its own.
//
// Order: issue the new login, swap it in only while the stored one is unchanged, reconnect through
// the service's own path (so any mailbox lease holds), then revoke the old one. A crash anywhere
// leaves at most one unused app password on the host, which the next rotation does not need.
// One try per mailbox per window: a host that refuses every login must not get a new app password
// on every reconnect attempt.
import type { Keyring } from "@omni/crypto";
import { type Db, replaceMailboxCredentials } from "@omni/db";
import { openCredentials, sealCredentials } from "../credentials.ts";
import type { Logger } from "../log.ts";
import type { MailHost } from "./mail-host.ts";

export const ROTATE_WINDOW_MS = 6 * 60 * 60_000;

export interface HostedMailboxRow {
  id: string;
  address: string;
  credentialsEnc: string;
}

export function createLoginRotation(deps: {
  db: Db;
  keyring: Keyring;
  host: MailHost;
  /** The service's reconnect: replaces the mailbox's connection with one on its stored login. */
  reconnect(mailboxId: string): Promise<void>;
  logger: Logger;
  now?: () => number;
}) {
  const { db, keyring, host, logger } = deps;
  const now = deps.now ?? Date.now;
  const lastTried = new Map<string, number>();

  /** True when the mailbox got a new login and was reconnected with it. */
  return async function rotate(row: HostedMailboxRow): Promise<boolean> {
    const tried = lastTried.get(row.id);
    if (tried !== undefined && now() - tried < ROTATE_WINDOW_MS) return false;
    lastTried.set(row.id, now());

    const old = await openCredentials(keyring, row.id, row.credentialsEnc);
    if ("oauth" in old) return false;
    // A user deleted at the host stays deleted: only a lost password is healed.
    const next = await host.issueLogin(row.address, { createUser: false });
    const swapped = await replaceMailboxCredentials(db, {
      mailboxId: row.id,
      expected: row.credentialsEnc,
      next: await sealCredentials(keyring, row.id, next),
    });
    if (!swapped) {
      // Someone saved another login meanwhile; theirs wins and ours is never used.
      await host.revokeLogin(row.address, next.pass);
      logger.info("hosting.rotate_superseded", { mailboxId: row.id });
      return false;
    }
    logger.warn("hosting.login_rotated", { mailboxId: row.id });
    await deps.reconnect(row.id);
    await host.revokeLogin(row.address, old.pass);
    return true;
  };
}
