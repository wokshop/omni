import { useState, type ReactNode } from "react";
import {
  IconFolderShared,
  IconLock,
  IconPlus,
  IconUpload,
  IconUserRound,
  IconUsers,
} from "@/components/icons/central";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { useMember } from "@/hooks/use-session.ts";
import { IconSearch, IconTrash } from "@/components/icons/sidebar";
import { openSearch } from "@/components/search/command-menu.tsx";
import { FileTrigger } from "@/components/ui/file-trigger";
import {
  SidebarItem,
  SidebarItemTrigger,
  SidebarLabel,
  SidebarSection,
} from "@/components/ui/sidebar";
import {
  useHasSharedFiles,
  useStorageList,
  useTeamspaces,
  useUploads,
} from "@/hooks/use-storage.ts";
import type { DriveRoot, StoragePlace, StorageSpace } from "@/lib/storage.ts";
import { StorageFrame } from "./storage-frame.tsx";
import { BrowseTeamspacesDialog, NewTeamspaceDialog } from "./teamspace-dialogs.tsx";
import { SidebarGroup } from "./sidebar-tree.tsx";
import { storageErrorToast } from "./storage-errors.ts";
import { useWorkspacePaths } from "@/hooks/use-workspaces.ts";

export const SPACE_LABEL = { personal: "Personal", shared: "Team" } as const;
export const SPACE_PATH = { personal: "/files/my", shared: "/files/shared" } as const;
/** Where a teamspace's top opens. */
export const TEAMSPACE_PATH = "/files/t";

/** Where a drive's top opens in the workspace. */
export const drivePath = (drive: DriveRoot) =>
  "teamspaceId" in drive
    ? `${TEAMSPACE_PATH}/${encodeURIComponent(drive.teamspaceId)}`
    : SPACE_PATH[drive.space];
export const SPACE_ICON = {
  personal: <IconUserRound className="size-icon" />,
  shared: <IconUsers className="size-icon" />,
} as const;

const TEAMSPACE_ICON = {
  open: <IconUsers className="size-icon" />,
  private: <IconLock className="size-icon" />,
} as const;

function HeldGroup(props: { space: StorageSpace; search: string }) {
  const root = useStorageList({ space: props.space });
  if (root.isPending || root.nodes.length === 0) return null;
  return (
    <SidebarGroup
      drive={{ space: props.space }}
      label={SPACE_LABEL[props.space]}
      icon={SPACE_ICON[props.space]}
      search={props.search}
    />
  );
}

function BrowseTeamspacesRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SidebarItem onPress={() => setOpen(true)} tooltip="Browse teamspaces">
        <IconUsers className="size-icon" />
        <SidebarLabel>Browse teamspaces</SidebarLabel>
      </SidebarItem>
      {open && <BrowseTeamspacesDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function NewTeamspaceRow() {
  const [open, setOpen] = useState(false);
  const self = useMember().member.id;
  return (
    <>
      <SidebarItem onPress={() => setOpen(true)} tooltip="New teamspace">
        <IconPlus className="size-icon" />
        <SidebarLabel>New teamspace</SidebarLabel>
      </SidebarItem>
      {open && <NewTeamspaceDialog selfId={self} onClose={() => setOpen(false)} />}
    </>
  );
}

/** `/files` with no teamspace and nothing in My files or Shared: the way to make one. */
export function NoTeamspaces() {
  const [open, setOpen] = useState(false);
  const self = useMember().member.id;
  return (
    <StorageFrame title={<span className="text-md">Drive</span>}>
      <div className="flex flex-1 flex-col">
        <EmptyState figure="drawer" title="No teamspaces yet">
          <Button onPress={() => setOpen(true)}>
            <IconPlus data-slot="icon" />
            New teamspace
          </Button>
        </EmptyState>
      </div>
      {open && <NewTeamspaceDialog selfId={self} onClose={() => setOpen(false)} />}
    </StorageFrame>
  );
}

type Row = { label: string; path: string; icon: ReactNode; company?: boolean; action?: () => void };

const PLACES: Row[] = [
  {
    label: "Search",
    path: "search",
    icon: <IconSearch />,
    action: () => openSearch({ q: "", scope: "files" }),
  },
  {
    label: "Shared with me",
    path: "/files/shared-with-me",
    icon: <IconFolderShared className="size-icon" />,
  },
  {
    label: "Trash",
    path: "/files/trash",
    icon: <IconTrash />,
  },
];

/** A nav link that keeps showing `mailbox`, the switcher's choice, for the way back to mail. */
export function StorageNav({ mailbox }: { mailbox: string | undefined }) {
  const hasShared = useHasSharedFiles();
  const { teamspaces } = useTeamspaces();
  const search = mailbox ? `?mailbox=${encodeURIComponent(mailbox)}` : "";
  return (
    <>
      <SidebarSection>
        <UploadRow />
        <Rows rows={PLACES} mailbox={mailbox} />
      </SidebarSection>
      <SidebarSection label="Teamspaces">
        {teamspaces
          .filter((teamspace) => teamspace.role !== null)
          .map((teamspace) => (
            <SidebarGroup
              key={teamspace.id}
              drive={{ teamspaceId: teamspace.id }}
              label={teamspace.name}
              icon={teamspace.private ? TEAMSPACE_ICON.private : TEAMSPACE_ICON.open}
              search={search}
            />
          ))}
        {hasShared && <HeldGroup space="shared" search={search} />}
        <HeldGroup space="personal" search={search} />
        <NewTeamspaceRow />
        {teamspaces.some((teamspace) => teamspace.role === null) && <BrowseTeamspacesRow />}
      </SidebarSection>
    </>
  );
}

function Rows(props: { rows: Row[]; mailbox: string | undefined }) {
  const { place: pathname, href } = useWorkspacePaths();
  const hasShared = useHasSharedFiles();
  const search = props.mailbox ? `?mailbox=${encodeURIComponent(props.mailbox)}` : "";
  return props.rows
    .filter((row) => !row.company || hasShared)
    .map((row) => (
      <SidebarItem
        key={row.path}
        {...(row.action
          ? { onPress: row.action }
          : {
              href: href(row.path + search),
              isCurrent: pathname === row.path || pathname.startsWith(`${row.path}/`),
            })}
        tooltip={row.label}
      >
        {row.icon}
        <SidebarLabel>{row.label}</SidebarLabel>
      </SidebarItem>
    ));
}

function UploadRow() {
  const { upload } = useUploads();
  const place = useUploadPlace();
  return (
    <FileTrigger
      allowsMultiple
      onSelect={(files) => {
        const picked = [...(files ?? [])];
        if (!picked.length) return;
        upload(picked, { place }, (name, error) =>
          storageErrorToast(error, `“${name}” was not uploaded`),
        );
      }}
    >
      <SidebarItemTrigger>
        <IconUpload />
        <SidebarLabel>Upload</SidebarLabel>
      </SidebarItemTrigger>
    </FileTrigger>
  );
}

const useUploadPlace: () => StoragePlace = () => {
  const { place: pathname } = useWorkspacePaths();
  if (pathname.startsWith(`${TEAMSPACE_PATH}/`)) {
    const [teamspaceId, folderId] = pathname.slice(TEAMSPACE_PATH.length + 1).split("/");
    if (folderId) return { parentId: decodeURIComponent(folderId) };
    if (teamspaceId) return { teamspaceId: decodeURIComponent(teamspaceId) };
  }
  for (const space of ["personal", "shared"] as const) {
    const root = SPACE_PATH[space];
    if (pathname === root) return { space };
    if (pathname.startsWith(`${root}/`)) {
      return { parentId: decodeURIComponent(pathname.slice(root.length + 1)) };
    }
  }
  return { space: "personal" };
};
