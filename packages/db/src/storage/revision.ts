import { sql, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Db } from "../client.ts";
import { storageNodes, storageSyncState, storageTombstones } from "../schema/storage.ts";
import type { StorageSpace } from "./core.ts";

/**
 * The next revision of the workspace. The counter row stays locked until the caller's
 * transaction ends, so take it last, after the tree, usage and upload locks.
 */
export async function nextRevision(tx: Db, orgId: string) {
  const [row] = await tx
    .insert(storageSyncState)
    .values({ orgId, revision: 1 })
    .onConflictDoUpdate({
      target: storageSyncState.orgId,
      set: { revision: sql`${storageSyncState.revision} + 1` },
    })
    .returning({ revision: storageSyncState.revision });
  return row!.revision;
}

/** Where a node that left a drive went: deleted, or the drive it moved to. */
export type StorageDestination = "gone" | { space: StorageSpace; ownerMemberId: string | null };

const wentTo = (to: StorageDestination) =>
  to === "gone" ? "gone" : to.space === "shared" ? "shared" : `personal:${to.ownerMemberId}`;

/**
 * Records that the nodes matching `where` leave the drive they are in now, at `revision`, for
 * `to`. Call before the update or delete that takes them out.
 */
export async function leaveTombstones(
  tx: Db,
  where: SQL | undefined,
  revision: number,
  to: StorageDestination,
) {
  const leaving = await tx
    .select({
      orgId: storageNodes.orgId,
      nodeId: storageNodes.id,
      space: storageNodes.space,
      ownerMemberId: storageNodes.ownerMemberId,
    })
    .from(storageNodes)
    .where(where);
  for (let at = 0; at < leaving.length; at += 1000) {
    await tx
      .insert(storageTombstones)
      .values(
        leaving
          .slice(at, at + 1000)
          .map((row) => ({ id: uuidv7(), ...row, revision, wentTo: wentTo(to) })),
      );
  }
}
