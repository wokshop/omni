// The sidebar shows one module at a time (ADR 0035): Mail or Files, each with its own rows. The
// module follows the route, and this row, first under the workspace, switches it. Each module
// has an identity colour (`--module-*`), used on its mark here and nowhere else.
//
// Geometry: the mark is an 18px tile on the nav icons' 15px axis (1.5px out on every side), so
// its centre and the label after it line up with the rows below. The glyph is 12px, 3px in.
import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
import { cn } from "cn";
import type { ComponentType } from "react";
import { IconChevronsUpDown, IconFolder, IconMail } from "@/components/icons/central";
import { Menu, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { SidebarItemTrigger } from "@/components/ui/sidebar";

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
const FILES: Module = {
  id: "files",
  label: "Files",
  icon: IconFolder,
  home: "/files/my",
  fill: "bg-module-files",
};
const MODULES = [MAIL, FILES];

/** The module a path belongs to: Files' own paths, else Mail (every other shell route is mail's). */
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

export function ModuleSwitcher() {
  const router = useRouter();
  const current = useCurrentModule() === "files" ? FILES : MAIL;
  // The mailbox shown in mail rides along both ways, so coming back to Mail keeps it.
  const { mailbox } = useSearch({ strict: false }) as { mailbox?: string };

  const open = (module: Module) => {
    if (module.id === current.id) return;
    void router.navigate({ to: module.home, search: mailbox ? { mailbox } : {} });
  };

  return (
    <MenuTrigger>
      <SidebarItemTrigger aria-label={`Switch module, currently ${current.label}`}>
        <span className="grid size-icon shrink-0 place-items-center">
          <span className="-m-[1.5px]">
            <ModuleMark module={current} />
          </span>
        </span>
        <span className="min-w-0 truncate">{current.label}</span>
        <IconChevronsUpDown className="ms-auto size-3.5 shrink-0 text-subtle-foreground" />
      </SidebarItemTrigger>
      <Menu
        placement="bottom start"
        aria-label="Modules"
        // As wide as the row that opened it, so the menu reads as the row opened.
        popover={{
          offset: 4,
          // The row sits 8px from the window's edge: the menu keeps the same 8px.
          collisionPadding: 8,
          className: "w-(--anchor-width) min-w-(--anchor-width) max-w-none",
        }}
        selectionMode="single"
        selectedKeys={[current.id]}
      >
        {MODULES.map((module) => (
          <MenuItem
            key={module.id}
            id={module.id}
            textValue={module.label}
            onAction={() => open(module)}
          >
            {/* The menu's icon gap, which it gives only its own icons and avatars. */}
            <ModuleMark module={module} className="me-(--me-icon)" />
            <MenuLabel>{module.label}</MenuLabel>
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
