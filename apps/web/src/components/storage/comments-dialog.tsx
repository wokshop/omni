// A file's comments (ADR 0043 decisions 4 and 5): open threads first, then resolved ones; each
// thread is its root and the replies under it. A thread's "⋯" resolves or reopens it, and edits or
// deletes a comment of one's own; Reply opens a field under the thread. The field at the bottom
// starts a thread on the whole file. Threads pointing into the file (a PDF region, lines, a cell)
// show where; anchoring a new one from inside a preview comes with the viewers.
//
// Geometry: threads 16px apart; inside a thread, comments 12px apart and replies inset 16px. A
// comment is its author with the time after it, then its text; the "⋯" sits at the root's end.
import { useState } from "react";
import { Skeleton } from "skullet/react";
import {
  IconCheck,
  IconPencil,
  IconReply,
  IconRestore,
  IconTrash,
} from "@/components/icons/central";
import {
  SettingsRowMenu,
  type SettingsRowMenuItem,
} from "@/components/settings/kit/settings-row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddComment,
  useChangeComment,
  useDeleteComment,
  useStorageComments,
} from "@/hooks/use-storage.ts";
import type { StorageNode } from "@/lib/storage.ts";
import {
  threadsOf,
  type StorageComment,
  type StorageCommentAnchor,
  type StorageComments,
  type StorageThread,
} from "@/lib/storage-comments.ts";
import { storageErrorToast } from "./storage-errors.ts";

const WHEN = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const SAMPLE: StorageComments = {
  contentVersion: 1,
  comments: [
    {
      id: "sample",
      parentId: null,
      contentVersion: 1,
      anchor: { kind: "file" },
      body: "A comment on this file",
      authorName: "Someone",
      mine: false,
      createdAt: new Date(0).toISOString(),
      editedAt: null,
      resolvedAt: null,
      resolvedByName: null,
    },
  ],
};

/** A spreadsheet column's letters: 1 is A, 27 is AA. */
function columnName(column: number) {
  let name = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Where a thread points, as a short label; null for the whole file. */
function anchorLabel(anchor: StorageCommentAnchor | null) {
  switch (anchor?.kind) {
    case "pdf":
      return `Page ${anchor.page}`;
    case "lines":
      return anchor.start === anchor.end
        ? `Line ${anchor.start}`
        : `Lines ${anchor.start}–${anchor.end}`;
    case "cell": {
      const cell = `${columnName(anchor.column)}${anchor.row}`;
      return anchor.sheet ? `${anchor.sheet} ${cell}` : cell;
    }
    default:
      return null;
  }
}

interface Door {
  id: string;
  shareId?: string | undefined;
}

const withShare = ({ id, shareId }: Door) => ({ id, ...(shareId ? { shareId } : {}) });

export function CommentsDialog(props: {
  node: StorageNode;
  shareId?: string | undefined;
  onClose: () => void;
}) {
  const { node, shareId } = props;
  const door = { id: node.id, shareId };
  const comments = useStorageComments(node.id, shareId);
  return (
    <Dialog size="md" isOpen onOpenChange={(open) => !open && props.onClose()}>
      <DialogHeader>
        <DialogTitle className="truncate">Comments on “{node.name}”</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <Skeleton
          id="storage-comments"
          data={comments.data}
          sample={SAMPLE}
          label="Loading comments"
        >
          {(state) => (
            <ul className="flex flex-col gap-4">
              {threadsOf(state.comments).map((thread) => (
                <Thread
                  key={thread.root.id}
                  door={door}
                  thread={thread}
                  current={state.contentVersion}
                />
              ))}
            </ul>
          )}
        </Skeleton>
      </DialogBody>
      <DialogFooter className="flex-col items-stretch sm:flex-col">
        <Composer
          door={door}
          label="Comment"
          // The version on screen: a thread started on it stays on it if someone saves meanwhile.
          contentVersion={comments.data?.contentVersion}
        />
      </DialogFooter>
    </Dialog>
  );
}

function Thread(props: { door: Door; thread: StorageThread; current: number }) {
  const { door, thread, current } = props;
  const { root, replies } = thread;
  const [replying, setReplying] = useState(false);
  const change = useChangeComment();
  const where = anchorLabel(root.anchor);
  const resolve = (resolved: boolean) =>
    change.mutate(
      { ...withShare(door), commentId: root.id, change: { resolved } },
      { onError: (error) => storageErrorToast(error, "It was not changed") },
    );
  return (
    <li className="flex flex-col gap-3">
      {(where || root.resolvedAt || root.contentVersion < current) && (
        <span className="flex flex-wrap items-center gap-1.5">
          {where && <Badge intent="outline">{where}</Badge>}
          {root.contentVersion < current && <Badge intent="secondary">Earlier version</Badge>}
          {root.resolvedAt && <Badge intent="secondary">Resolved</Badge>}
        </span>
      )}
      <Comment
        door={door}
        comment={root}
        extra={[
          root.resolvedAt
            ? { icon: IconRestore, label: "Reopen", onAction: () => resolve(false) }
            : { icon: IconCheck, label: "Resolve", onAction: () => resolve(true) },
          { icon: IconReply, label: "Reply", onAction: () => setReplying(true) },
        ]}
      />
      {(replies.length > 0 || replying) && (
        <ul className="flex flex-col gap-3 pl-4">
          {replies.map((reply) => (
            <Comment key={reply.id} door={door} comment={reply} extra={[]} />
          ))}
          {replying && (
            <li>
              <Composer
                door={door}
                label="Reply"
                parentId={root.id}
                autoFocus
                onDone={() => setReplying(false)}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function Comment(props: { door: Door; comment: StorageComment; extra: SettingsRowMenuItem[] }) {
  const { door, comment } = props;
  const [editing, setEditing] = useState(false);
  const remove = useDeleteComment();
  const own: SettingsRowMenuItem[] = comment.mine
    ? [
        { icon: IconPencil, label: "Edit", onAction: () => setEditing(true) },
        {
          icon: IconTrash,
          label: "Delete",
          danger: true,
          onAction: () =>
            remove.mutate(
              { ...withShare(door), commentId: comment.id },
              { onError: (error) => storageErrorToast(error, "It was not deleted") },
            ),
        },
      ]
    : [];
  const items = [...props.extra, ...own];
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm text-foreground">
            {comment.authorName ?? "Former member"}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {WHEN.format(new Date(comment.createdAt))}
          </span>
        </span>
        {editing ? (
          <EditField door={door} comment={comment} onDone={() => setEditing(false)} />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words text-foreground">{comment.body}</p>
        )}
      </div>
      {items.length > 0 && (
        <SettingsRowMenu
          label={`Actions for the comment by ${comment.authorName ?? "a former member"}`}
          disabled={remove.isPending}
          items={items}
        />
      )}
    </div>
  );
}

function EditField(props: { door: Door; comment: StorageComment; onDone: () => void }) {
  const { door, comment } = props;
  const [body, setBody] = useState(comment.body);
  const change = useChangeComment();
  const save = () =>
    change.mutate(
      { ...withShare(door), commentId: comment.id, change: { body: body.trim() } },
      {
        onSuccess: props.onDone,
        onError: (error) => storageErrorToast(error, "It was not saved"),
      },
    );
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label="Comment"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        autoFocus
      />
      <span className="flex justify-end gap-2">
        <Button intent="outline" onPress={props.onDone}>
          Cancel
        </Button>
        <Button isDisabled={!body.trim()} isPending={change.isPending} onPress={save}>
          Save
        </Button>
      </span>
    </div>
  );
}

/** A field and its button: a new thread on the whole file, or with `parentId` a reply. */
function Composer(props: {
  door: Door;
  label: string;
  parentId?: string;
  contentVersion?: number | undefined;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const { door, parentId, contentVersion } = props;
  const [body, setBody] = useState("");
  const add = useAddComment();
  const send = () => {
    const text = body.trim();
    const json = parentId
      ? { body: text, parentId }
      : { body: text, ...(contentVersion === undefined ? {} : { contentVersion }) };
    add.mutate(
      { ...withShare(door), body: json },
      {
        onSuccess: () => {
          setBody("");
          props.onDone?.();
        },
        onError: (error) => storageErrorToast(error, "It was not sent"),
      },
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label={props.label}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        autoFocus={props.autoFocus}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && body.trim()) send();
        }}
      />
      <span className="flex justify-end gap-2">
        {props.onDone && (
          <Button intent="outline" onPress={props.onDone}>
            Cancel
          </Button>
        )}
        <Button isDisabled={!body.trim()} isPending={add.isPending} onPress={send}>
          {props.label}
        </Button>
      </span>
    </div>
  );
}
