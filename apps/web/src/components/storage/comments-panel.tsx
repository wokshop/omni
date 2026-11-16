// A file's comments (ADR 0043 decisions 4 and 5) beside its folder, where the preview opens, and
// narrower. Drawn as the notifications panel draws its events, not as a chat: a 48px top bar
// ("Comments", the file's name, Close), Open and Resolved tabs, and full-width rows ruled like the
// notification rows, one per comment. A row is who wrote it (a 28px squircle, the name, where it
// points, the time) and what they wrote; the replies to it follow as plain lines in the same row,
// and Reply opens a field at its end. Resolve (✓, on hover) moves the row to Resolved and Reopen
// brings it back; a reply reopens it too (the API's rule). The box at the bottom leaves a new
// comment on the version on screen.
//
// Geometry: rows 20px all round, the text 12px past the squircle; replies 12px apart, 16px under
// the comment; the box 8px from the panel's sides so its text starts on the rows' edge.
import { useLayoutEffect, useRef, useState, type Key, type ReactNode } from "react";
import { Skeleton } from "skullet/react";
import {
  IconCheck,
  IconPencil,
  IconReply,
  IconRestore,
  IconTrash,
  IconX,
} from "@/components/icons/central";
import { ChatBox } from "@/components/chat/chat-box";
import {
  ChatEdit,
  ChatFace,
  ChatMenu,
  ChatText,
  menuButtonClass,
} from "@/components/chat/chat-message";
import { messageTime } from "@/components/conversation/message.tsx";
import { CountBadge } from "@/components/shell/count-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { MenuItem, MenuLabel } from "@/components/ui/menu";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { Tab, TabList, Tabs } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useAddComment,
  useChangeComment,
  useDeleteComment,
  useStorageComments,
} from "@/hooks/use-storage.ts";
import type { StorageNode } from "@/lib/storage.ts";
import {
  commentAuthor,
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

/** Where a comment points, as a short label; null for the whole file. */
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

type View = "open" | "resolved";

/** Keeps the newest comment in view as the list loads and grows, unless they scrolled up. */
function useStickToBottom(count: number) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [count]);
  const onScroll = () => {
    const el = scroller.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  return { scroller, onScroll };
}

export function CommentsPanel(props: {
  node: StorageNode;
  shareId?: string | undefined;
  onClose: () => void;
}) {
  const { node, shareId } = props;
  const door = { id: node.id, shareId };
  const comments = useStorageComments(node.id, shareId);
  const [view, setView] = useState<View>("open");
  // The row whose Reply field is open; one at a time.
  const [replying, setReplying] = useState<string | null>(null);
  const all = comments.data?.comments ?? [];
  const open = threadsOf(all, false).length;
  const { scroller, onScroll } = useStickToBottom(all.length);
  return (
    <section
      aria-label={`Comments on ${node.name}`}
      className="flex min-w-0 flex-1 flex-col border-s bg-background"
    >
      {/* One row with the folder's header beside it: the same height. The tabs' line closes it,
          as in the notifications panel. */}
      <div className="flex h-12 shrink-0 items-center gap-2 ps-5 pe-2.5">
        <Heading level={2} className="shrink-0 text-md">
          Comments
        </Heading>
        <span className="min-w-0 flex-1 text-sm text-muted-foreground" title={node.name}>
          <MiddleTruncate text={node.name} />
        </span>
        <TooltipTrigger delay={400}>
          <Button intent="ghost" size="sq-sm" aria-label="Close" onPress={props.onClose}>
            <IconX />
          </Button>
          <Tooltip>Close</Tooltip>
        </TooltipTrigger>
      </div>
      <Tabs
        selectedKey={view}
        onSelectionChange={(key: Key) => setView(key as View)}
        className="w-full shrink-0 gap-0"
      >
        <TabList
          aria-label="Show"
          className="-mt-0.5 px-5 [--tab-list-pb:--spacing(2)] [--tab-list-tab-y:--spacing(0.5)]"
        >
          <Tab id="open" className="gap-1.5">
            Open
            <CountBadge count={open} />
          </Tab>
          <Tab id="resolved">Resolved</Tab>
        </TabList>
      </Tabs>
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <Skeleton
          id="storage-comments"
          data={comments.data}
          sample={SAMPLE}
          label="Loading comments"
        >
          {(state) => (
            <ul>
              {threadsOf(state.comments, view === "resolved").map((thread) => (
                <CommentRow
                  key={thread.root.id}
                  door={door}
                  thread={thread}
                  earlier={thread.root.contentVersion < state.contentVersion}
                  replying={replying === thread.root.id}
                  onReplying={(on) => setReplying(on ? thread.root.id : null)}
                />
              ))}
            </ul>
          )}
        </Skeleton>
      </div>
      <div className="shrink-0 px-2 py-2">
        <CommentBox
          door={door}
          label="Comment"
          sendLabel="Add comment"
          // The version on screen: a comment left on it stays on it if someone saves meanwhile.
          extra={
            comments.data?.contentVersion === undefined
              ? {}
              : { contentVersion: comments.data.contentVersion }
          }
          onSent={() => setView("open")}
        />
      </div>
    </section>
  );
}

/** Where it points and the earlier version it was left on, as quiet words after the name. */
function tagsOf(comment: StorageComment, earlier: boolean) {
  return [anchorLabel(comment.anchor), earlier && "Earlier version"].filter(Boolean).join(" · ");
}

/** A squircle: 28px with 6px corners, as on a notification row. */
const AVATAR =
  "shrink-0 bg-accent text-foreground outline-0 [--avatar-radius:var(--radius-lg)] [--avatar-size:--spacing(7)]";

/** One comment, the replies under it, and Reply's field when it is open. */
function CommentRow(props: {
  door: Door;
  thread: StorageThread;
  earlier: boolean;
  replying: boolean;
  onReplying: (on: boolean) => void;
}) {
  const { door, thread } = props;
  const { root, replies } = thread;
  const name = commentAuthor(root);
  const change = useChangeComment();
  const resolve = (resolved: boolean) =>
    change.mutate(
      { ...withShare(door), commentId: root.id, change: { resolved } },
      { onError: (error) => storageErrorToast(error, "It was not changed") },
    );
  const resolved = !!root.resolvedAt;
  return (
    <li className="flex gap-3 border-b p-5" aria-label={`Comment from ${name}`}>
      <Avatar isSquare initials={name.slice(0, 1).toUpperCase()} className={AVATAR} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Line
          door={door}
          comment={root}
          tags={tagsOf(root, props.earlier)}
          actions={
            <TooltipTrigger delay={400}>
              <Button
                intent="ghost"
                size="sq-2xs"
                aria-label={resolved ? "Reopen" : "Resolve"}
                // Shown on hover or focus, as the ⋯ beside it (always on touch screens).
                className={menuButtonClass({})}
                onPress={() => resolve(!resolved)}
              >
                {resolved ? <IconRestore /> : <IconCheck />}
              </Button>
              <Tooltip>{resolved ? "Reopen" : "Resolve"}</Tooltip>
            </TooltipTrigger>
          }
          onReply={() => props.onReplying(true)}
        />
        {replies.map((reply) => (
          <Line
            key={reply.id}
            door={door}
            comment={reply}
            face
            onReply={() => props.onReplying(true)}
          />
        ))}
        {props.replying && (
          <CommentBox
            door={door}
            label="Reply"
            sendLabel="Send reply"
            extra={{ parentId: root.id }}
            autoFocus
            onCancel={() => props.onReplying(false)}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Who wrote it, where it points and when, its actions at the end; then what they wrote. A reply
 * wears an 18px face before its name, the comment the row's squircle.
 */
function Line(props: {
  door: Door;
  comment: StorageComment;
  tags?: string;
  face?: boolean;
  actions?: ReactNode;
  onReply: () => void;
}) {
  const { door, comment } = props;
  const [editing, setEditing] = useState(false);
  const change = useChangeComment();
  const remove = useDeleteComment();
  const name = commentAuthor(comment);
  const target = { ...withShare(door), commentId: comment.id };
  return (
    <div className="group/item flex flex-col gap-1">
      <span className="flex min-w-0 items-center gap-2">
        {props.face && <ChatFace name={name} />}
        <span className="min-w-0 truncate text-sm text-foreground">{name}</span>
        {props.tags && (
          <span className="shrink-0 text-xs text-subtle-foreground">{props.tags}</span>
        )}
        <time
          dateTime={comment.createdAt}
          className="shrink-0 text-xs text-subtle-foreground tabular-nums"
        >
          {messageTime(comment.createdAt)}
          {comment.editedAt && " · edited"}
        </time>
        <span className="ms-auto flex shrink-0 items-center gap-0.5">
          {props.actions}
          {!editing && (
            <ChatMenu label="Comment actions">
              <MenuItem textValue="Reply" onAction={props.onReply}>
                <IconReply data-slot="icon" />
                <MenuLabel>Reply</MenuLabel>
              </MenuItem>
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
          )}
        </span>
      </span>
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
    </div>
  );
}

/**
 * The app's chat box: a new comment, or with `parentId` in `extra` a reply. Esc closes a reply's
 * field. What was typed while one was on its way stays when it lands.
 */
function CommentBox(props: {
  door: Door;
  label: string;
  sendLabel: string;
  extra: { parentId: string } | { contentVersion?: number };
  autoFocus?: boolean;
  onCancel?: () => void;
  onSent?: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const add = useAddComment();
  // Nothing goes twice: Enter while the last one is on its way sends nothing. The ref holds it
  // from the first keypress; `isPending` reaches the render only a tick later.
  const sending = useRef(false);
  useLayoutEffect(() => {
    if (props.autoFocus) textarea.current?.focus();
  }, [props.autoFocus]);
  const send = () => {
    const body = text.trim();
    if (!body || sending.current) return;
    sending.current = true;
    add.mutate(
      { ...withShare(props.door), body: { body, ...props.extra } },
      {
        onSuccess: () => {
          setText((current) => (current.trim() === body ? "" : current));
          props.onSent?.();
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
      textareaRef={textarea}
      label={props.label}
      placeholder={props.label}
      sendLabel={props.sendLabel}
      canSend={text.trim().length > 0 && !add.isPending}
      onSend={send}
      value={text}
      onChange={(next) => setText(next)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && props.onCancel) {
          event.preventDefault();
          props.onCancel();
        }
      }}
    />
  );
}
