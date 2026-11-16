// The sidebar's top row: which workspace you are in (a company or your Personal space), and
// switching it. Only the workspace changes: the module stays (Files opens the same space's top,
// mail the same list), and an owner or admin of a workspace still being set up goes to
// onboarding instead (ADR 0009).
//
// Geometry: the 20px mark sits on the nav icons' 15px axis (2.5px out on every side), 8px in,
// with the name 10px after it, so mark and name line up with the rows under it.
import { cn } from "cn";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Menu, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { appToast } from "@/components/ui/toast";
import { useMember } from "@/hooks/use-session.ts";
import { useOpenWorkspace, useWorkspaces } from "@/hooks/use-workspaces.ts";
import type { Workspace } from "@/lib/types.ts";

/** A workspace's square mark: its logo, or its initial on a grey a step under the hover fill. */
function WorkspaceMark({ workspace, className }: { workspace: Workspace; className?: string }) {
  return (
    <Avatar
      isSquare
      src={workspace.logo}
      initials={workspace.name.slice(0, 1).toUpperCase()}
      className={cn("bg-secondary text-foreground outline-0 mix-blend-multiply", className)}
      style={{ "--avatar-size": "20px" } as CSSProperties}
    />
  );
}

export function WorkspaceSwitcher() {
  const { member } = useMember();
  const workspaces = useWorkspaces().data?.workspaces ?? [];
  const openWorkspace = useOpenWorkspace();
  const active = workspaces.find((w) => w.id === member.orgId);
  if (!active) return null;

  const choose = (workspace: Workspace) => {
    if (workspace.id === member.orgId) return;
    openWorkspace.mutate(workspace, {
      onError: () => appToast.error("The workspace could not be opened."),
    });
  };

  return (
    <MenuTrigger>
      <Button
        intent="plain"
        aria-label={`Switch workspace, currently ${active.name}`}
        // Hover, pressed and open share one fill, as on every sidebar menu trigger. It hugs its
        // name, truncating only when the header runs out of room. No chevron: beside the three
        // icon buttons it would leave a company's name a few letters (Skiff's top row has none).
        className="h-7 min-w-0 justify-start gap-2.5 rounded-sm px-2 [--btn-overlay:var(--color-accent)] aria-expanded:[--btn-bg:var(--color-accent)]"
      >
        <span className="grid size-icon shrink-0 place-items-center">
          {openWorkspace.isPending ? (
            <Loader className="size-icon text-muted-foreground" />
          ) : (
            <span className="-m-[2.5px]">
              <WorkspaceMark workspace={active} />
            </span>
          )}
        </span>
        <span className="min-w-0 truncate">{active.name}</span>
      </Button>
      <Menu
        placement="bottom start"
        aria-label="Workspaces"
        selectionMode="single"
        selectedKeys={[active.id]}
        popover={{
          offset: 8,
          // The trigger sits 8px from the window's edge: the menu keeps the same 8px.
          collisionPadding: 8,
          className: "min-w-56",
        }}
      >
        {workspaces.map((workspace) => (
          <MenuItem
            key={workspace.id}
            id={workspace.id}
            textValue={workspace.name}
            onAction={() => choose(workspace)}
          >
            <WorkspaceMark workspace={workspace} />
            <MenuLabel>{workspace.name}</MenuLabel>
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
