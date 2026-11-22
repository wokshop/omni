import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  IconArrowUp,
  IconMaximize,
  IconMinimize,
  IconPlus,
  IconX,
} from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { FileTrigger } from "@/components/ui/file-trigger";
import { Textarea } from "@/components/ui/textarea";
import { appToast } from "@/components/ui/toast";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { useMember } from "@/hooks/use-session.ts";
import { inBackground } from "@/lib/desktop-notifications.ts";
import { keys } from "@/lib/query-keys.ts";
import {
  addMessage,
  firstName,
  markRead,
  openThread,
  sendFile,
  sendNote,
  talkMessagesQuery,
  talkPeopleQuery,
  type TalkPerson,
} from "@/lib/talk.ts";
import { talkWindow, useTalkWindow } from "@/lib/talk-window.ts";
import { TalkFace } from "./presence-stack";
import { TalkMessages } from "./talk-messages";

function HeaderAction(props: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <TooltipTrigger delay={400}>
      <Button intent="ink" size="sq-xs" aria-label={props.label} onPress={props.onPress}>
        {props.children}
      </Button>
      <Tooltip>{props.label}</Tooltip>
    </TooltipTrigger>
  );
}

function Header(props: { person: TalkPerson; expanded: boolean }) {
  const { person, expanded } = props;
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 ps-3.5 pe-1.5">
      <TalkFace person={person} size={18} />
      <h2 className="min-w-0 truncate text-sm text-ink-foreground">{person.name}</h2>
      {person.online && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          Active now
        </span>
      )}
      <span className="ms-auto flex">
        <HeaderAction label={expanded ? "Shrink" : "Expand"} onPress={talkWindow.toggleExpanded}>
          {expanded ? <IconMinimize /> : <IconMaximize />}
        </HeaderAction>
        <HeaderAction label="Close" onPress={talkWindow.close}>
          <IconX />
        </HeaderAction>
      </span>
    </header>
  );
}

function Composer(props: { person: TalkPerson; threadId: string | undefined }) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const settle = () => client.invalidateQueries({ queryKey: keys.talkPeople() });
  const note = useMutation({
    mutationFn: (body: string) => sendNote(props.threadId!, body),
    scope: { id: `talk-notes:${props.threadId}` },
    onSuccess: (message) => {
      addMessage(client, message);
      void settle();
    },
    onError: (_error, body) => {
      setText((now) => (now.trim() ? now : body));
      appToast.error("The note was not sent. Try again.");
    },
  });
  const files = useFileDrop(props.threadId);
  useEffect(() => field.current?.focus(), [props.person.memberId]);

  const send = () => {
    const body = text.trim();
    if (!body || !props.threadId) return;
    setText("");
    note.mutate(body);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  return (
    <div className="flex shrink-0 items-end gap-1 rounded-2xl bg-ink p-1.5 ps-3.5 shadow-overlay">
      <Textarea
        ref={field}
        plain
        aria-label={`Note to ${props.person.name}`}
        placeholder={`Note to ${firstName(props.person.name)}…`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-28 min-h-7 flex-1 resize-none py-1 text-ink-foreground placeholder:text-ink-muted sm:py-1"
      />
      <FileTrigger allowsMultiple onSelect={(list) => list && files.send([...list])}>
        <Button intent="ink" size="sq-sm" aria-label="Attach" isPending={files.isPending}>
          <IconPlus />
        </Button>
      </FileTrigger>
      <Button
        intent="ink-solid"
        size="sq-sm"
        aria-label="Drop"
        isDisabled={!text.trim() || !props.threadId}
        onPress={send}
        className="rounded-lg"
      >
        <IconArrowUp />
      </Button>
    </div>
  );
}

function useFileDrop(threadId: string | undefined) {
  const client = useQueryClient();
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) addMessage(client, await sendFile(threadId!, file));
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.talkPeople() }),
    onError: () => appToast.error("The file was not sent. Try again."),
  });
  return {
    isPending: upload.isPending,
    send: (files: File[]) => threadId && files.length > 0 && upload.mutate(files),
  };
}

function useReadWhileOpen(threadId: string | undefined, newest: string | undefined) {
  const client = useQueryClient();
  useEffect(() => {
    if (!threadId) return;
    const read = () => {
      if (inBackground()) return;
      void markRead(threadId).then(() => client.invalidateQueries({ queryKey: keys.talkPeople() }));
    };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [client, threadId, newest]);
}

function NoteBones() {
  return (
    <div className="flex flex-col gap-2 px-3.5 py-2">
      <SkeletonBox width="70%" height={16} radius="var(--radius-sm)" />
      <SkeletonBox width="45%" height={16} radius="var(--radius-sm)" />
    </div>
  );
}

function Conversation(props: { person: TalkPerson; expanded: boolean }) {
  const { user, member } = useMember();
  const thread = useQuery({
    queryKey: [...keys.talk(), "thread", props.person.memberId],
    queryFn: () => openThread(props.person.memberId),
    staleTime: Infinity,
  });
  const threadId = thread.data?.id;
  const messages = useInfiniteQuery({ ...talkMessagesQuery(threadId ?? ""), enabled: !!threadId });
  const list = messages.data?.pages.flatMap((page) => page.messages) ?? [];
  useReadWhileOpen(threadId, list[0]?.id);
  const files = useFileDrop(threadId);
  const [dragging, setDragging] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    files.send([...event.dataTransfer.files]);
  };
  const me = { name: user.name || user.email, image: user.image ?? null };

  return (
    <div
      className="flex min-h-0 flex-col gap-1.5"
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
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-2xl bg-ink shadow-overlay",
          dragging && "ring-2 ring-ink-foreground/40",
        )}
      >
        <Header person={props.person} expanded={props.expanded} />
        {(messages.isPending || list.length > 0) && (
          <div
            className={cn(
              "flex min-h-0 flex-col-reverse overflow-y-auto border-t border-ink-rule pb-1",
              props.expanded ? "max-h-[calc(100svh-11rem)]" : "max-h-80",
            )}
          >
            {messages.isPending ? (
              <Skeleton loading label="Loading notes" skeleton={<NoteBones />}>
                {null}
              </Skeleton>
            ) : (
              <TalkMessages messages={list} meId={member.id} me={me} them={props.person} />
            )}
            {messages.hasNextPage && (
              <Button
                intent="ink"
                size="text"
                className="mx-auto mt-2 text-ink-muted"
                isPending={messages.isFetchingNextPage}
                onPress={() => void messages.fetchNextPage()}
              >
                Earlier
              </Button>
            )}
          </div>
        )}
      </div>
      <Composer person={props.person} threadId={threadId} />
    </div>
  );
}

const GUTTER = 12;
const BELOW = 6;

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
 * The one floating conversation, opened just under the face it came from: a solid ink panel and
 * the composer under it. Expanding makes it wider and taller, still floating. Mount once.
 */
export function TalkWindow() {
  const { memberId, expanded } = useTalkWindow();
  const { data: people } = useQuery(talkPeopleQuery());
  const person = memberId ? people?.find((p) => p.memberId === memberId) : undefined;
  const width = Math.min(expanded ? 420 : 304, window.innerWidth - GUTTER * 2);
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
      className={cn(
        "fixed z-40 flex max-h-[calc(100svh-4rem)] flex-col",
        "origin-top animate-in fade-in zoom-in-95 duration-150 ease-out motion-reduce:animate-none",
      )}
    >
      <Conversation key={person.memberId} person={person} expanded={expanded} />
    </section>
  );
}
