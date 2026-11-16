// A file's comments (ADR 0043 decisions 4 and 5) beside its folder, where the preview opens, and
// narrower: a 48px top bar (the file's name, then Close), the threads, and the chat box under
// them. Open threads first, then resolved ones; each thread is its root and the replies under it,
// drawn with the app's chat pieces (`components/chat/`). A message's ⋯ replies (the box then
// answers that thread, with the reply banner on top), resolves or reopens, and edits or deletes
// one's own. A new thread is on the whole file and on the version on screen.
//
// Geometry: threads 24px apart, inside a thread messages 12px apart and replies inset 16px; the
// list and the box 20px from the panel's sides, as the preview's details are.
import { useRef, useState, type ReactNode } from "react";
import { Skeleton } from "skullet/react";
import {
  IconCheck,
  IconPencil,
  IconReply,
  IconRestore,
  IconTrash,
  IconX,
} from "@/components/icons/central";
import { ChatBox, ReplyBanner } from "@/components/chat/chat-box";
import {
  ChatEdit,
  ChatFace,
  ChatMenu,
  ChatMessage,
  ChatText,
} from "@/components/chat/chat-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { MenuItem, MenuLabel } from "@/components/ui/menu";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useAddComment,
  useChangeComment,
  useDeleteComment,
  useStorageComments,
} from "@/hooks/use-storage.ts";
import { quoteText, type Reply } from "@/lib/reply.ts";
import type { StorageNode } from "@/lib/storage.ts";
import {
  threadsOf,
  type StorageComment,
  type StorageCommentAnchor,
  type StorageComments,
  type StorageThread,
} from "@/lib/storage-comments.ts";
import { storageErrorToast } from "./storage-errors.ts";

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
const nameOf = (comment: StorageComment) => comment.authorName ?? "Former member";

/** The thread a reply goes to, and the passage it quotes on the box's banner. */
type ReplyTo = Reply & { rootId: string };

export function CommentsPanel(props: {
  node: StorageNode;
  shareId?: string | undefined;
  onClose: () => void;
}) {
  const { node, shareId } = props;
  const door = { id: node.id, shareId };
  const comments = useStorageComments(node.id, shareId);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const reply = (root: StorageComment, comment: StorageComment) => {
    setReplyTo({ rootId: root.id, from: nameOf(comment), text: quoteText(comment.body) });
    requestAnimationFrame(() => textarea.current?.focus());
  };
  return (
    <section
      aria-label={`Comments on ${node.name}`}
      className="flex min-w-0 flex-1 flex-col border-s bg-background"
    >
      {/* One row with the folder's header beside it: the same height and bottom line. */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b ps-5 pe-2.5">
        <Heading level={2} className="min-w-0 flex-1 text-md" title={node.name}>
          <MiddleTruncate text={node.name} />
        </Heading>
        <TooltipTrigger delay={400}>
          <Button intent="ghost" size="sq-sm" aria-label="Close" onPress={props.onClose}>
            <IconX />
          </Button>
          <Tooltip>Close</Tooltip>
        </TooltipTrigger>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Skeleton
          id="storage-comments"
          data={comments.data}
          sample={SAMPLE}
          label="Loading comments"
        >
          {(state) => (
            <ul className="flex flex-col gap-6">
              {threadsOf(state.comments).map((thread) => (
                <Thread
                  key={thread.root.id}
                  door={door}
                  thread={thread}
                  current={state.contentVersion}
                  onReply={reply}
                />
              ))}
            </ul>
          )}
        </Skeleton>
      </div>
      <div className="shrink-0 px-5 pb-4">
        <Composer
          door={door}
          textarea={textarea}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          contentVersion={comments.data?.contentVersion}
        />
      </div>
    </section>
  );
}

function Thread(props: {
  door: Door;
  thread: StorageThread;
  current: number;
  onReply: (root: StorageComment, comment: StorageComment) => void;
}) {
  const { door, thread, current } = props;
  const { root, replies } = thread;
  const change = useChangeComment();
  const where = anchorLabel(root.anchor);
  const earlier = root.contentVersion < current;
  const resolve = (resolved: boolean) =>
    change.mutate(
      { ...withShare(door), commentId: root.id, change: { resolved } },
      { onError: (error) => storageErrorToast(error, "It was not changed") },
    );
  const message = (comment: StorageComment, extra?: ReactNode) => (
    <Comment
      door={door}
      comment={comment}
      onReply={() => props.onReply(root, comment)}
      extra={extra}
    />
  );
  return (
    <li className="flex flex-col gap-3">
      {(where || earlier || root.resolvedAt) && (
        <span className="flex flex-wrap items-center gap-1.5">
          {where && <Badge intent="outline">{where}</Badge>}
          {earlier && <Badge intent="secondary">Earlier version</Badge>}
          {root.resolvedAt && <Badge intent="secondary">Resolved</Badge>}
        </span>
      )}
      {message(
        root,
        root.resolvedAt ? (
          <MenuItem textValue="Reopen" onAction={() => resolve(false)}>
            <IconRestore data-slot="icon" />
            <MenuLabel>Reopen</MenuLabel>
          </MenuItem>
        ) : (
          <MenuItem textValue="Resolve" onAction={() => resolve(true)}>
            <IconCheck data-slot="icon" />
            <MenuLabel>Resolve</MenuLabel>
          </MenuItem>
        ),
      )}
      {replies.length > 0 && (
        <ul className="flex flex-col gap-3 ps-4">
          {replies.map((reply) => (
            <li key={reply.id}>{message(reply)}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Comment(props: {
  door: Door;
  comment: StorageComment;
  onReply: () => void;
  extra?: ReactNode;
}) {
  const { door, comment } = props;
  const [editing, setEditing] = useState(false);
  const change = useChangeComment();
  const remove = useDeleteComment();
  const name = nameOf(comment);
  const target = { ...withShare(door), commentId: comment.id };
  return (
    <ChatMessage
      label={`Comment from ${name}`}
      align="start"
      name={name}
      face={<ChatFace name={name} />}
      createdAt={comment.createdAt}
      edited={comment.editedAt !== null}
      editing={editing}
      menu={
        !editing && (
          <ChatMenu label="Comment actions">
            <MenuItem textValue="Reply" onAction={props.onReply}>
              <IconReply data-slot="icon" />
              <MenuLabel>Reply</MenuLabel>
            </MenuItem>
            {props.extra}
            {comment.mine && (
              <>
                <MenuItem textValue="Edit" onAction={() => setEditing(true)}>
                  <IconPencil data-slot="icon" />
                  <MenuLabel>Edit</MenuLabel>
                </MenuItem>
                <MenuItem
                  intent="danger"
                  textValue="Delete"
                  onAction={() =>
                    remove.mutate(target, {
                      onError: (error) => storageErrorToast(error, "It was not deleted"),
                    })
                  }
                >
                  <IconTrash data-slot="icon" />
                  <MenuLabel>Delete</MenuLabel>
                </MenuItem>
              </>
            )}
          </ChatMenu>
        )
      }
    >
      {editing ? (
        <ChatEdit
          label="Edit comment"
          text={comment.body}
          onDone={() => setEditing(false)}
          onSave={(body) =>
            change.mutate(
              { ...target, change: { body } },
              { onError: (error) => storageErrorToast(error, "It was not saved") },
            )
          }
        />
      ) : (
        <ChatText>{comment.body}</ChatText>
      )}
    </ChatMessage>
  );
}

/** The chat box: a reply to `replyTo`'s thread, or a new thread on the version on screen. */
function Composer(props: {
  door: Door;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  replyTo: ReplyTo | null;
  onClearReply: () => void;
  contentVersion: number | undefined;
}) {
  const { door, replyTo, contentVersion } = props;
  const [text, setText] = useState("");
  const add = useAddComment();
  // Nothing goes twice: Enter while the last one is on its way sends nothing. The ref holds it
  // from the first keypress; `isPending` reaches the render only a tick later.
  const sending = useRef(false);
  const canSend = text.trim().length > 0 && !add.isPending;
  const send = () => {
    const body = text.trim();
    if (!body || sending.current) return;
    sending.current = true;
    const json = replyTo
      ? { body, parentId: replyTo.rootId }
      : { body, ...(contentVersion === undefined ? {} : { contentVersion }) };
    add.mutate(
      { ...withShare(door), body: json },
      {
        onSuccess: () => {
          setText("");
          props.onClearReply();
        },
        onError: (error) => storageErrorToast(error, "It was not sent"),
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };
  return (
    <ChatBox
      textareaRef={props.textarea}
      label={replyTo ? "Reply" : "Comment"}
      placeholder={replyTo ? "Reply" : "Comment"}
      sendLabel={replyTo ? "Send reply" : "Add comment"}
      canSend={canSend}
      onSend={send}
      value={text}
      onChange={(next) => setText(next)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && replyTo) {
          event.preventDefault();
          props.onClearReply();
        }
      }}
      banner={
        replyTo && (
          <ReplyBanner
            reply={replyTo}
            onClear={() => {
              props.onClearReply();
              props.textarea.current?.focus();
            }}
          />
        )
      }
    />
  );
}
