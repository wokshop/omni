// A folder as tiles, laid out as the Figma grid frame: a square preview (the folder's mark, a
// file's type tile, or an image's thumbnail), then the kind's glyph, the name, and under it what
// it is ("Folder", "PNG · 1.4 MB"). React Aria's grid: arrow keys move between tiles, Enter opens,
// and only the tiles on screen are in the DOM, so a folder of thousands scrolls like a dozen.
import { memo, useState } from "react";
import { Collection } from "react-aria-components/Collection";
import { GridListLoadMoreItem } from "react-aria-components/GridList";
import { GridLayout, Size, Virtualizer } from "react-aria-components/Virtualizer";
import { SkeletonBox } from "skullet/react";
import {
  SettingsRowMenu,
  type SettingsRowMenuItem,
} from "@/components/settings/kit/settings-row-menu";
import { GridList, GridListItem } from "@/components/ui/grid-list";
import { useThumbnail } from "@/hooks/use-storage-preview.ts";
import { fileType } from "@/lib/file-kind.ts";
import { formatBytes, type StorageNode } from "@/lib/storage.ts";
import { FileGlyph, FileTile } from "./file-glyph.tsx";
import { folderIds } from "./file-table.tsx";

// Tiles at least 176px wide, 16px apart (the frame's gap); the caption's 52px under the square.
const LAYOUT = {
  minItemSize: new Size(176, 228),
  maxItemSize: new Size(320, Infinity),
  minSpace: new Size(16, 16),
};

export interface FileGridProps {
  label: string;
  nodes: StorageNode[];
  href: (node: StorageNode) => string | undefined;
  /** Where a file's bytes are read, for an image's thumbnail. */
  fileUrl: (node: StorageNode) => string;
  /** The file open in the preview, as the grid's one selected tile (as `FileTable`'s `open`). */
  open: { id: string | undefined; onChange: (id: string | null) => void };
  menu: (node: StorageNode) => SettingsRowMenuItem[];
  loadMore?: (() => void) | undefined;
  isLoadingMore?: boolean;
}

export const FileGrid = memo(function FileGrid(props: FileGridProps) {
  return (
    <Virtualizer layout={GridLayout} layoutOptions={LAYOUT}>
      <GridList
        aria-label={props.label}
        layout="grid"
        // The grid is its own scroll container (the virtualizer measures it). No padding: the
        // layout spaces the tiles from its edges as it spaces them from each other (16px).
        className="min-h-0 w-full flex-1 overflow-y-auto bg-transparent"
        selectionMode="single"
        selectionBehavior="replace"
        selectedKeys={props.open.id ? [props.open.id] : []}
        disabledKeys={folderIds(props.nodes)}
        disabledBehavior="selection"
        onSelectionChange={(keys) => {
          const [id] = keys === "all" ? [] : [...keys];
          props.open.onChange(id === undefined ? null : String(id));
        }}
      >
        <Collection items={props.nodes} dependencies={[props.menu, props.href, props.fileUrl]}>
          {(node) => (
            <GridListItem
              id={node.id}
              textValue={node.name}
              href={node.kind === "folder" ? props.href(node) : undefined}
              className="items-start rounded-xl"
            >
              <Tile node={node} url={props.fileUrl(node)} menu={props.menu(node)} />
            </GridListItem>
          )}
        </Collection>
        <GridListLoadMoreItem
          onLoadMore={props.loadMore}
          isLoading={props.isLoadingMore}
          scrollOffset={2}
        />
      </GridList>
    </Virtualizer>
  );
});

function Tile(props: { node: StorageNode; url: string; menu: SettingsRowMenuItem[] }) {
  const { node } = props;
  const type = node.kind === "file" ? fileType(node.name, node.mimeType) : null;
  const meta = type ? `${type.label} · ${formatBytes(node.size)}` : "Folder";
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {/* The square: the card recipe (border, surface, crisp drop). Hover washes it, a press
          squeezes it a touch (cards squeeze least), and the open file's edge turns primary. */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-surface shadow-raised transition-[scale,border-color] duration-150 ease-out group-active:scale-[.99] after:pointer-events-none after:absolute after:inset-0 after:bg-hover after:opacity-0 after:transition-opacity after:duration-150 group-hover:after:opacity-100 group-data-selected:border-primary motion-reduce:transition-none">
        {type?.preview === "image" && type.raster ? (
          <Thumbnail node={node} url={props.url} raster={type.raster} />
        ) : node.kind === "folder" ? (
          <FileGlyph kind="folder" className="size-16 text-muted-foreground" />
        ) : (
          <FileTile kind={type?.kind ?? "other"} size="lg" />
        )}
        {/* The tile's menu, in its corner: shown on hover and focus; always on touch. */}
        <div className="absolute top-2 right-2 z-10 rounded-lg bg-background opacity-0 shadow-raised transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none">
          <SettingsRowMenu label={`Actions for ${node.name}`} items={props.menu} />
        </div>
      </div>
      {/* The caption: the glyph on the name's line, the kind under the name. */}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 px-0.5">
        <FileGlyph
          kind={type?.kind ?? "folder"}
          className="size-icon text-muted-foreground group-hover:text-foreground"
        />
        <span className="truncate text-md text-foreground">{node.name}</span>
        <span className="col-start-2 truncate text-xs text-muted-foreground tabular-nums">
          {meta}
        </span>
      </div>
    </div>
  );
}

/** An image's thumbnail, faded in over its type tile once it has decoded. */
function Thumbnail(props: { node: StorageNode; url: string; raster: string }) {
  const thumb = useThumbnail(
    { url: props.url, version: props.node.updatedAt, size: props.node.size },
    props.raster,
    true,
  );
  const [shown, setShown] = useState(false);
  return (
    <>
      {!shown && <FileTile kind="image" size="lg" />}
      {thumb.data && (
        <img
          src={thumb.data.url}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={() => setShown(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-200 ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </>
  );
}

/** The grid while it loads: skullet's squares and captions on the tiles' own layout. */
export function FileGridBones() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4 p-4">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-square">
            <SkeletonBox width="100%" height="100%" radius="var(--radius-xl)" />
          </div>
          <SkeletonBox width={`${40 + ((i * 17) % 40)}%`} height={10} />
          <SkeletonBox width={64} height={8} />
        </div>
      ))}
    </div>
  );
}
