// A list row's 32px tile: the kind's glyph, and for an image or a PDF its picture over it once
// drawn (the same cached thumbnail its card shows, read once the row nears the screen).
import { useRef, useState } from "react";
import { useThumbnail } from "@/hooks/use-storage-preview.ts";
import { fileType } from "@/lib/file-kind.ts";
import type { StorageNode } from "@/lib/storage.ts";
import { useSeen } from "./file-card.tsx";
import { FileTile } from "./file-glyph.tsx";

export function RowTile(props: { node: StorageNode; url: string }) {
  const { node } = props;
  const type = node.kind === "file" ? fileType(node.name, node.mimeType) : null;
  const of =
    type?.preview === "image" && type.raster
      ? { raster: type.raster }
      : type?.preview === "pdf"
        ? ("pdf" as const)
        : null;
  if (!of) return <FileTile kind={type?.kind ?? "folder"} />;
  return <PictureTile node={node} url={props.url} of={of} kind={type?.kind ?? "image"} />;
}

function PictureTile(props: {
  node: StorageNode;
  url: string;
  of: { raster: string } | "pdf";
  kind: Parameters<typeof FileTile>[0]["kind"];
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const near = useSeen(anchor);
  const thumb = useThumbnail(
    { url: props.url, version: props.node.updatedAt, size: props.node.size },
    props.of,
    near,
  );
  const [shown, setShown] = useState(false);
  return (
    <span ref={anchor} className="relative shrink-0">
      <FileTile kind={props.kind} />
      {thumb.data && (
        <img
          src={thumb.data.url}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={() => setShown(true)}
          // A photo from its middle; a page from its top, where its title is.
          className={`absolute inset-0 size-full rounded-lg border object-cover ${props.of === "pdf" ? "object-top" : ""} transition-opacity duration-200 ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
