import { createFileRoute } from "@tanstack/react-router";
import { Join } from "../../components/join/join.tsx";
import { joinQuery } from "../../lib/join.ts";

/** Ask to join the company a sign-in is scoped to (ADR 0024). Signed in, with no member there. */
export const Route = createFileRoute("/_authed/join")({
  loader: ({ context }) => context.queryClient.ensureQueryData(joinQuery()).catch(() => null),
  component: Join,
});
