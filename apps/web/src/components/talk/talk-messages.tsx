import { cn } from "cn";
import { Fragment } from "react";
import { FileGlyph } from "@/components/storage/file-glyph";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { useReact } from "@/hooks/use-talk.ts";
import { fileType } from "@/lib/file-kind.ts";
import { fileUrl, isImage, type TalkMessage } from "@/lib/talk.ts";

const GAP_MS = 60 * 60_000;
const QUICK = ["👍", "❤️", "😂", "🎉"];

const timeLine = (at: Date, now = new Date()) => {
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (at.toDateString() === now.toDateString()) return time;
  const day = at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day}, ${time}`;
};

const bytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${Math.round(size / 1024)} KB`
      : `${(size / 1024 ** 2).toFixed(1)} MB`;

const typeOf = (name: string) => name.split(".").at(-1)?.toUpperCase() ?? "File";

function useToggle(message: TalkMessage, meId: string) {
  const toggle = useReact(message.threadId);
  const has = (emoji: string) =>
    message.reactions.some((r) => r.emoji === emoji && r.memberIds.includes(meId));
  const set = (emoji: string, on: boolean) => toggle.mutate({ messageId: message.id, emoji, on });
  return { has, set };
}

function Reactions(props: { message: TalkMessage; meId: string; mine: boolean }) {
  const { has, set } = useToggle(props.message, props.meId);
  if (props.message.reactions.length === 0) return null;
  return (
    <div className={cn("flex items-center gap-0.5", props.mine && "flex-row-reverse")}>
      {props.message.reactions.map((r) => (
        <Button
          key={r.emoji}
          intent="outline"
          size="text"
          isCircle
          aria-pressed={has(r.emoji)}
          aria-label={`${r.emoji} ${r.memberIds.length}`}
          onPress={() => set(r.emoji, !has(r.emoji))}
          className={cn("h-5 px-1.5 tabular-nums shadow-none", has(r.emoji) && "bg-accent")}
        >
          {r.emoji}
          {r.memberIds.length > 1 && <span>{r.memberIds.length}</span>}
        </Button>
      ))}
    </div>
  );
}

function QuickReactions(props: { message: TalkMessage; meId: string; mine: boolean }) {
  const { has, set } = useToggle(props.message, props.meId);
  return (
    <span
      className={cn(
        "absolute top-0 flex opacity-0 transition-opacity duration-150 group-hover/note:opacity-100 group-focus-within/note:opacity-100 pointer-coarse:opacity-100",
        props.mine ? "start-0" : "end-0",
      )}
    >
      {QUICK.filter((emoji) => !has(emoji)).map((emoji) => (
        <Button
          key={emoji}
          intent="ghost"
          size="sq-2xs"
          aria-label={`React ${emoji}`}
          onPress={() => set(emoji, true)}
          className="text-xs"
        >
          {emoji}
        </Button>
      ))}
    </span>
  );
}

function Attachment(props: { message: TalkMessage; mine: boolean }) {
  const file = props.message.file!;
  const href = file.nodeId ? fileUrl(props.message.id) : undefined;
  if (href && isImage(file.mimeType)) {
    return (
      <Link href={href} target="_blank" rel="noreferrer" className="block hover:opacity-90">
        <img
          src={href}
          alt={file.name}
          loading="lazy"
          className="aspect-[4/3] w-44 rounded-2xl border border-border bg-secondary object-cover"
        />
      </Link>
    );
  }
  const chip = (
    <span
      className={cn(
        "flex max-w-56 min-w-0 items-center gap-2 rounded-2xl px-2.5 py-1.5",
        props.mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
      )}
    >
      <span className="shrink-0 opacity-70 *:size-4">
        <FileGlyph kind={fileType(file.name, file.mimeType).kind} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm/5">{file.name}</span>
        <span className="truncate text-xs/4 opacity-70 tabular-nums">
          {typeOf(file.name)} • {bytes(file.size)}
        </span>
      </span>
    </span>
  );
  return href ? (
    <Link href={href} target="_blank" rel="noreferrer" className="block min-w-0 hover:opacity-90">
      {chip}
    </Link>
  ) : (
    <span className="block min-w-0 opacity-50">{chip}</span>
  );
}

function Note(props: { message: TalkMessage; meId: string; tail: boolean }) {
  const { message } = props;
  const mine = message.authorMemberId === props.meId;
  return (
    <div
      className={cn(
        "group/note relative flex flex-col gap-1",
        mine ? "items-end ps-20" : "items-start pe-20",
        props.tail && "mb-1.5",
      )}
    >
      {message.body && (
        <p
          className={cn(
            "max-w-full rounded-2xl px-3 py-1.5 text-sm/5 break-words whitespace-pre-wrap",
            mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
          )}
        >
          {message.body}
        </p>
      )}
      {message.file && <Attachment message={message} mine={mine} />}
      <Reactions message={message} meId={props.meId} mine={mine} />
      <QuickReactions message={message} meId={props.meId} mine={mine} />
    </div>
  );
}

/** A thread's notes as bubbles, oldest first, a time line wherever an hour passes. */
export function TalkMessages(props: { messages: TalkMessage[]; meId: string }) {
  const ordered = props.messages.toReversed();
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2">
      {ordered.map((message, i) => {
        const before = ordered[i - 1];
        const after = ordered[i + 1];
        const at = Date.parse(message.createdAt);
        const newHour = !before || at - Date.parse(before.createdAt) > GAP_MS;
        const tail = !!after && after.authorMemberId !== message.authorMemberId;
        return (
          <Fragment key={message.id}>
            {newHour && (
              <p className="py-1.5 text-center text-xs text-muted-foreground tabular-nums">
                {timeLine(new Date(at))}
              </p>
            )}
            <Note message={message} meId={props.meId} tail={tail} />
          </Fragment>
        );
      })}
    </div>
  );
}
