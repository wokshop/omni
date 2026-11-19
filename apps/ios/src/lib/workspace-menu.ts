import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useMe } from "./drive-actions.ts";
import { api, call } from "./api.ts";
import { config } from "./config.ts";
import { keys } from "./query-keys.ts";

/** The web app's settings pages the workspace menu opens, as the desktop's menu names them. */
export type WebSettingsPage = "general" | "accounts" | "people" | "billing";

export const isManager = (role: string | undefined) => !!role && /\b(owner|admin)\b/.test(role);

/** What the workspace menu offers beyond the workspaces: the desktop menu's rules. */
export function useWorkspaceMenu(team: boolean) {
  const role = useMe().data?.role;
  const manager = team && isManager(role);
  const canCreate =
    useQuery({
      queryKey: keys.onboarding(),
      queryFn: ({ signal }) => call(api.onboarding.$get(undefined, { init: { signal } })),
      staleTime: 5 * 60_000,
    }).data?.canCreateOrganization === true;
  const billing = useQuery({
    queryKey: keys.billing(),
    queryFn: ({ signal }) => call(api.billing.$get(undefined, { init: { signal } })),
    staleTime: 5 * 60_000,
    enabled: manager,
  }).data;
  const plan = billing?.enabled ? billing : null;
  const upgrade =
    manager &&
    !!plan?.canManage &&
    (plan.readOnly || !plan.subscription || plan.subscription.status === "trialing");
  return { canCreate, invite: manager, upgrade };
}

/** Opens a page of the web app (`/<slug>/settings/<page>`, `/onboarding`) in the in-app browser. */
export function openWeb(path: string) {
  void WebBrowser.openBrowserAsync(new URL(path, config.apiUrl).toString());
}

export const webSettingsPath = (slug: string, page: WebSettingsPage) =>
  `/${encodeURIComponent(slug)}/settings/${page}`;
