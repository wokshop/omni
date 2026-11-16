// A file's comments (ADR 0043 decisions 4 and 5) beside its folder, where the preview opens, and
// narrower: a 48px top bar ("Comments", the file's name, Close), the chat, and the chat box under
// it. One chat, oldest first, newest at the bottom, drawn with the app's chat pieces
// (`components/chat/`) as the inbox's hidden notes are: a message's ⋯ replies to it (any message,
// however old: the box then carries its quote on the reply banner, and the reply shows that quote
// above its bubble) and edits or deletes one's own. Where a comment points into the file (a page,
// lines, a cell) and an earlier version it was made on show as quiet tags beside the name.
//
// Geometry: messages 20px apart; the chat 20px from the panel's sides, and the box 8px from them,
// so its text starts on the chat's left edge.
import { useLayoutEffect, useRef, useState } from "react";
import { Skeleton } from "skullet/react";
import { IconPencil, IconReply, IconTrash, IconX } from "@/components/icons/central";
import { ChatBox, ReplyBanner, ReplyLine } from "@/components/chat/chat-box";
import {
  ChatEdit,
  ChatFace,
  ChatMenu,
  ChatMessage,
  ChatText,
} from "@/components/chat/chat-message";
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
import { quoteText, withReply, type Reply } from "@/lib/reply.ts";
import type { StorageNode } from "@/lib/storage.ts";
import {
  chatOf,
  commentAuthor,
  type StorageChatLine,
  type StorageCommentAnchor,
  type StorageComments,
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

/** Keeps the newest message in view as the chat loads and grows, unless they scrolled up. */
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
  const [replyTo, setReplyTo] = useState<Reply | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { scroller, onScroll } = useStickToBottom(comments.data?.comments.length ?? 0);
  const reply = (line: StorageChatLine) => {
    setReplyTo({ from: commentAuthor(line.comment), text: quoteText(line.body) });
    requestAnimationFrame(() => textarea.current?.focus());
  };
  return (
    <section
      aria-label={`Comments on ${node.name}`}
      className="flex min-w-0 flex-1 flex-col border-s bg-background"
    >
      {/* One row with the folder's header beside it: the same height and bottom line. */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b ps-5 pe-2.5">
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
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Skeleton
          id="storage-comments"
          data={comments.data}
          sample={SAMPLE}
          label="Loading comments"
        >
          {(state) => (
            <ul className="flex flex-col gap-5">
              {chatOf(state.comments).map((line) => (
                <li key={line.comment.id}>
                  <Comment
                    door={door}
                    line={line}
                    earlier={line.comment.contentVersion < state.contentVersion}
                    onReply={() => reply(line)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Skeleton>
      </div>
      <div className="shrink-0 px-2 pb-2">
        <Composer
          door={door}
          textarea={textarea}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          // Only the reply that went: one picked while it was on its way stays on the box.
          onSent={(sent) => setReplyTo((current) => (current === sent ? null : current))}
          contentVersion={comments.data?.contentVersion}
        />
      </div>
    </section>
  );
}

/** A quiet tag after the name: where the comment points, or the earlier version it was made on. */
function Tags({ where, earlier }: { where: string | null; earlier: boolean }) {
  if (!where && !earlier) return null;
  return (
    <span className="shrink-0 text-xs text-subtle-foreground">
      {[where, earlier && "Earlier version"].filter(Boolean).join(" · ")}
    </span>
  );
}

function Comment(props: {
  door: Door;
  line: StorageChatLine;
  earlier: boolean;
  onReply: () => void;
}) {
  const { door, line } = props;
  const { comment, body, reply } = line;
  const [editing, setEditing] = useState(false);
  const change = useChangeComment();
  const remove = useDeleteComment();
  const name = commentAuthor(comment);
  const target = { ...withShare(door), commentId: comment.id };
  return (
    <ChatMessage
      label={`Comment from ${name}`}
      align="start"
      name={name}
      face={<ChatFace name={name} />}
      tag={<Tags where={anchorLabel(comment.anchor)} earlier={props.earlier} />}
      createdAt={comment.createdAt}
      edited={comment.editedAt !== null}
      editing={editing}
      quote={
        reply &&
        !editing && (
          <div title={reply.text} className="flex max-w-[80%] text-xs text-muted-foreground">
            <ReplyLine reply={reply} />
          </div>
        )
      }
      menu={
        !editing && (
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
        )
      }
    >
      {editing ? (
        <ChatEdit
          label="Edit comment"
          text={body}
          onDone={() => setEditing(false)}
          // Edits the words only: a reply's quote stays as it was.
          onSave={(next) =>
            change.mutate(
              { ...target, change: { body: comment.parentId ? next : withReply(reply, next) } },
              { onError: (error) => storageErrorToast(error, "It was not saved") },
            )
          }
        />
      ) : (
        <ChatText>{body}</ChatText>
      )}
    </ChatMessage>
  );
}

/**
 * The chat box: a comment on the version on screen, carrying the quote of the message it replies
 * to when there is one.
 */
function Composer(props: {
  door: Door;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  replyTo: Reply | null;
  onClearReply: () => void;
  onSent: (sent: Reply | null) => void;
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
    const typed = text.trim();
    if (!typed || sending.current) return;
    sending.current = true;
    const body = withReply(replyTo ?? undefined, typed);
    add.mutate(
      {
        ...withShare(door),
        body: { body, ...(contentVersion === undefined ? {} : { contentVersion }) },
      },
      {
        // Clears what was sent, not what was typed while it was on its way.
        onSuccess: () => {
          setText((current) => (current.trim() === typed ? "" : current));
          props.onSent(replyTo);
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
