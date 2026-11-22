import { and, asc, eq, sql } from "drizzle-orm";
import { members, organizations, users } from "../schema/auth.ts";
import {
  meetingsActions,
  meetingsGrants,
  meetingsMeetings,
  meetingsNotes,
} from "../schema/meetings.ts";
import type { Ex } from "./core.ts";

/** Everything writing a meeting's notes into its doc needs: the notes, the doc, who may read. */
export async function docTarget(ex: Ex, meetingId: string) {
  const [row] = await ex
    .select({
      meeting: meetingsMeetings,
      slug: organizations.slug,
      recorderName: users.name,
    })
    .from(meetingsMeetings)
    .innerJoin(organizations, eq(organizations.id, meetingsMeetings.orgId))
    .leftJoin(members, eq(members.id, meetingsMeetings.recordedByMemberId))
    .leftJoin(users, eq(users.id, members.userId))
    .where(eq(meetingsMeetings.id, meetingId));
  if (!row) return null;
  const [[notes], grants, actions] = await Promise.all([
    ex.select().from(meetingsNotes).where(eq(meetingsNotes.meetingId, meetingId)),
    ex
      .select({ address: meetingsGrants.address })
      .from(meetingsGrants)
      .where(eq(meetingsGrants.meetingId, meetingId)),
    ex
      .select({ kind: meetingsActions.kind, payload: meetingsActions.payload })
      .from(meetingsActions)
      .where(eq(meetingsActions.meetingId, meetingId))
      .orderBy(asc(meetingsActions.seq)),
  ]);
  return {
    meeting: row.meeting,
    workspaceSlug: row.slug,
    recorderName: row.recorderName,
    notes: notes ?? null,
    granted: grants.map((g) => g.address),
    actions,
  };
}

/**
 * Makes `nodeId` the meeting's notes doc unless it already has one. False when another run got
 * there first: the caller drops the doc it made and uses the meeting's.
 */
export async function claimNotesDoc(ex: Ex, meetingId: string, nodeId: string) {
  const rows = await ex
    .update(meetingsMeetings)
    .set({ notesNodeId: nodeId })
    .where(and(eq(meetingsMeetings.id, meetingId), sql`${meetingsMeetings.notesNodeId} is null`))
    .returning({ id: meetingsMeetings.id });
  return rows.length > 0;
}
