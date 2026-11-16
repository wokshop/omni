// What a folder page shows under its header: the files as a list or a grid (or their skeleton,
// the failed load, the empty folder), all inside one drop target; and the header's actions.
import { useMemo, type ReactNode } from "react";
import { Skeleton } from "skullet/react";
import { EmptyState } from "@/components/empty/empty-state";
import { IconFolderPlus, IconLayoutGrid, IconList, IconUpload } from "@/components/icons/central";
import { ListFailed } from "@/components/inbox/thread-list";
import type { SettingsRowMenuItem } from "@/components/settings/kit/settings-row-menu";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { FileTrigger } from "@/components/ui/file-trigger";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import type { StorageView } from "@/hooks/use-storage-view.ts";
import type { StorageNode } from "@/lib/storage.ts";
import { FileGrid, FileGridBones } from "./file-grid.tsx";
import { FileTable, FileTableBones } from "./file-table.tsx";
import type { FolderSource, OpenFile } from "./folder-view.tsx";

const MODIFIED = { title: "Modified", of: (node: StorageNode) => node.updatedAt };

interface Actions {
  onNewFolder: () => void;
  onFiles: (files: File[]) => void;
}

export function FolderBody(
  props: Actions & {
    source: FolderSource;
    view: StorageView;
    menu: (node: StorageNode) => SettingsRowMenuItem[];
    open: OpenFile;
  },
) {
  const { source } = props;
  return (
    // The whole page under the header takes a drop, the empty folder included. The list scrolls
    // here; the grid is its own scroll container (its virtualizer measures it).
    <DropZone
      bare
      aria-label={`Upload to ${source.label}`}
      isDisabled={!source.canWrite}
      className={
        props.view === "grid" && source.list.nodes.length > 0
          ? // min-w-0: else the grid's one-row first layout sets the page's width.
            "flex min-h-0 min-w-0 flex-1 flex-col"
          : "min-h-0 flex-1 overflow-y-auto"
      }
      onDrop={(event) =>
        void Promise.all(
          event.items.flatMap((item) => (item.kind === "file" ? [item.getFile()] : [])),
        ).then(props.onFiles)
      }
    >
      <Content {...props} />
    </DropZone>
  );
}

function Content(props: Parameters<typeof FolderBody>[0]) {
  const { source, open } = props;
  const { list } = source;
  const { select } = open;
  const selected = useMemo(
    () => ({ id: open.id, onChange: (id: string | null) => select(id) }),
    [open.id, select],
  );
  if (list.isPending) {
    return (
      <Skeleton
        loading
        label="Loading files"
        skeleton={props.view === "grid" ? <FileGridBones /> : <FileTableBones />}
      >
        {null}
      </Skeleton>
    );
  }
  if (list.isError) {
    return (
      <Centered>
        <ListFailed retry={() => void list.refetch()} />
      </Centered>
    );
  }
  if (!list.nodes.length) {
    return (
      <Centered>
        <EmptyState figure="drawer" {...source.empty}>
          {source.canWrite && <EmptyActions {...props} />}
        </EmptyState>
      </Centered>
    );
  }
  const loadMore = list.hasNextPage ? () => void list.fetchNextPage() : undefined;
  if (props.view === "grid") {
    return (
      <FileGrid
        label={source.label}
        nodes={list.nodes}
        href={source.folderHref}
        fileUrl={source.fileUrl}
        open={selected}
        menu={props.menu}
        loadMore={loadMore}
        isLoadingMore={list.isFetchingNextPage}
      />
    );
  }
  return (
    <FileTable
      label={source.label}
      nodes={list.nodes}
      date={MODIFIED}
      href={hrefOfFolders(source.folderHref)}
      open={selected}
      menu={props.menu}
      loadMore={loadMore}
      isLoadingMore={list.isFetchingNextPage}
    />
  );
}

const folderHrefs = new WeakMap<
  (node: StorageNode) => string,
  (node: StorageNode) => string | undefined
>();
/** A row's link: a folder's page; a file has none (it opens its preview). Stable per source. */
function hrefOfFolders(folderHref: (node: StorageNode) => string) {
  let href = folderHrefs.get(folderHref);
  if (!href) {
    href = (node) => (node.kind === "folder" ? folderHref(node) : undefined);
    folderHrefs.set(folderHref, href);
  }
  return href;
}

/** Fills the page under the header, so an empty state sits where the mail lists' do. */
function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col">{children}</div>;
}

/** An empty folder's way on, as the mail lists' empty states offer theirs: Upload first. */
function EmptyActions(props: Actions) {
  return (
    <>
      <FileTrigger allowsMultiple onSelect={(files) => props.onFiles([...(files ?? [])])}>
        <Button size="sm">Upload</Button>
      </FileTrigger>
      <Button size="sm" intent="outline" onPress={props.onNewFolder}>
        New folder
      </Button>
    </>
  );
}

/**
 * List or grid, then New folder and Upload for whoever may write; on a phone the two buttons are
 * their icons alone, so the breadcrumbs keep the room.
 */
export function HeaderActions(
  props: Actions & { view: StorageView; onView: (view: StorageView) => void; canWrite: boolean },
) {
  const phone = useIsMobile();
  return (
    <>
      <ToggleGroup
        size="sq-xs"
        aria-label="Layout"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[props.view]}
        onSelectionChange={(keys) => {
          const [next] = [...keys];
          if (next === "list" || next === "grid") props.onView(next);
        }}
      >
        <LayoutOption id="list" label="List">
          <IconList />
        </LayoutOption>
        <LayoutOption id="grid" label="Grid">
          <IconLayoutGrid />
        </LayoutOption>
      </ToggleGroup>
      {props.canWrite && (
        <>
          <Button
            intent="outline"
            size={phone ? "sq-sm" : "sm"}
            aria-label={phone ? "New folder" : undefined}
            onPress={props.onNewFolder}
          >
            <IconFolderPlus />
            {!phone && "New folder"}
          </Button>
          <FileTrigger allowsMultiple onSelect={(files) => props.onFiles([...(files ?? [])])}>
            <Button size={phone ? "sq-sm" : "sm"} aria-label={phone ? "Upload" : undefined}>
              <IconUpload />
              {!phone && "Upload"}
            </Button>
          </FileTrigger>
        </>
      )}
    </>
  );
}

function LayoutOption(props: { id: StorageView; label: string; children: ReactNode }) {
  return (
    <TooltipTrigger delay={400}>
      <ToggleGroupItem id={props.id} aria-label={props.label}>
        {props.children}
      </ToggleGroupItem>
      <Tooltip>{props.label}</Tooltip>
    </TooltipTrigger>
  );
}
