import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { appToast } from "@/components/ui/toast";
import { useOnboarding } from "@/hooks/use-onboarding";
import {
  useAcceptInvitation,
  useRejectInvitation,
  useSession,
  useSignOut,
} from "@/hooks/use-session";
import { chooseJustMe, markInvitationsSeen, pendingInvitationsQuery } from "@/lib/invitations";
import { keys } from "@/lib/query-keys";
import { workspaceHome } from "@/lib/workspaces";
import type { PendingInvitation } from "@/lib/types";
import { EntryCard, inviterName, roleLabel } from "./entry-card";

/**
 * The first screen after sign-in while invitations wait for the person (to any of their sign-in
 * emails), and for someone in no workspace yet: join or decline each, create a workspace, or
 * keep to their own email ("Just me", which makes their Personal space).
 */
export function Welcome() {
  const navigate = useNavigate();
  const router = useRouter();
  const client = useQueryClient();
  const session = useSession();
  const pending = useQuery(pendingInvitationsQuery());
  const status = useOnboarding();
  const signOut = useSignOut();
  const userId = session.data?.user.id;
  const justMe = useMutation({
    meta: { handlesError: true },
    mutationFn: () => chooseJustMe(client, router),
    onSuccess: (slug) => {
      markInvitationsSeen(userId);
      void navigate({ href: workspaceHome(slug) });
    },
    onError: (error) => appToast.error(error.message || "That didn't work. Try again."),
  });
  const invitations = pending.data?.invitations ?? [];
  const inWorkspace = !!session.data?.member;
  const leave = (to: "/" | "/onboarding") => {
    markInvitationsSeen(userId);
    void navigate({ to });
  };

  return (
    <EntryCard
      title={invitations.length > 0 ? "Your invitations" : "Welcome to Omni"}
      actions={
        <>
          {status.data?.canCreateOrganization && (
            <Button
              size="lg"
              intent={invitations.length > 0 ? "outline" : "primary"}
              onPress={() => leave("/onboarding")}
            >
              Create a workspace
            </Button>
          )}
          {!inWorkspace && status.data?.canCreatePersonalSpace && (
            <Button
              size="lg"
              intent="outline"
              isPending={justMe.isPending}
              onPress={() => justMe.mutate()}
            >
              Just me
            </Button>
          )}
          {inWorkspace ? (
            <Button size="lg" intent="outline" onPress={() => leave("/")}>
              Not now
            </Button>
          ) : (
            <Button
              size="lg"
              intent="outline"
              isPending={signOut.isPending}
              onPress={() => signOut.mutate()}
            >
              Use another account
            </Button>
          )}
        </>
      }
    >
      {invitations.length > 0 && (
        <ul
          aria-label="Invitations"
          className="-mx-1 -mt-2 flex min-h-0 flex-col gap-1 overflow-y-auto px-1"
        >
          {invitations.map((invitation) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              onDeclined={() =>
                void client
                  .invalidateQueries({ queryKey: keys.pendingInvitations() })
                  .then(() => router.invalidate())
              }
            />
          ))}
        </ul>
      )}
    </EntryCard>
  );
}

function InvitationRow(props: { invitation: PendingInvitation; onDeclined: () => void }) {
  const { invitation } = props;
  const accept = useAcceptInvitation();
  const reject = useRejectInvitation();
  const busy = accept.isPending || reject.isPending;
  const name = invitation.organization.name;
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar
        isSquare
        size="sm"
        initials={name.slice(0, 1).toUpperCase()}
        className="bg-secondary text-foreground outline-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-y-1">
        <span className="truncate text-sm text-foreground">{name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {inviterName(invitation.inviter)} · {roleLabel(invitation.role)}
        </span>
      </div>
      <Button
        size="sm"
        intent="outline"
        aria-label={`Decline ${name}`}
        isDisabled={busy && !reject.isPending}
        isPending={reject.isPending}
        onPress={() =>
          reject.mutate(invitation.id, {
            onSuccess: props.onDeclined,
            onError: (error) => appToast.error(error.message || "The invitation was not declined."),
          })
        }
      >
        Decline
      </Button>
      <Button
        size="sm"
        aria-label={`Join ${name}`}
        isDisabled={busy && !accept.isPending}
        isPending={accept.isPending}
        onPress={() =>
          accept.mutate(invitation.id, {
            onError: (error) => appToast.error(error.message || "You could not join."),
          })
        }
      >
        Join
      </Button>
    </li>
  );
}
