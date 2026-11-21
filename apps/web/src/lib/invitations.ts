import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { api, call } from "./api.ts";
import { keys } from "./query-keys.ts";
import { resetSession } from "./session.ts";

/** Every pending invitation to any of the signed-in person's verified sign-in emails. */
export const pendingInvitationsQuery = () =>
  queryOptions({
    queryKey: keys.pendingInvitations(),
    queryFn: ({ signal }) => call(api.invitations.$get(undefined, { init: { signal } })),
  });

/** One invitation by its link's id: pending, expired, accepted, declined, or wrong_account. */
export const invitationStatusQuery = (id: string) =>
  queryOptions({
    queryKey: keys.invitationStatus(id),
    queryFn: ({ signal }) =>
      call(api.invitations[":id"].$get({ param: { id } }, { init: { signal } })),
    retry: false,
  });

const SEEN = "omni.invitations-seen";

/**
 * The invitations screen comes first once per tab: someone in a workspace who leaves it with
 * "Not now" is not sent back to it on every load. Storage failing only shows it again.
 */
export const invitationsSeen = () => {
  try {
    return sessionStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
};

export const markInvitationsSeen = () => {
  try {
    sessionStorage.setItem(SEEN, "1");
  } catch {}
};

/** Whether `/` should show the invitations first. An error reads as none: never block the app. */
export async function hasPendingInvitations(client: QueryClient) {
  if (invitationsSeen()) return false;
  const data = await client.ensureQueryData(pendingInvitationsQuery()).catch(() => null);
  return (data?.invitations.length ?? 0) > 0;
}

/** Something that can rerun route loaders: the router. */
interface Reloadable {
  invalidate(): Promise<void>;
}

/** "Just me": makes the person's Personal space, opens it, and reruns the guards. Its slug. */
export async function chooseJustMe(client: QueryClient, router: Reloadable) {
  const { organization } = await call(api.onboarding.personal.$post());
  await resetSession(client, router);
  return organization.slug;
}
