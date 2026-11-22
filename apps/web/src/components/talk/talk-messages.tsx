import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Fragment } from "react";
import { FileTile } from "@/components/storage/file-glyph";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { fileType } from "@/lib/file-kind.ts";
import { keys } from "@/lib/query-keys.ts";
import { fileUrl, isImage, react, type TalkMessage, type TalkPerson } from "@/lib/talk.ts";
import { TalkFace } from "./presence-stack";

const GAP_MS = 60 * 60_000;
const QUICK = ["👍", "❤️", "😂", "🎉"];

const timeLine = (at: Date, now = new Date()) => {
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (at.toDateString() === now.toDateString()) return `Today ${time}`;
  const day = at.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day}, ${time}`;
};

const bytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${Math.round(size / 1024)} KB`
      : `${(size / 1024 ** 2).toFixed(1)} MB`;

function FileCard(props: { message: TalkMessage; mine: boolean }) {
  const file = props.message.file!;
  const href = file.nodeId ? fileUrl(props.message.id) : undefined;
  if (href && isImage(file.mimeType)) {
    return (
      <Link href={href} target="_blank" rel="noreferrer" className="block">
        <img
          src={href}
          alt={file.name}
          loading="lazy"
          className="aspect-[4/3] w-64 rounded-2xl border border-border bg-secondary object-cover"
        />
      </Link>
    );
  }
  const body = (
    <span className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-2 pe-3">
      <FileTile kind={fileType(file.name, file.mimeType).kind} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm/4">{file.name}</span>
        <span className="text-xs/4 text-muted-foreground tabular-nums">{bytes(file.size)}</span>
      </span>
    </span>
  );
  return href ? (
    <Link href={href} target="_blank" rel="noreferrer" className="block max-w-64">
      {body}
    </Link>
  ) : (
    <span className="block max-w-64 opacity-60">{body}</span>
  );
}

function Reactions(props: { message: TalkMessage; meId: string; mine: boolean }) {
  const client = useQueryClient();
  const toggle = useMutation({
    mutationFn: ({ emoji, on }: { emoji: string; on: boolean }) =>
      react(props.message.id, emoji, on),
    onSettled: () =>
      client.invalidateQueries({ queryKey: keys.talkMessages(props.message.threadId) }),
  });
  const reactions = props.message.reactions;
  const has = (emoji: string) =>
    reactions.some((r) => r.emoji === emoji && r.memberIds.includes(props.meId));
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1",
        props.mine ? "justify-end" : "justify-start",
      )}
    >
      {reactions.map((r) => (
        <Button
          key={r.emoji}
          intent="outline"
          size="text"
          isCircle
          aria-pressed={has(r.emoji)}
          aria-label={`${r.emoji} ${r.memberIds.length}`}
          onPress={() => toggle.mutate({ emoji: r.emoji, on: !has(r.emoji) })}
          className={cn("h-5 px-1.5 tabular-nums", has(r.emoji) && "border-primary/40 bg-accent")}
        >
          {r.emoji}
          {r.memberIds.length > 1 && <span>{r.memberIds.length}</span>}
        </Button>
      ))}
      <span className="flex opacity-0 transition-opacity duration-150 group-hover/note:opacity-100 group-focus-within/note:opacity-100 pointer-coarse:opacity-100">
        {QUICK.filter((emoji) => !has(emoji)).map((emoji) => (
          <Button
            key={emoji}
            intent="ghost"
            size="sq-2xs"
            aria-label={`React ${emoji}`}
            onPress={() => toggle.mutate({ emoji, on: true })}
            className="text-xs"
          >
            {emoji}
          </Button>
        ))}
      </span>
    </div>
  );
}

function Note(props: {
  message: TalkMessage;
  mine: boolean;
  meId: string;
  face: Pick<TalkPerson, "name" | "image">;
  showFace: boolean;
}) {
  const { message, mine } = props;
  return (
    <div className={cn("group/note flex items-end gap-2", mine && "flex-row-reverse")}>
      <span className="w-6 shrink-0">
        {props.showFace && <TalkFace person={props.face} size={24} />}
      </span>
      <div className={cn("flex min-w-0 flex-col gap-1", mine ? "items-end" : "items-start")}>
        {message.file && <FileCard message={message} mine={mine} />}
        {message.body && (
          <p
            className={cn(
              "max-w-64 rounded-2xl px-3 py-1.5 text-sm/5 break-words whitespace-pre-wrap",
              mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
            )}
          >
            {message.body}
          </p>
        )}
        <Reactions message={message} meId={props.meId} mine={mine} />
      </div>
    </div>
  );
}

/** A thread's notes, oldest at the top, with a time line wherever an hour passes. */
export function TalkMessages(props: {
  messages: TalkMessage[];
  meId: string;
  me: Pick<TalkPerson, "name" | "image">;
  them: Pick<TalkPerson, "name" | "image">;
}) {
  const ordered = props.messages.toReversed();
  return (
    <div className="flex flex-col gap-1.5">
      {ordered.map((message, i) => {
        const at = new Date(message.createdAt);
        const before = ordered[i - 1];
        const after = ordered[i + 1];
        const newHour = !before || at.getTime() - new Date(before.createdAt).getTime() > GAP_MS;
        const mine = message.authorMemberId === props.meId;
        const lastOfRun =
          !after ||
          after.authorMemberId !== message.authorMemberId ||
          new Date(after.createdAt).getTime() - at.getTime() > GAP_MS;
        return (
          <Fragment key={message.id}>
            {newHour && (
              <p className="py-2 text-center text-xs text-muted-foreground tabular-nums">
                {timeLine(at)}
              </p>
            )}
            <Note
              message={message}
              mine={mine}
              meId={props.meId}
              face={mine ? props.me : props.them}
              showFace={lastOfRun}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
