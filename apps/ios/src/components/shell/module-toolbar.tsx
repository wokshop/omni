import { Stack, router } from "expo-router";
import type { ReactNode } from "react";
import { signOut, useSession } from "@/lib/session.ts";
import type { SymbolName } from "@/lib/symbols.ts";
import { openWorkspace, useWorkspace, workspaceLabel } from "@/lib/workspace.ts";
import { notificationsButton } from "./notifications-button.tsx";
import { useUnreadNotifications } from "@/lib/notifications.ts";

export interface ModulePage<Id extends string> {
  id: Id;
  label: string;
  icon: SymbolName;
  /** A count beside it, as the web sidebar shows one (Inbox's unread). */
  count?: string;
}

/**
 * A module page's header buttons, native menus both: on the left, the module's pages (the web
 * sidebar's rows), the current one checked, then `children` (more sections, such as mail's
 * mailboxes); on the right, `actions` (a page's own buttons, such as New), then the workspace:
 * every one the person belongs to, and Log out. A native header reads its buttons straight from
 * its children, so each is a `Stack.Toolbar.*` element here, never a component wrapping one.
 */
export function ModuleToolbar<Id extends string>(props: {
  pages: readonly ModulePage<Id>[];
  current: Id;
  onPage: (id: Id) => void;
  children?: ReactNode;
  /** `Stack.Toolbar.Button` or `.Menu` elements before the workspace menu. */
  actions?: ReactNode;
}) {
  const workspaceMenu = useWorkspaceMenu();
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Menu icon="line.3.horizontal" accessibilityLabel="Pages">
          <Stack.Toolbar.Menu inline>
            {props.pages.map((page) => (
              <Stack.Toolbar.MenuAction
                key={page.id}
                icon={page.icon}
                isOn={page.id === props.current}
                subtitle={page.count}
                onPress={() => page.id !== props.current && props.onPage(page.id)}
              >
                {page.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          {props.children}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        {props.actions}
        {workspaceMenu}
      </Stack.Toolbar>
    </>
  );
}

function useWorkspaceMenu() {
  const { active, all } = useWorkspace();
  const name = useSession().data?.user.name;
  if (!active) return null;
  return (
    <Stack.Toolbar.Menu
      icon={active.kind === "personal" ? "person.crop.circle" : "building.2"}
      accessibilityLabel={`Switch workspace, currently ${workspaceLabel(active, name)}`}
    >
      <Stack.Toolbar.Menu inline title="Workspaces">
        {all.map((workspace) => (
          <Stack.Toolbar.MenuAction
            key={workspace.id}
            icon={workspace.kind === "personal" ? "person" : "building.2"}
            isOn={workspace.id === active.id}
            onPress={() => openWorkspace(workspace.id)}
          >
            {workspaceLabel(workspace, name)}
          </Stack.Toolbar.MenuAction>
        ))}
      </Stack.Toolbar.Menu>
      <Stack.Toolbar.MenuAction icon="gearshape" onPress={() => router.push("/settings")}>
        Settings
      </Stack.Toolbar.MenuAction>
      <Stack.Toolbar.MenuAction
        icon="rectangle.portrait.and.arrow.right"
        onPress={() => void signOut()}
      >
        Log out
      </Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}
