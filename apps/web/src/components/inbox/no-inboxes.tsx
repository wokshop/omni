import { useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { useConnectGoogle, useGoogleAccounts } from "@/hooks/use-google-connection";

/**
 * The inbox before any account is connected, in the Personal space everyone starts in (ADR 0024):
 * connect a Google account (it opens where its address belongs), or set up a company.
 */
export function NoInboxes() {
  const navigate = useNavigate();
  const google = useGoogleAccounts();
  const connect = useConnectGoogle("settings");
  const canConnect = google.data?.available === true;
  return (
    <EmptyState
      figure="plug"
      title="No accounts yet"
      description={
        canConnect
          ? "Connect your Gmail and its mail opens here."
          : "Set up a company to bring in your team's mail."
      }
    >
      {canConnect && (
        <Button size="sm" isPending={connect.isPending} onPress={() => connect.mutate()}>
          Connect Google
        </Button>
      )}
      <Button
        size="sm"
        intent={canConnect ? "outline" : "primary"}
        onPress={() => void navigate({ to: "/onboarding" })}
      >
        Set up a company
      </Button>
    </EmptyState>
  );
}
