import { cn } from "cn";
import { Skeleton, SkeletonBox } from "skullet/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { IconArrowUp, IconPlus, IconX } from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { FileTrigger } from "@/components/ui/file-trigger";
import { Textarea } from "@/components/ui/textarea";
import { appToast } from "@/components/ui/toast";
import { useMember } from "@/hooks/use-session.ts";
import {
  useReadThread,
  useSendFiles,
  useSendNote,
  useTalkMessages,
  useTalkPeople,
  useTalkThread,
} from "@/hooks/use-talk.ts";
import { inBackground } from "@/lib/desktop-notifications.ts";
import { firstName, type TalkPerson } from "@/lib/talk.ts";
import { talkWindow, useTalkWindow } from "@/lib/talk-window.ts";
import { TalkMessages } from "./talk-messages";

const WIDTH = 288;
const GUTTER = 12;
const BELOW = 6;

function Header(props: { person: TalkPerson }) {
  return (
    <header className="flex h-9 shrink-0 items-center gap-1.5 ps-3.5 pe-1.5">
      <h2 className="min-w-0 truncate text-sm">{props.person.name}</h2>
      {props.person.online && (
        <span aria-label="Active now" className="size-1.5 shrink-0 rounded-full bg-success" />
      )}
      <Button
        intent="ghost"
        size="sq-xs"
        aria-label="Close"
        onPress={talkWindow.close}
        className="ms-auto opacity-0 transition-opacity duration-150 group-hover/talk:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <IconX />
      </Button>
    </header>
  );
}

function Composer(props: { person: TalkPerson; threadId: string | undefined }) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const note = useSendNote(props.threadId);
  const files = useSendFiles(props.threadId);
  useEffect(() => field.current?.focus(), [props.person.memberId]);

  const send = () => {
    const body = text.trim();
    if (!body || !props.threadId) return;
    setText("");
    note.mutate(body, {
      onError: () => {
        setText((now) => (now.trim() ? now : body));
        appToast.error("The note was not sent. Try again.");
      },
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  const attach = (list: File[]) =>
    props.threadId &&
    list.length > 0 &&
    files.mutate(list, { onError: () => appToast.error("The file was not sent. Try again.") });
  return (
    <div className="flex shrink-0 items-end gap-0.5 p-1.5 ps-3.5">
      <Textarea
        ref={field}
        plain
        aria-label={`Note to ${props.person.name}`}
        placeholder={`Note to ${firstName(props.person.name)}…`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-28 min-h-7 flex-1 resize-none py-1 sm:py-1"
      />
      <FileTrigger allowsMultiple onSelect={(list) => list && attach([...list])}>
        <Button
          intent="ghost"
          size="sq-sm"
          isCircle
          aria-label="Attach"
          isPending={files.isPending}
        >
          <IconPlus />
        </Button>
      </FileTrigger>
      <Button
        intent="primary"
        size="sq-sm"
        isCircle
        aria-label="Drop"
        isDisabled={!text.trim() || !props.threadId}
        onPress={send}
      >
        <IconArrowUp />
      </Button>
    </div>
  );
}

function useReadWhileOpen(threadId: string | undefined, newest: string | undefined) {
  const read = useReadThread();
  useEffect(() => {
    if (!threadId) return;
    const now = () => {
      if (!inBackground()) void read(threadId);
    };
    now();
    window.addEventListener("focus", now);
    document.addEventListener("visibilitychange", now);
    return () => {
      window.removeEventListener("focus", now);
      document.removeEventListener("visibilitychange", now);
    };
  }, [read, threadId, newest]);
}

function NoteBones() {
  return (
    <div className="flex flex-col items-end gap-1.5 px-3 py-2">
      <SkeletonBox width="60%" height={30} radius="var(--radius-2xl)" />
      <SkeletonBox width="40%" height={30} radius="var(--radius-2xl)" />
    </div>
  );
}

function Conversation(props: { person: TalkPerson }) {
  const { member } = useMember();
  const thread = useTalkThread(props.person.memberId);
  const threadId = thread.data?.id;
  const messages = useTalkMessages(threadId);
  const list = messages.data?.pages.flatMap((page) => page.messages) ?? [];
  useReadWhileOpen(threadId, list[0]?.id);
  const files = useSendFiles(threadId);
  const [dragging, setDragging] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = [...event.dataTransfer.files];
    if (threadId && dropped.length) files.mutate(dropped);
  };

  return (
    <div
      className={cn(
        "group/talk flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-overlay/90 shadow-overlay backdrop-blur-xl",
        dragging && "ring-2 ring-ring",
      )}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <Header person={props.person} />
      {(messages.isPending || list.length > 0) && (
        <div className="flex max-h-80 min-h-0 flex-col-reverse overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_12px)]">
          {messages.isPending ? (
            <Skeleton loading label="Loading notes" skeleton={<NoteBones />}>
              {null}
            </Skeleton>
          ) : (
            <TalkMessages messages={list} meId={member.id} />
          )}
          {messages.hasNextPage && (
            <Button
              intent="plain"
              size="text"
              className="mx-auto mt-1 text-muted-foreground"
              isPending={messages.isFetchingNextPage}
              onPress={() => void messages.fetchNextPage()}
            >
              Earlier
            </Button>
          )}
        </div>
      )}
      <Composer person={props.person} threadId={threadId} />
    </div>
  );
}

function useAnchor(memberId: string | null, width: number) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!memberId) return;
    const place = () => {
      const face =
        document.querySelector(`[data-talk-face="${CSS.escape(memberId)}"]`) ??
        document.querySelector("[data-talk-everyone]") ??
        document.querySelector("[data-notifications-toggle]");
      const box = face?.getBoundingClientRect();
      const centre = box ? box.left + box.width / 2 : window.innerWidth;
      const left = Math.min(
        Math.max(centre - width / 2, GUTTER),
        window.innerWidth - width - GUTTER,
      );
      setAt({ top: (box?.bottom ?? 42) + BELOW, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [memberId, width]);
  return at;
}

/**
 * The one conversation: a small translucent island just under the face it was opened from,
 * the notes as bubbles and the composer inside it. Mount once in the shell.
 */
export function TalkWindow() {
  const memberId = useTalkWindow();
  const { data: people } = useTalkPeople();
  const person = memberId ? people?.find((p) => p.memberId === memberId) : undefined;
  const width = Math.min(WIDTH, window.innerWidth - GUTTER * 2);
  const at = useAnchor(person ? memberId : null, width);
  useEffect(() => {
    if (!memberId) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) talkWindow.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [memberId]);
  if (!person || !at) return null;
  return (
    <section
      aria-label={`Conversation with ${person.name}`}
      style={{ top: at.top, left: at.left, width }}
      className="fixed z-40 flex max-h-[calc(100svh-4rem)] flex-col origin-top animate-in fade-in zoom-in-95 duration-150 ease-out motion-reduce:animate-none"
    >
      <Conversation key={person.memberId} person={person} />
    </section>
  );
}
