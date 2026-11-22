import { useRef, useState, type CSSProperties } from "react";
import { useStorageList } from "@/hooks/use-storage.ts";
import { usePdfPages } from "@/hooks/use-storage-preview.ts";
import { fileType } from "@/lib/file-kind.ts";
import type { StorageNode } from "@/lib/storage.ts";
import { useSeen } from "./file-card.tsx";
import { FileGlyph } from "./file-glyph.tsx";
import { hasThumbnail, ThumbnailImage } from "./thumbnail-image.tsx";

type Sheet = readonly [left: number, top: number, turn: number];

const SHEET_WIDTH = 38;
const SHEET_HEIGHT = 46;
const ALONE: Sheet = [31, 14, 0];
const SHEETS: readonly (readonly Sheet[])[] = [
  [ALONE],
  [
    [20, 18, -6],
    [42, 14, 5],
  ],
  [
    [14, 21, -9],
    [31, 13, 0],
    [48, 19, 8],
  ],
];

/**
 * The folder drawn as one: its back with a tab, up to three of its files standing in it, and the
 * front pocket over their lower half; the files rise out of it on hover. Positions are percent of
 * the square: back and front keep 8% from its sides and bottom. Without `node` (a folder being
 * named), or with `peek` off, the empty pocket.
 */
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
  const spots = SHEETS[cards.length - 1] ?? [];
  return (
    <div
      aria-hidden
      data-slot="folder-art"
      className="relative aspect-square overflow-hidden rounded-lg border border-transparent"
    >
      <span ref={anchor} className="absolute inset-0" />
      <span className="absolute start-[8%] top-[10%] h-[12%] w-[34%] rounded-t-md bg-secondary" />
      <span className="absolute inset-x-[8%] top-[16%] bottom-[8%] rounded-lg rounded-ss-none bg-secondary" />
      {fileUrl &&
        cards.map((card, i) => (
          <Card key={card.id} node={card} url={fileUrl(card)} sheet={spots[i] ?? ALONE} />
        ))}
      <span className="absolute inset-x-[8%] top-[46%] bottom-[8%] rounded-lg border border-foreground/5 bg-accent" />
    </div>
  );
}

function pick(nodes: StorageNode[]) {
  const files = nodes.filter((n) => n.kind === "file");
  const folders = nodes.filter((n) => n.kind === "folder");
  return [...files, ...folders].slice(0, SHEETS.length);
}

function Card(props: { node: StorageNode; url: string; sheet: Sheet }) {
  const { node } = props;
  const [left, top, turn] = props.sheet;
  const type = node.kind === "file" ? fileType(node.name, node.mimeType) : null;
  const style: CSSProperties = {
    left: `${left}%`,
    top: `${top}%`,
    width: `${SHEET_WIDTH}%`,
    height: `${SHEET_HEIGHT}%`,
    rotate: `${turn}deg`,
  };
  return (
    <div
      style={style}
      className="absolute flex items-start justify-center overflow-hidden rounded-sm border border-foreground/10 bg-background pt-[18%] transition-[translate] duration-200 ease-out group-hover:-translate-y-[10%] motion-reduce:transition-none"
    >
      <FileGlyph kind={type?.kind ?? "folder"} className="size-5 text-muted-foreground" />
      {hasThumbnail(node) ? (
        <ThumbnailImage
          node={node}
          url={props.url}
          size={256}
          className="absolute inset-0 size-full object-cover"
        />
      ) : type?.preview === "pdf" ? (
        <PdfImage node={node} url={props.url} />
      ) : null}
    </div>
  );
}

function PdfImage(props: { node: StorageNode; url: string }) {
  const thumb = usePdfPages(
    { url: props.url, version: props.node.updatedAt, size: props.node.size },
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
      className={`absolute inset-0 size-full object-cover object-top transition-opacity duration-200 ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
    />
  );
}
