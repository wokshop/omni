// The table Storage's lists share (ADR 0034 decision 8): Name, a date, Size, and each row's menu.
//
// Geometry, on the list header's grid: a row is 44px; the kind icon starts 20px from the left
// edge, where the header's title starts, and the name 12px after it; the row's menu is a 26px
// square whose right edge sits 10px in, under the header's own actions. Dates and sizes are
// muted, in tabular figures, so the names carry the row.
import type { ReactNode } from "react";
import { TableLoadMoreItem } from "react-aria-components/Table";
import { SkeletonBox } from "skullet/react";
import { IconFile, IconFolder } from "@/components/icons/central";
import {
  SettingsRowMenu,
  type SettingsRowMenuItem,
} from "@/components/settings/kit/settings-row-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes, type StorageNode } from "@/lib/storage.ts";

const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

// The date column leaves on a phone, where the name needs the room.
const DATE = "w-36 max-sm:hidden";
const SIZE = "w-24";
const MENU = "w-13.5";
const CELL = "h-11 py-0";

/** The table's own wrapper scrolls nothing (the page does), so the header can stick to it. */
const TABLE = "mx-0 overflow-visible [--gutter:--spacing(5)] [&_table]:table-fixed";
const HEAD = "sticky top-0 z-10 bg-background";

export function FileTable(props: {
  label: string;
  nodes: StorageNode[];
  /** The date column: when it last changed, or when it went to Trash. */
  date: { title: string; of: (node: StorageNode) => string | null };
  /** Where a row leads (a folder's page). */
  href?: (node: StorageNode) => string | undefined;
  /** What pressing a row without a link does (a file downloads). */
  onAction?: (node: StorageNode) => void;
  menu: (node: StorageNode) => SettingsRowMenuItem[];
  loadMore?: (() => void) | undefined;
  isLoadingMore?: boolean;
}) {
  return (
    <Table bleed aria-label={props.label} className={TABLE}>
      <Head date={props.date.title} />
      <TableBody>
        {props.nodes.map((node) => {
          const href = props.href?.(node);
          const when = props.date.of(node);
          return (
            <TableRow
              key={node.id}
              id={node.id}
              textValue={node.name}
              {...(href
                ? { href }
                : props.onAction
                  ? { onAction: () => props.onAction?.(node) }
                  : {})}
            >
              <TableCell className={`${CELL} overflow-hidden`}>
                <span className="flex min-w-0 items-center gap-3">
                  <KindIcon kind={node.kind} />
                  <span className="truncate">{node.name}</span>
                </span>
              </TableCell>
              <TableCell className={`${CELL} ${DATE} text-muted-foreground tabular-nums`}>
                {when ? DAY.format(new Date(when)) : "–"}
              </TableCell>
              <TableCell className={`${CELL} text-muted-foreground tabular-nums`}>
                {node.kind === "file" ? formatBytes(node.size) : "–"}
              </TableCell>
              <TableCell className={`${CELL} px-0 last:pe-2.5`}>
                {/* Not `text-end`: the menu opens inside the cell and would inherit it. */}
                <span className="flex justify-end">
                  <SettingsRowMenu label={`Actions for ${node.name}`} items={props.menu(node)} />
                </span>
              </TableCell>
            </TableRow>
          );
        })}
        <TableLoadMoreItem onLoadMore={props.loadMore} isLoading={props.isLoadingMore} />
      </TableBody>
    </Table>
  );
}

function Head({ date }: { date: string }) {
  return (
    <TableHeader className={HEAD}>
      <TableColumn isRowHeader className="h-9 py-0 text-xs font-normal">
        Name
      </TableColumn>
      <TableColumn className={`h-9 py-0 text-xs font-normal ${DATE}`}>{date}</TableColumn>
      <TableColumn className={`h-9 py-0 text-xs font-normal ${SIZE}`}>Size</TableColumn>
      <TableColumn className={`h-9 py-0 ${MENU}`}>
        <span className="sr-only">Actions</span>
      </TableColumn>
    </TableHeader>
  );
}

function KindIcon({ kind }: { kind: StorageNode["kind"] }): ReactNode {
  const Icon = kind === "folder" ? IconFolder : IconFile;
  return <Icon className="size-icon shrink-0 text-muted-foreground" />;
}

/** The table while its rows load: skullet's boxes on the rows' own grid. */
export function FileTableBones() {
  return (
    <div>
      <div className="h-9 border-b" />
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-3 border-b px-5">
          <SkeletonBox width={15} height={15} radius="var(--radius-sm)" />
          <span className="min-w-0 flex-1">
            <SkeletonBox width={`${25 + ((i * 17) % 30)}%`} height={10} />
          </span>
          <span className="w-36 max-sm:hidden">
            <SkeletonBox width={72} height={10} />
          </span>
          <span className="w-24">
            <SkeletonBox width={44} height={10} />
          </span>
          <span className="w-8.5" />
        </div>
      ))}
    </div>
  );
}
