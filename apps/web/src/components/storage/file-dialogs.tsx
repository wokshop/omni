// Storage's small dialogs: name a new folder, confirm deleting for good, pick where to move.
// Rename is the settings kit's own rename dialog.
import { useState } from "react";
import { IconFolder } from "@/components/icons/central";
import { SettingsFormDialog } from "@/components/settings/kit/settings-stacked-dialog";
import { Breadcrumbs, BreadcrumbsItem } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/field";
import { GridList, GridListItem } from "@/components/ui/grid-list";
import { Input } from "@/components/ui/input";
import { TextField } from "@/components/ui/text-field";
import {
  useChangeNode,
  useCreateFolder,
  useDeleteForever,
  useHasSharedFiles,
  useStorageList,
} from "@/hooks/use-storage.ts";
import type { StorageNode, StoragePlace, StorageSpace } from "@/lib/storage.ts";
import { storageErrorToast } from "./storage-errors.ts";
import { SPACE_LABEL } from "./storage-nav.tsx";

/** The longest name the API takes. */
export const NAME_MAX = 255;

/** Mount it while open, so the field starts empty. */
export function NewFolderDialog(props: { place: StoragePlace; onClose: () => void }) {
  const create = useCreateFolder();
  const [value, setValue] = useState("");
  const name = value.trim();
  return (
    <SettingsFormDialog
      isOpen
      onOpenChange={(open) => !open && props.onClose()}
      title="New folder"
      action="Create"
      disabled={!name}
      saving={create.isPending}
      onSubmit={() =>
        create.mutate(
          { name, place: props.place },
          {
            onSuccess: props.onClose,
            onError: (error) => storageErrorToast(error, "The folder was not created"),
          },
        )
      }
    >
      <TextField isRequired autoFocus maxLength={NAME_MAX} value={value} onChange={setValue}>
        <Label>Name</Label>
        <Input autoComplete="off" />
      </TextField>
    </SettingsFormDialog>
  );
}

/** Asks before deleting from Trash for good; the button says what happens. */
export function DeleteForeverDialog(props: { node: StorageNode; onClose: () => void }) {
  const remove = useDeleteForever();
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      isOpen
      onOpenChange={(open) => !open && !remove.isPending && props.onClose()}
    >
      <DialogHeader className="pe-0">
        <DialogTitle className="break-words">Delete “{props.node.name}” forever?</DialogTitle>
      </DialogHeader>
      <DialogFooter>
        <DialogClose intent="outline" isDisabled={remove.isPending}>
          Cancel
        </DialogClose>
        <Button
          intent="danger"
          isPending={remove.isPending}
          onPress={() =>
            remove.mutate(props.node.id, {
              onSuccess: props.onClose,
              onError: (error) => storageErrorToast(error, "It was not deleted"),
            })
          }
        >
          Delete forever
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

const SPACES = ["personal", "shared"] as const;

/** Where the move dialog is looking: every space (a company's top level), or inside one. */
type Browse = { space: StorageSpace; path: { id: string; name: string }[] } | null;

/**
 * Picks the folder to move `node` into: the folders of the place on screen, one level at a time,
 * and Move here. It opens where the node is. In a company the top level lists My files and
 * Shared, so a move can cross between them.
 */
export function MoveDialog(props: {
  node: StorageNode;
  /** The folder the node is in, as the list on screen has it. */
  from: { space: StorageSpace; path: { id: string; name: string }[] };
  onClose: () => void;
}) {
  const hasShared = useHasSharedFiles();
  const move = useChangeNode();
  const [at, setAt] = useState<Browse>(props.from);
  const folder = at?.path.at(-1);
  const place: StoragePlace | null = !at
    ? null
    : folder
      ? { parentId: folder.id }
      : { space: at.space };
  const list = useStorageList(place ?? { space: "personal" }, { enabled: !!place });
  // Itself is no place to move a folder to, and the API pages folders first.
  const folders = list.nodes.filter((n) => n.kind === "folder" && n.id !== props.node.id);
  const here =
    !!at && (folder?.id ?? null) === props.node.parentId && at.space === props.node.space;

  const crumbs = [
    ...(hasShared ? [{ id: "top", name: "Files", go: () => setAt(null) }] : []),
    ...(at
      ? [
          { id: at.space, name: SPACE_LABEL[at.space], go: () => setAt({ ...at, path: [] }) },
          ...at.path.map((entry, i) => ({
            ...entry,
            go: () => setAt({ ...at, path: at.path.slice(0, i + 1) }),
          })),
        ]
      : []),
  ];

  return (
    <Dialog size="sm" isOpen onOpenChange={(open) => !open && !move.isPending && props.onClose()}>
      <DialogHeader>
        <DialogTitle className="truncate">Move “{props.node.name}”</DialogTitle>
      </DialogHeader>
      <DialogBody className="gap-2">
        <Breadcrumbs aria-label="Folder" className="min-h-5 flex-wrap gap-x-1.5 gap-y-1">
          {crumbs.map((crumb) => (
            <BreadcrumbsItem
              key={crumb.id}
              className="gap-1.5 text-muted-foreground current:text-foreground *:data-current:opacity-100"
              onPress={crumb.go}
            >
              {crumb.name}
            </BreadcrumbsItem>
          ))}
        </Breadcrumbs>
        {/* Five rows tall whatever it holds, so the dialog keeps its size from folder to folder. */}
        <GridList
          aria-label="Folders"
          className="-mx-2 h-45 overflow-y-auto"
          items={
            at
              ? folders.map(({ id, name }) => ({ id, name }))
              : SPACES.map((space) => ({ id: space as string, name: SPACE_LABEL[space] }))
          }
          onAction={(key) => {
            if (!at) return setAt({ space: key as StorageSpace, path: [] });
            const next = folders.find((n) => n.id === key);
            if (next) setAt({ ...at, path: [...at.path, { id: next.id, name: next.name }] });
          }}
          renderEmptyState={() => null}
        >
          {(item) => (
            <GridListItem
              id={item.id}
              textValue={item.name}
              className="h-9 cursor-pointer gap-2.5 rounded-lg px-2 hover:bg-accent"
            >
              <IconFolder className="size-icon shrink-0 text-muted-foreground" />
              <span className="truncate">{item.name}</span>
            </GridListItem>
          )}
        </GridList>
      </DialogBody>
      <DialogFooter>
        <DialogClose intent="outline" isDisabled={move.isPending}>
          Cancel
        </DialogClose>
        <Button
          isDisabled={!place || here}
          isPending={move.isPending}
          onPress={() =>
            place &&
            move.mutate(
              { id: props.node.id, place },
              {
                onSuccess: props.onClose,
                onError: (error) => storageErrorToast(error, "It was not moved"),
              },
            )
          }
        >
          Move here
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
