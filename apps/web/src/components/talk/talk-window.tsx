import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Skeleton, SkeletonBox } from "skullet/react";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { IconMaximize, IconMinimize, IconPlus, IconX } from "@/components/icons/central";
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
      <Button intent="ghost" size="sq-sm" aria-label={props.label} onPress={props.onPress}>
        {props.children}
      </Button>
      <Tooltip>{props.label}</Tooltip>
    </TooltipTrigger>
  );
}

function Header(props: { person: TalkPerson; expanded: boolean }) {
  const { person, expanded } = props;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border ps-4 pe-2.5">
      <TalkFace person={person} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate text-sm/4 font-medium">{person.name}</h2>
        {person.online && (
          <span className="flex items-center gap-1.5 text-xs/4 text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            Active now
          </span>
        )}
      </div>
      <HeaderAction label={expanded ? "Shrink" : "Expand"} onPress={talkWindow.toggleExpanded}>
        {expanded ? <IconMinimize /> : <IconMaximize />}
      </HeaderAction>
      <HeaderAction label="Close" onPress={talkWindow.close}>
        <IconX />
      </HeaderAction>
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
    <div className="m-2 mt-0 flex shrink-0 items-end gap-1 rounded-xl border border-border bg-background p-1.5 ps-3">
      <Textarea
        ref={field}
        plain
        aria-label={`Note to ${props.person.name}`}
        placeholder={`Note to ${firstName(props.person.name)}…`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-32 min-h-7 flex-1 resize-none py-0.5 sm:py-0.5"
      />
      <FileTrigger allowsMultiple onSelect={(list) => list && files.send([...list])}>
        <Button intent="ghost" size="sq-sm" aria-label="Attach" isPending={files.isPending}>
          <IconPlus />
        </Button>
      </FileTrigger>
      <Button
        intent="primary"
        size="sm"
        isDisabled={!text.trim() || !props.threadId}
        onPress={send}
      >
        Drop ↵
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
    <div className="flex flex-col items-end gap-2">
      <SkeletonBox width="60%" height={32} radius="var(--radius-2xl)" />
      <SkeletonBox width="40%" height={32} radius="var(--radius-2xl)" />
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
      className={cn("relative flex min-h-0 flex-1 flex-col", dragging && "bg-accent")}
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
      <Header person={props.person} expanded={props.expanded} />
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 py-3">
        {messages.isPending ? (
          <Skeleton loading label="Loading notes" skeleton={<NoteBones />}>
            {null}
          </Skeleton>
        ) : (
          <TalkMessages messages={list} meId={member.id} me={me} them={props.person} />
        )}
        {messages.hasNextPage && (
          <Button
            intent="plain"
            size="text"
            className="mx-auto mb-2 text-muted-foreground"
            isPending={messages.isFetchingNextPage}
            onPress={() => void messages.fetchNextPage()}
          >
            Earlier
          </Button>
        )}
      </div>
      <Composer person={props.person} threadId={threadId} />
    </div>
  );
}

/**
 * The one floating conversation, under the title bar at the window's end. Expanding makes it
 * taller and wider and keeps it floating over the page. Mount once in the shell.
 */
export function TalkWindow() {
  const { memberId, expanded } = useTalkWindow();
  const { data: people } = useQuery(talkPeopleQuery());
  const person = memberId ? people?.find((p) => p.memberId === memberId) : undefined;
  useEffect(() => {
    if (!memberId) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) talkWindow.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [memberId]);
  if (!person) return null;
  return (
    <section
      aria-label={`Conversation with ${person.name}`}
      className={cn(
        "fixed end-3 top-14 z-40 flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay",
        "origin-top-right animate-in fade-in zoom-in-95 duration-150 ease-out motion-reduce:animate-none",
        "transition-[width,height] duration-200 ease-out motion-reduce:transition-none",
        expanded
          ? "h-[calc(100svh-4.5rem)] w-[min(40rem,calc(100vw-1.5rem))]"
          : "h-[min(35rem,calc(100svh-4.5rem))] w-[min(22rem,calc(100vw-1.5rem))]",
      )}
    >
      <Conversation key={person.memberId} person={person} expanded={expanded} />
    </section>
  );
}
