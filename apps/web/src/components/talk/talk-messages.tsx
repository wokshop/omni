import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { FileGlyph } from "@/components/storage/file-glyph";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { fileType } from "@/lib/file-kind.ts";
import { keys } from "@/lib/query-keys.ts";
import { fileUrl, isImage, react, type TalkMessage, type TalkPerson } from "@/lib/talk.ts";
import { TalkFace } from "./presence-stack";

const GAP_MS = 60 * 60_000;
const QUICK = ["👍", "❤️", "😂", "🎉"];
const ROW = "flex min-w-0 items-start gap-2.5 px-3.5";

const timeLine = (at: Date, now = new Date()) => {
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (at.toDateString() === now.toDateString()) return `Today ${time}`;
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

function Reactions(props: { message: TalkMessage; meId: string }) {
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
    <span className="ms-auto flex shrink-0 items-center gap-0.5 self-center">
      {reactions.map((r) => (
        <Button
          key={r.emoji}
          intent="ink"
          size="text"
          isCircle
          aria-pressed={has(r.emoji)}
          aria-label={`${r.emoji} ${r.memberIds.length}`}
          onPress={() => toggle.mutate({ emoji: r.emoji, on: !has(r.emoji) })}
          className={cn(
            "h-5 px-1.5 text-ink-muted tabular-nums",
            has(r.emoji) && "bg-ink-hover text-ink-foreground",
          )}
        >
          {r.emoji}
          {r.memberIds.length > 1 && <span>{r.memberIds.length}</span>}
        </Button>
      ))}
      <span className="flex opacity-0 transition-opacity duration-150 group-hover/note:opacity-100 group-focus-within/note:opacity-100 pointer-coarse:opacity-100">
        {QUICK.filter((emoji) => !has(emoji)).map((emoji) => (
          <Button
            key={emoji}
            intent="ink"
            size="sq-2xs"
            aria-label={`React ${emoji}`}
            onPress={() => toggle.mutate({ emoji, on: true })}
            className="text-xs"
          >
            {emoji}
          </Button>
        ))}
      </span>
    </span>
  );
}

function Attachment(props: { message: TalkMessage }) {
  const file = props.message.file!;
  const href = file.nodeId ? fileUrl(props.message.id) : undefined;
  const mark =
    href && isImage(file.mimeType) ? (
      <img
        src={href}
        alt={file.name}
        loading="lazy"
        className="size-8 shrink-0 rounded-md bg-ink-hover object-cover"
      />
    ) : (
      <span className="grid size-8 shrink-0 place-items-center text-ink-muted *:size-4">
        <FileGlyph kind={fileType(file.name, file.mimeType).kind} />
      </span>
    );
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      {mark}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm/5 text-ink-foreground">{file.name}</span>
        <span className="truncate text-xs/4 text-ink-muted tabular-nums">
          {typeOf(file.name)} • {bytes(file.size)}
        </span>
      </span>
    </span>
  );
  return href ? (
    <Link href={href} target="_blank" rel="noreferrer" className="min-w-0 hover:opacity-85">
      {body}
    </Link>
  ) : (
    <span className="min-w-0 opacity-50">{body}</span>
  );
}

function Note(props: {
  message: TalkMessage;
  meId: string;
  face: Pick<TalkPerson, "name" | "image">;
  showFace: boolean;
}) {
  const { message } = props;
  return (
    <div className={cn("group/note py-1", ROW)}>
      <span className="mt-0.5 w-4 shrink-0">
        {props.showFace && <TalkFace person={props.face} size={16} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {message.body && (
          <p className="text-sm/5 break-words whitespace-pre-wrap text-ink-foreground">
            {message.body}
          </p>
        )}
        {message.file && <Attachment message={message} />}
      </div>
      <Reactions message={message} meId={props.meId} />
    </div>
  );
}

/** A thread's notes, oldest first, in sections that each open on a time line. */
export function TalkMessages(props: {
  messages: TalkMessage[];
  meId: string;
  me: Pick<TalkPerson, "name" | "image">;
  them: Pick<TalkPerson, "name" | "image">;
}) {
  const sections: TalkMessage[][] = [];
  for (const message of props.messages.toReversed()) {
    const last = sections.at(-1)?.at(-1);
    const apart = !last || Date.parse(message.createdAt) - Date.parse(last.createdAt) > GAP_MS;
    if (apart) sections.push([message]);
    else sections.at(-1)!.push(message);
  }
  return (
    <div className="flex flex-col">
      {sections.map((section) => (
        <section
          key={section[0]!.id}
          className="border-t border-ink-rule py-2 first:border-t-0 first:pt-1"
        >
          <h3 className="px-3.5 pb-1 text-xs/5 text-ink-muted tabular-nums">
            {timeLine(new Date(section[0]!.createdAt))}
          </h3>
          {section.map((message, i) => {
            const mine = message.authorMemberId === props.meId;
            return (
              <Note
                key={message.id}
                message={message}
                meId={props.meId}
                face={mine ? props.me : props.them}
                showFace={section[i - 1]?.authorMemberId !== message.authorMemberId}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
