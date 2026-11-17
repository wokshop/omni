// The open file beside its folder, as an open thread sits beside the inbox: a 48px top bar (the
// name, cut in its middle, then Previous, Next, Download, the file's menu, Full screen and
// Close), the stage with the tools' island under it (Comment, the area tool on a PDF, the
// versions), and the file's details on one line at the foot. Open threads' boxes show over a
// PDF's pages; reading the threads is the comments sidebar's.
import { useState, type ReactNode } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconMaximize,
  IconMinimize,
  IconX,
} from "@/components/icons/central";
import {
  SettingsRowMenu,
  type SettingsRowMenuItem,
} from "@/components/settings/kit/settings-row-menu";
import { PageNav } from "@/components/shell/page-nav";
import { Button } from "@/components/ui/button";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/ui/description-list";
import { Heading } from "@/components/ui/heading";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { useRestoreVersion, useStorageComments, useStorageVersions } from "@/hooks/use-storage.ts";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { fileType } from "@/lib/file-kind.ts";
import { formatBytes, type StorageNode } from "@/lib/storage.ts";
import { storageVersionUrl, type StorageVersions } from "@/lib/storage-versions.ts";
import { TypeBadge } from "../file-glyph.tsx";
import { DAY } from "../file-table.tsx";
import { storageErrorToast } from "../storage-errors.ts";
import { CommentComposer } from "./comment-composer.tsx";
import { PdfMarksContext, type PdfBox, type PdfMarks } from "./pdf-marks.tsx";
import { PreviewBody } from "./preview-body.tsx";
import { PreviewRail, type RailVersion } from "./preview-rail.tsx";

export function PreviewPanel(props: {
  node: StorageNode;
  url: string;
  /** The files before and after it in the folder, for Previous and Next. */
  previous: StorageNode | undefined;
  next: StorageNode | undefined;
  onOpen: (node: StorageNode) => void;
  onClose: () => void;
  onDownload: () => void;
  menu: SettingsRowMenuItem[];
  fullScreen: boolean;
  onFullScreen: () => void;
  /** False outside the app shell (a shared link's page): no sidebar toggle. */
  shell: boolean;
  /** Opened through a shared link: its door for versions and comments. */
  shareId?: string | undefined;
}) {
  const { node } = props;
  const tools = usePreviewTools(node, props.shareId);
  const shown = tools.shown;
  return (
    <section aria-label={node.name} className="flex min-w-0 flex-1 flex-col bg-background">
      {/* One row with the folder's header beside it: the same height and bottom line, 10px from
          the end as that header's actions are. */}
      <div
        className={`flex h-12 shrink-0 items-center gap-3 border-b pe-2.5 ${props.fullScreen ? "ps-2.5" : "border-s ps-5"}`}
      >
        {props.fullScreen && props.shell && <PageNav />}
        <Heading level={2} className="min-w-0 flex-1 text-md" title={node.name}>
          <MiddleTruncate text={node.name} />
        </Heading>
        <div className="flex shrink-0 items-center gap-1">
          <Action
            label="Previous"
            isDisabled={!props.previous}
            onPress={() => props.previous && props.onOpen(props.previous)}
          >
            <IconChevronLeft />
          </Action>
          <Action
            label="Next"
            isDisabled={!props.next}
            onPress={() => props.next && props.onOpen(props.next)}
          >
            <IconChevronRight />
          </Action>
          <Action label="Download" onPress={props.onDownload}>
            <IconDownload />
          </Action>
          <SettingsRowMenu label={`Actions for ${node.name}`} items={props.menu} />
          <Action
            label={props.fullScreen ? "Side by side" : "Full screen"}
            onPress={props.onFullScreen}
          >
            {props.fullScreen ? <IconMinimize /> : <IconMaximize />}
          </Action>
          <Action label="Close" onPress={props.onClose}>
            <IconX />
          </Action>
        </div>
      </div>
      <div
        className={`flex min-h-0 flex-1 flex-col bg-surface ${props.fullScreen ? "" : "border-s"}`}
      >
        <PdfMarksContext value={tools.marks}>
          <PreviewBody
            key={shown?.key ?? "current"}
            node={shown?.node ?? node}
            url={shown?.url ?? props.url}
            onDownload={props.onDownload}
          />
        </PdfMarksContext>
        <PreviewRail {...tools.rail} />
      </div>
      <Details node={shown?.node ?? node} border={!props.fullScreen} />
    </section>
  );
}

/** Kind, size and dates on one line under the stage, each value after its muted label. */
function Details(props: { node: StorageNode; border: boolean }) {
  const { node } = props;
  const rows: [string, ReactNode][] = [
    ["Kind", <TypeBadge key="kind" label={fileType(node.name, node.mimeType).label} />],
    ["Size", formatBytes(node.size)],
    ["Modified", DAY.format(new Date(node.updatedAt))],
    ["Created", DAY.format(new Date(node.createdAt))],
  ];
  return (
    <DescriptionList
      className={`flex h-10 shrink-0 items-center gap-x-5 overflow-hidden border-t px-5 text-sm sm:text-sm ${props.border ? "border-s" : ""}`}
    >
      {rows.map(([term, value]) => (
        <div key={term} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <DescriptionTerm className="border-none p-0 sm:p-0">{term}</DescriptionTerm>
          <DescriptionDetails className="border-none p-0 tabular-nums sm:border-none sm:p-0">
            {value}
          </DescriptionDetails>
        </div>
      ))}
    </DescriptionList>
  );
}

function Action(props: {
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <TooltipTrigger delay={400}>
      <Button
        intent="ghost"
        size="sq-sm"
        aria-label={props.label}
        isDisabled={props.isDisabled}
        onPress={props.onPress}
      >
        {props.children}
      </Button>
      <Tooltip>{props.label}</Tooltip>
    </TooltipTrigger>
  );
}

/** The version on the stage when it is not the current content. */
interface ShownVersion {
  key: string;
  url: string;
  /** The file as that version had it: its size, type and when it was written. */
  node: StorageNode;
}

/** "v3" down to "v1": the current content leads, numbered from the oldest kept version. */
function railVersions(data: StorageVersions): RailVersion[] {
  const count = data.versions.length + 1;
  return [
    { key: "current", label: `v${count}`, ...data.current },
    ...data.versions.map((version, index) => ({
      key: version.id,
      label: `v${count - 1 - index}`,
      writtenAt: version.writtenAt,
      writtenByName: version.writtenByName,
    })),
  ];
}

/**
 * The island's state for one file: the composer and a box drawn for it, the area tool, and the
 * version on the stage. Stepping to another file starts it over.
 */
function usePreviewTools(node: StorageNode, shareId: string | undefined) {
  const [fileId, setFileId] = useState(node.id);
  const [shownKey, setShownKey] = useState("current");
  const [composing, setComposing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<PdfBox | null>(null);
  if (fileId !== node.id) {
    setFileId(node.id);
    setShownKey("current");
    setComposing(false);
    setDrawing(false);
    setDraft(null);
  }

  // Each answers 403 to whoever may not: a Viewer gets neither, a Commenter no versions.
  const versions = useStorageVersions(node.id, shareId);
  const comments = useStorageComments(node.id, shareId);
  const restore = useRestoreVersion();
  const isPdf = fileType(node.name, node.mimeType).preview === "pdf";

  const list = versions.data ? railVersions(versions.data) : undefined;
  const kept = versions.data?.versions.find((version) => version.id === shownKey);
  const shown: ShownVersion | undefined = kept && {
    key: kept.id,
    url: storageVersionUrl(node.id, kept.id, shareId),
    node: {
      ...node,
      size: kept.size,
      mimeType: kept.mimeType ?? node.mimeType,
      updatedAt: kept.writtenAt,
    },
  };

  const data = comments.data;
  // Open threads made on the content on the stage; a box on replaced content points nowhere.
  const boxes = (data?.comments ?? []).flatMap((comment) =>
    comment.parentId === null &&
    !comment.resolvedAt &&
    comment.anchor?.kind === "pdf" &&
    comment.contentVersion === data?.contentVersion
      ? [{ id: comment.id, ...comment.anchor }]
      : [],
  );
  const marks: PdfMarks | null =
    isPdf && !shown && data
      ? {
          boxes: [...boxes, ...(draft ? [{ id: "draft", ...draft }] : [])],
          selected: null,
          drawing,
          onDraw: (box) => {
            setDraft(box);
            setDrawing(false);
            // After the drag's own click, which would count as a press outside and close it.
            setTimeout(() => setComposing(true));
          },
        }
      : null;

  const rail: Parameters<typeof PreviewRail>[0] = {
    comment: data && {
      open: composing,
      onOpenChange: (open) => {
        setComposing(open);
        if (!open) setDraft(null);
      },
      composer: (
        <CommentComposer
          fileId={node.id}
          shareId={shareId}
          draft={draft}
          onClearDraft={() => setDraft(null)}
          onSent={() => {
            setComposing(false);
            setDraft(null);
          }}
        />
      ),
    },
    area:
      data && isPdf
        ? { on: drawing, isDisabled: !!shown, onToggle: () => setDrawing((on) => !on) }
        : undefined,
    versions: list && {
      list,
      shown: shown ? shown.key : "current",
      onShow: setShownKey,
      restoring: restore.isPending,
      onRestore: () =>
        kept &&
        restore.mutate(
          { id: node.id, versionId: kept.id, ...(shareId ? { shareId } : {}) },
          {
            onSuccess: () => setShownKey("current"),
            onError: (error) => storageErrorToast(error, "It was not restored"),
          },
        ),
    },
  };

  return { shown, marks, rail };
}
