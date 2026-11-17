// A folder card's square drawn as a folder, layered over the card's square: its back, a few of
// what it holds standing in it as sheets, and the pocket in front hiding all but their tops. The
// sheets are the folder's first files (an image shows its thumbnail, anything else its glyph in
// the corner), then its subfolders; an empty folder is the bare pocket. The contents come from
// the folder's own first page, read once the card nears the screen, so opening it finds it cached.
import { useRef, useState, type CSSProperties } from "react";
import { useStorageList } from "@/hooks/use-storage.ts";
import { useThumbnail } from "@/hooks/use-storage-preview.ts";
import { fileType } from "@/lib/file-kind.ts";
import type { StorageNode } from "@/lib/storage.ts";
import { useSeen } from "./file-card.tsx";
import { FileGlyph } from "./file-glyph.tsx";

type Spot = readonly [left: number, top: number, tilt: number];

// Each sheet's left and top edge (percent of the square) and tilt, by how many there are. Sheets
// are half the square wide, fanned so the ones behind still show a third of their top; the
// pocket's edge is at 45%, so each shows its top 30% or so.
const FAN: readonly (readonly Spot[])[] = [
  [],
  [[25, 13, 0]],
  [
    [14, 15, -2],
    [36, 11, 2],
  ],
  [
    [8, 17, -3],
    [25, 11, 0],
    [42, 15, 3],
  ],
];

/** The folder drawn; without `node` (a folder being named), or `peek` off, the bare pocket. */
export function FolderArt(props: {
  node?: StorageNode;
  peek?: boolean | undefined;
  fileUrl?: ((node: StorageNode) => string) | undefined;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const near = useSeen(anchor);
  const { node, fileUrl } = props;
  const enabled = !!node && !!fileUrl && props.peek !== false && near;
  const contents = useStorageList({ parentId: node?.id ?? "" }, { enabled });
  const sheets = enabled ? pick(contents.nodes) : [];
  const fan = FAN[sheets.length] ?? [];
  return (
    <div aria-hidden className="absolute inset-0 bg-accent">
      <span ref={anchor} className="absolute inset-0" />
      {fileUrl &&
        sheets.map((sheet, i) => (
          <Sheet key={sheet.id} node={sheet} url={fileUrl(sheet)} spot={fan[i] ?? [25, 13, 0]} />
        ))}
      {/* The pocket, in the card's own surface; its top edge is what reads as a folder. */}
      <div className="absolute inset-x-0 top-9/20 bottom-0 border-t bg-surface" />
    </div>
  );
}

/** The folder's first files, then its subfolders, three at most. */
function pick(nodes: StorageNode[]) {
  const files = nodes.filter((n) => n.kind === "file");
  const folders = nodes.filter((n) => n.kind === "folder");
  return [...files, ...folders].slice(0, FAN.length - 1);
}

/** One sheet: an image's thumbnail filling it, else its glyph 8px in from the top left. */
function Sheet(props: { node: StorageNode; url: string; spot: Spot }) {
  const [left, top, tilt] = props.spot;
  const { node } = props;
  const type = node.kind === "file" ? fileType(node.name, node.mimeType) : null;
  const style: CSSProperties = { left: `${left}%`, top: `${top}%`, rotate: `${tilt}deg` };
  return (
    <div
      style={style}
      className="absolute flex h-1/2 w-1/2 overflow-hidden rounded-sm border bg-background p-2 shadow-raised"
    >
      <FileGlyph kind={type?.kind ?? "folder"} className="size-icon text-muted-foreground" />
      {type?.preview === "image" && type.raster && (
        <SheetImage node={node} url={props.url} raster={type.raster} />
      )}
    </div>
  );
}

/** An image sheet's thumbnail, faded in over the glyph once it has decoded. */
function SheetImage(props: { node: StorageNode; url: string; raster: string }) {
  const thumb = useThumbnail(
    { url: props.url, version: props.node.updatedAt, size: props.node.size },
    props.raster,
    true,
  );
  const [shown, setShown] = useState(false);
  if (!thumb.data) return null;
  return (
    <img
      src={thumb.data.url}
      alt=""
      decoding="async"
      draggable={false}
      onLoad={() => setShown(true)}
      className={`absolute inset-0 size-full object-cover transition-opacity duration-200 ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
    />
  );
}
