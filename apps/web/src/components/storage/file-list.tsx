// A folder's page in My files or Shared (ADR 0034 decision 8): breadcrumbs, New folder and
// Upload at the top right, the table, and files dropped anywhere on it uploaded here.
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Skeleton } from "skullet/react";
import { EmptyState } from "@/components/empty/empty-state";
import {
  IconDownload,
  IconEllipsis,
  IconFolder,
  IconFolderMove,
  IconFolderPlus,
  IconPencil,
  IconTrash,
  IconUpload,
} from "@/components/icons/central";
import { ListFailed } from "@/components/inbox/thread-list";
import { SettingsRenameDialog } from "@/components/settings/kit/settings-stacked-dialog";
import type { SettingsRowMenuItem } from "@/components/settings/kit/settings-row-menu";
import { Breadcrumbs, BreadcrumbsItem } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { FileTrigger } from "@/components/ui/file-trigger";
import { Menu, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { useSidebar } from "@/components/ui/sidebar";
import { useMember } from "@/hooks/use-session.ts";
import { useChangeNode, useStorageList, useTrashNode, useUploads } from "@/hooks/use-storage.ts";
import type { StorageNode, StoragePlace, StorageSpace } from "@/lib/storage.ts";
import { storageFileUrl } from "@/lib/urls.ts";
import { MoveDialog, NAME_MAX, NewFolderDialog } from "./file-dialogs.tsx";
import { FileTable, FileTableBones } from "./file-table.tsx";
import { storageErrorToast } from "./storage-errors.ts";
import { StorageFrame } from "./storage-frame.tsx";
import { SPACE_LABEL, SPACE_PATH } from "./storage-nav.tsx";
import { UploadsPanel } from "./uploads-panel.tsx";

type Open =
  | { dialog: "new" }
  | { dialog: "rename"; node: StorageNode }
  | { dialog: "move"; node: StorageNode }
  | null;

/** A link inside Storage, keeping the mailbox the switcher shows for the way back to mail. */
function useStorageHref() {
  const { mailbox } = useSearch({ strict: false }) as { mailbox?: string };
  const search = mailbox ? `?mailbox=${encodeURIComponent(mailbox)}` : "";
  return (space: StorageSpace, folderId?: string) =>
    `${SPACE_PATH[space]}${folderId ? `/${encodeURIComponent(folderId)}` : ""}${search}`;
}

export function FileList({ space, folderId }: { space: StorageSpace; folderId?: string }) {
  const place: StoragePlace = folderId ? { parentId: folderId } : { space };
  const list = useStorageList(place);
  const { upload } = useUploads();
  const href = useStorageHref();
  const [open, setOpen] = useState<Open>(null);
  const menu = useRowMenu(setOpen);
  const path = list.folder?.path ?? [];

  const send = (files: File[]) =>
    files.length &&
    upload(files, place, (name, error) => storageErrorToast(error, `“${name}” was not uploaded`));

  return (
    <StorageFrame
      title={<Crumbs space={space} path={path} href={href} />}
      actions={<Actions onNewFolder={() => setOpen({ dialog: "new" })} onFiles={send} />}
    >
      {/* The whole page under the header takes a drop, the empty folder included. */}
      <DropZone
        aria-label={`Upload to ${path.at(-1)?.name ?? SPACE_LABEL[space]}`}
        className="block max-h-none min-h-0 flex-1 overflow-y-auto rounded-none border-0 p-0"
        onDrop={(event) =>
          void Promise.all(
            event.items.flatMap((item) => (item.kind === "file" ? [item.getFile()] : [])),
          ).then(send)
        }
      >
        {list.isPending ? (
          <Skeleton loading label="Loading files" skeleton={<FileTableBones />}>
            {null}
          </Skeleton>
        ) : list.isError ? (
          <Centered>
            <ListFailed retry={() => void list.refetch()} />
          </Centered>
        ) : !list.nodes.length ? (
          <Centered>
            <EmptyState
              figure="drawer"
              title={folderId ? "This folder is empty" : "No files yet"}
            />
          </Centered>
        ) : (
          <FileTable
            label={path.at(-1)?.name ?? SPACE_LABEL[space]}
            nodes={list.nodes}
            date={{ title: "Modified", of: (node) => node.updatedAt }}
            href={(node) => (node.kind === "folder" ? href(node.space, node.id) : undefined)}
            onAction={download}
            menu={menu}
            loadMore={list.hasNextPage ? () => void list.fetchNextPage() : undefined}
            isLoadingMore={list.isFetchingNextPage}
          />
        )}
      </DropZone>
      <UploadsPanel />
      {open?.dialog === "new" && <NewFolderDialog place={place} onClose={() => setOpen(null)} />}
      {open?.dialog === "rename" && <Rename node={open.node} onClose={() => setOpen(null)} />}
      {open?.dialog === "move" && (
        <MoveDialog node={open.node} from={{ space, path }} onClose={() => setOpen(null)} />
      )}
    </StorageFrame>
  );
}

/** Files only ever download (ADR 0034: nothing a person uploaded renders on our origin). */
const download = (node: StorageNode) => window.location.assign(storageFileUrl(node.id));

/** Fills the page under the header, so an empty state sits where the mail lists' do. */
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col">{children}</div>;
}

/** A row's actions. In Shared, Trash is for whoever added the item, owners and admins. */
function useRowMenu(setOpen: (open: Open) => void) {
  const { member } = useMember();
  const trash = useTrashNode();
  const manager = /\b(owner|admin)\b/.test(member.role);
  return (node: StorageNode): SettingsRowMenuItem[] => [
    ...(node.kind === "file"
      ? [{ icon: IconDownload, label: "Download", onAction: () => download(node) }]
      : []),
    { icon: IconPencil, label: "Rename", onAction: () => setOpen({ dialog: "rename", node }) },
    { icon: IconFolderMove, label: "Move", onAction: () => setOpen({ dialog: "move", node }) },
    ...(node.space === "personal" || manager || node.createdByMemberId === member.id
      ? [
          {
            icon: IconTrash,
            label: "Move to trash",
            danger: true,
            onAction: () =>
              trash.mutate(node.id, {
                onError: (error) => storageErrorToast(error, "It was not moved to Trash"),
              }),
          },
        ]
      : []),
  ];
}

function Rename({ node, onClose }: { node: StorageNode; onClose: () => void }) {
  const change = useChangeNode();
  return (
    <SettingsRenameDialog
      title="Rename"
      label="Name"
      maxLength={NAME_MAX}
      name={node.name}
      saving={change.isPending}
      onClose={onClose}
      onSave={(name) =>
        change.mutate(
          { id: node.id, name },
          {
            onSuccess: onClose,
            onError: (error) => storageErrorToast(error, "It was not renamed"),
          },
        )
      }
    />
  );
}

/** New folder and Upload; on a phone their icons alone, so the breadcrumbs keep the room. */
function Actions(props: { onNewFolder: () => void; onFiles: (files: File[]) => void }) {
  const { isMobile } = useSidebar();
  return (
    <>
      <Button
        intent="outline"
        size={isMobile ? "sq-sm" : "sm"}
        aria-label={isMobile ? "New folder" : undefined}
        onPress={props.onNewFolder}
      >
        <IconFolderPlus />
        {!isMobile && "New folder"}
      </Button>
      <FileTrigger allowsMultiple onSelect={(files) => props.onFiles([...(files ?? [])])}>
        <Button size={isMobile ? "sq-sm" : "sm"} aria-label={isMobile ? "Upload" : undefined}>
          <IconUpload />
          {!isMobile && "Upload"}
        </Button>
      </FileTrigger>
    </>
  );
}

// The page's title is its place: the space, then each folder down to this one. In the title's
// size, so a space's root reads like every other list's heading. Past three levels the middle
// folds into a menu, and the last crumb gives way last when the header runs out of room.
// The primitive dims a disabled link, and the current crumb is one: here it is the title.
const CRUMB =
  "min-w-0 gap-1.5 text-lg text-muted-foreground current:text-foreground *:data-current:opacity-100 *:first:min-w-0 *:first:truncate";

function Crumbs(props: {
  space: StorageSpace;
  path: { id: string; name: string }[];
  href: (space: StorageSpace, folderId?: string) => string;
}) {
  const { space, path, href } = props;
  const navigate = useNavigate();
  const folded = path.length > 2 ? path.slice(0, -2) : [];
  const shown = path.slice(folded.length);
  return (
    <Breadcrumbs aria-label="Folder" className="min-w-0 gap-1.5 overflow-hidden">
      <BreadcrumbsItem className={`${CRUMB} shrink-0`} href={href(space)}>
        {SPACE_LABEL[space]}
      </BreadcrumbsItem>
      {folded.length > 0 && (
        <BreadcrumbsItem className={`${CRUMB} shrink-0`}>
          <MenuTrigger>
            <Button intent="plain" size="sq-xs" aria-label="More folders">
              <IconEllipsis />
            </Button>
            <Menu placement="bottom start">
              {folded.map((entry) => (
                <MenuItem
                  key={entry.id}
                  id={entry.id}
                  textValue={entry.name}
                  onAction={() => void navigate({ href: href(space, entry.id) })}
                >
                  <IconFolder data-slot="icon" />
                  <MenuLabel>{entry.name}</MenuLabel>
                </MenuItem>
              ))}
            </Menu>
          </MenuTrigger>
        </BreadcrumbsItem>
      )}
      {shown.map((entry) => (
        <BreadcrumbsItem key={entry.id} className={CRUMB} href={href(space, entry.id)}>
          {entry.name}
        </BreadcrumbsItem>
      ))}
    </Breadcrumbs>
  );
}
