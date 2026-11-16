// The top of the sidebar: the module on screen (ADR 0035), Mail or Drive, and its menu, which
// switches module and, under a separator, workspace (a company or your Personal space). The
// sidebar shows one module's rows at a time; the module follows the route. Each module has an
// identity colour (`--module-*`), used on its mark here and nowhere else.
//
// - Switching module keeps the workspace and the mailbox shown in mail.
// - Switching workspace keeps the module: Drive opens the same space's top, mail the same list
//   (`openWorkspace`); an owner or admin of a workspace still being set up goes to onboarding.
//
// Geometry: the mark is an 18px tile on the nav icons' 15px axis (1.5px out on every side), so
// its centre and the label after it line up with the rows below. The glyph is 12px, 3px in.
import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
import { cn } from "cn";
import type { ComponentType, CSSProperties } from "react";
import { IconCheck, IconFolder, IconMail } from "@/components/icons/central";
import { Avatar } from "@/components/ui/avatar";
import { Loader } from "@/components/ui/loader";
import {
  Menu,
  MenuItem,
  MenuLabel,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { SidebarItemTrigger } from "@/components/ui/sidebar";
import { appToast } from "@/components/ui/toast";
import { useMember } from "@/hooks/use-session.ts";
import { useOpenWorkspace, useWorkspaces } from "@/hooks/use-workspaces.ts";
import type { Workspace } from "@/lib/types.ts";

export type ModuleId = "mail" | "files";

interface Module {
  id: ModuleId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Where switching to the module lands. */
  home: "/inbox" | "/files/my";
  /** Its identity colour, as a fill. */
  fill: string;
}

const MAIL: Module = {
  id: "mail",
  label: "Mail",
  icon: IconMail,
  home: "/inbox",
  fill: "bg-module-mail",
};
/** Storage (ADR 0034), called Drive; its paths stay `/files/*`. */
const DRIVE: Module = {
  id: "files",
  label: "Drive",
  icon: IconFolder,
  home: "/files/my",
  fill: "bg-module-drive",
};
const MODULES = [MAIL, DRIVE];

/** The module a path belongs to: Drive's own paths, else Mail (every other shell route is mail's). */
export function moduleOf(pathname: string): ModuleId {
  return pathname === "/files" || pathname.startsWith("/files/") ? "files" : "mail";
}

export function useCurrentModule() {
  return moduleOf(useLocation().pathname);
}

function ModuleMark({ module, className }: { module: Module; className?: string }) {
  const Icon = module.icon;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4.5 shrink-0 place-items-center rounded-[5px] text-module-foreground",
        module.fill,
        className,
      )}
    >
      <Icon className="size-3 text-module-foreground" />
    </span>
  );
}

/** A workspace's square mark: its logo, or its initial on a grey a step under the hover fill. */
function WorkspaceMark({ workspace }: { workspace: Workspace }) {
  return (
    <Avatar
      isSquare
      src={workspace.logo}
      initials={workspace.name.slice(0, 1).toUpperCase()}
      className="bg-secondary text-foreground outline-0 mix-blend-multiply"
      style={{ "--avatar-size": "20px" } as CSSProperties}
    />
  );
}

/** A row's name, with the check on the current one riding inside the label so it sits on the
 *  name's line, 10px in from the row's end (as the settings workspace chooser does). */
function Label({ name, current }: { name: string; current: boolean }) {
  return (
    <MenuLabel className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate">{name}</span>
      {current && <IconCheck className="size-3.5 shrink-0 text-foreground" />}
    </MenuLabel>
  );
}

/** The groups' names are for assistive tech only: the marks and the separator show them. */
const HIDDEN_LABEL = "sr-only";

export function ModuleSwitcher() {
  const router = useRouter();
  const current = useCurrentModule() === "files" ? DRIVE : MAIL;
  // The mailbox shown in mail rides along both ways, so coming back to Mail keeps it.
  const { mailbox } = useSearch({ strict: false }) as { mailbox?: string };
  const { member } = useMember();
  const workspaces = useWorkspaces().data?.workspaces ?? [];
  const openWorkspace = useOpenWorkspace();
  const activeName = workspaces.find((w) => w.id === member.orgId)?.name;

  const openModule = (module: Module) => {
    if (module.id === current.id) return;
    void router.navigate({ to: module.home, search: mailbox ? { mailbox } : {} });
  };
  const chooseWorkspace = (workspace: Workspace) => {
    if (workspace.id === member.orgId) return;
    openWorkspace.mutate(workspace, {
      onError: () => appToast.error("The workspace could not be opened."),
    });
  };

  return (
    <MenuTrigger>
      <SidebarItemTrigger
        aria-label={`Switch module or workspace, currently ${current.label}${activeName ? ` in ${activeName}` : ""}`}
      >
        <span className="grid size-icon shrink-0 place-items-center">
          {openWorkspace.isPending ? (
            <Loader className="size-icon text-muted-foreground" />
          ) : (
            <span className="-m-[1.5px]">
              <ModuleMark module={current} />
            </span>
          )}
        </span>
        <span className="min-w-0 truncate">{current.label}</span>
      </SidebarItemTrigger>
      <Menu
        placement="bottom start"
        popover={{
          offset: 4,
          // The row sits 8px from the window's edge: the menu keeps the same 8px.
          collisionPadding: 8,
          className: "min-w-(--anchor-width) max-w-[min(18rem,calc(100vw-16px))]",
        }}
      >
        <MenuSection label="Modules" labelClassName={HIDDEN_LABEL}>
          {MODULES.map((module) => (
            <MenuItem
              key={module.id}
              id={module.id}
              textValue={module.label}
              onAction={() => openModule(module)}
            >
              {/* In the workspaces' 20px avatar box, so both groups' labels start on one line,
                  with the menu's icon gap after it (it gives that only to its own marks). */}
              <span className="me-(--me-icon) grid size-5 shrink-0 place-items-center">
                <ModuleMark module={module} />
              </span>
              <Label name={module.label} current={module.id === current.id} />
            </MenuItem>
          ))}
        </MenuSection>
        <MenuSeparator />
        <MenuSection label="Workspaces" labelClassName={HIDDEN_LABEL} className="mt-0">
          {workspaces.map((workspace) => (
            <MenuItem
              key={workspace.id}
              id={`workspace-${workspace.id}`}
              textValue={workspace.name}
              onAction={() => chooseWorkspace(workspace)}
            >
              <WorkspaceMark workspace={workspace} />
              <Label name={workspace.name} current={workspace.id === member.orgId} />
            </MenuItem>
          ))}
        </MenuSection>
      </Menu>
    </MenuTrigger>
  );
}
