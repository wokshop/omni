// A folder card's square, layered over the card's own surface: a loose stack of what the folder
// holds, with no folder drawn, because the stack is the folder. Its first files come first (an
// image shows its thumbnail, anything else its glyph), then its subfolders, three at most; an
// empty folder is one dashed card. The contents come from the folder's own first page, read once
// the card nears the screen, so opening the folder afterwards finds it cached.
import { useRef, useState, type CSSProperties } from "react";
import { useStorageList } from "@/hooks/use-storage.ts";
import { useThumbnail } from "@/hooks/use-storage-preview.ts";
import { fileType } from "@/lib/file-kind.ts";
import type { StorageNode } from "@/lib/storage.ts";
import { useSeen } from "./file-card.tsx";
import { FileGlyph } from "./file-glyph.tsx";

type Spot = readonly [left: number, top: number, width: number, height: number];

// Where each card sits (percent of the square), by how many there are, the front card first.
// Spread so cards overlap only at their edges and every card's middle, where its glyph sits,
// stays in view; the stack as a whole sits a touch above the square's middle.
const EMPTY: Spot = [27, 22, 46, 50];
const STACK: readonly (readonly Spot[])[] = [
  [EMPTY],
  [
    [42, 42, 42, 40],
    [18, 16, 44, 44],
  ],
  [
    [29, 47, 42, 38],
    [10, 13, 40, 37],
    [50, 19, 40, 37],
  ],
];

/** The folder drawn; without `node` (a folder being named), or `peek` off, one dashed card. */
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
  const cards = enabled ? pick(contents.nodes) : [];
  const spots = STACK[cards.length - 1] ?? [];
  return (
    <div aria-hidden className="absolute inset-0 bg-surface">
      <span ref={anchor} className="absolute inset-0" />
      {!fileUrl || cards.length === 0 ? (
        <div style={place(EMPTY)} className="absolute rounded-md border border-dashed" />
      ) : (
        // Drawn back to front, so the first card lands on top.
        cards
          .map((card, i) => (
            <Card key={card.id} node={card} url={fileUrl(card)} style={place(spots[i] ?? EMPTY)} />
          ))
          .toReversed()
      )}
    </div>
  );
}

const place = ([left, top, width, height]: Spot): CSSProperties => ({
  left: `${left}%`,
  top: `${top}%`,
  width: `${width}%`,
  height: `${height}%`,
});

/** The folder's first files, then its subfolders, three at most. */
function pick(nodes: StorageNode[]) {
  const files = nodes.filter((n) => n.kind === "file");
  const folders = nodes.filter((n) => n.kind === "folder");
  return [...files, ...folders].slice(0, STACK.length);
}

/** One card: an image's thumbnail filling it, else its glyph in the middle. */
function Card(props: { node: StorageNode; url: string; style: CSSProperties }) {
  const { node } = props;
  const type = node.kind === "file" ? fileType(node.name, node.mimeType) : null;
  return (
    <div
      style={props.style}
      className="absolute flex items-center justify-center overflow-hidden rounded-md border bg-background shadow-raised"
    >
      <FileGlyph kind={type?.kind ?? "folder"} className="size-6 text-muted-foreground" />
      {type?.preview === "image" && type.raster && (
        <CardImage node={node} url={props.url} raster={type.raster} />
      )}
    </div>
  );
}

/** An image card's thumbnail, faded in over the glyph once it has decoded. */
function CardImage(props: { node: StorageNode; url: string; raster: string }) {
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
