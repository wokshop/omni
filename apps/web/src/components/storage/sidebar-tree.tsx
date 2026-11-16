// Storage's sidebar below its places, after Skiff Drive's: a space's folders as a tree in the
// sidebar's own rows. A folder links to its page and its chevron opens it in place (its contents
// load the first time); a file inside links to its folder with the file open in the preview.
// Which folders are open is kept for the tab, so the tree survives moving between folders.
import { useLocation } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { SkeletonBox } from "skullet/react";
import { IconChevronRight } from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { SidebarItem, SidebarLabel, SidebarSection } from "@/components/ui/sidebar";
import { useStorageList } from "@/hooks/use-storage.ts";
import { fileType } from "@/lib/file-kind.ts";
import type { StorageNode, StorageSpace } from "@/lib/storage.ts";
import { FileGlyph } from "./file-glyph.tsx";
import { SPACE_PATH } from "./storage-nav.tsx";

/** A level shows this many items; the folder's page has the rest. */
const SHOWN = 40;
/** Each level steps in by 16px, so a child's glyph sits under its parent's name. */
const INDENT_PX = 16;

export function SidebarTree(props: { space: StorageSpace; label: string; search: string }) {
  const root = useStorageList({ space: props.space });
  const folders = root.nodes.filter((node) => node.kind === "folder");
  if (!root.isPending && folders.length === 0) return null;
  return (
    <SidebarSection label={props.label}>
      {root.isPending ? (
        <Bones depth={0} />
      ) : (
        folders
          .slice(0, SHOWN)
          .map((node) => <Folder key={node.id} node={node} depth={0} search={props.search} />)
      )}
    </SidebarSection>
  );
}

function Folder(props: { node: StorageNode; depth: number; search: string }) {
  const { node, depth } = props;
  const open = useExpanded(node.id);
  const { pathname } = useLocation();
  const href = `${SPACE_PATH[node.space]}/${encodeURIComponent(node.id)}`;
  return (
    <>
      {/* The row and its chevron are siblings: a button can't sit inside a link. */}
      <div className="group/tree relative">
        <SidebarItem
          href={href + props.search}
          isCurrent={pathname === href}
          style={{ paddingInlineStart: 8 + depth * INDENT_PX }}
          className="pe-8"
        >
          <FileGlyph kind="folder" className="size-icon" />
          <SidebarLabel>{node.name}</SidebarLabel>
        </SidebarItem>
        {/* Shown on the row's hover and while open, always for keyboard and touch. */}
        <Button
          intent="plain"
          size="sq-xs"
          aria-label={`${open.value ? "Collapse" : "Expand"} ${node.name}`}
          aria-expanded={open.value}
          onPress={open.toggle}
          className="absolute end-1 top-1 opacity-0 transition-opacity duration-150 group-hover/tree:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none"
        >
          <IconChevronRight
            className={`transition-transform duration-150 ease-out motion-reduce:transition-none ${open.value ? "rotate-90" : ""}`}
          />
        </Button>
      </div>
      {open.value && <Contents node={node} depth={depth + 1} search={props.search} />}
    </>
  );
}

/** An open folder's folders, then its files. */
function Contents(props: { node: StorageNode; depth: number; search: string }) {
  const list = useStorageList({ parentId: props.node.id });
  if (list.isPending) return <Bones depth={props.depth} />;
  return list.nodes
    .slice(0, SHOWN)
    .map((node) =>
      node.kind === "folder" ? (
        <Folder key={node.id} node={node} depth={props.depth} search={props.search} />
      ) : (
        <File key={node.id} node={node} depth={props.depth} search={props.search} />
      ),
    );
}

function File(props: { node: StorageNode; depth: number; search: string }) {
  const { node } = props;
  const { pathname, searchStr } = useLocation();
  const folder = `${SPACE_PATH[node.space]}${node.parentId ? `/${encodeURIComponent(node.parentId)}` : ""}`;
  const query = new URLSearchParams(props.search);
  query.set("file", node.id);
  const open = pathname === folder && new URLSearchParams(searchStr).get("file") === node.id;
  return (
    <SidebarItem
      href={`${folder}?${query}`}
      isCurrent={open}
      style={{ paddingInlineStart: 8 + props.depth * INDENT_PX }}
    >
      <FileGlyph kind={fileType(node.name, node.mimeType).kind} className="size-icon" />
      <SidebarLabel>{node.name}</SidebarLabel>
    </SidebarItem>
  );
}

function Bones(props: { depth: number }) {
  return (
    <div style={{ paddingInlineStart: 8 + props.depth * INDENT_PX }}>
      {[55, 40, 65].map((width) => (
        <div key={width} className="flex h-8 items-center gap-2.5">
          <SkeletonBox width={15} height={15} radius="var(--radius-sm)" />
          <SkeletonBox width={`${width}%`} height={8} />
        </div>
      ))}
    </div>
  );
}

// Open folders, for the tab: one store, so every row and the page agree.
const KEY = "omni:storage-tree";
const listeners = new Set<() => void>();
let expanded = read();

function read(): ReadonlySet<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set(); // Storage unavailable: open folders last for the page.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useExpanded(id: string) {
  const value = useSyncExternalStore(subscribe, () => expanded.has(id));
  const [toggle] = useState(() => () => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
    try {
      sessionStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // Kept for the page only.
    }
    for (const listener of listeners) listener();
  });
  return { value, toggle };
}
