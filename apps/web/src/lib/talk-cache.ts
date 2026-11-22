import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { api, call } from "./api.ts";
import { keys } from "./query-keys.ts";
import type { TalkMessage, TalkMessagesResponse, TalkPerson } from "./talk.ts";

type Pages = InfiniteData<TalkMessagesResponse>;

const PENDING = "pending:";
export const isPending = (messageId: string) => messageId.startsWith(PENDING);
export const pendingId = () => `${PENDING}${crypto.randomUUID()}`;

function editPages(client: QueryClient, threadId: string, edit: (data: Pages) => Pages) {
  const queryKey = keys.talkMessages(threadId);
  const settle = () => {
    if (client.getQueryData(queryKey))
      client.setQueryData<Pages>(queryKey, (data) => data && edit(data));
    else void client.invalidateQueries({ queryKey });
  };
  settle();
  const cache = client.getQueryCache();
  const query = cache.find({ queryKey, exact: true });
  if (query?.state.fetchStatus !== "fetching") return;
  // WARNING: a fetch in flight answers from what it started with; apply the change again after it.
  const stop = cache.subscribe((event) => {
    if (event.query !== query || query.state.fetchStatus === "fetching") return;
    stop();
    settle();
  });
}

const has = (data: Pages, messageId: string) =>
  data.pages.some((page) => page.messages.some((m) => m.id === messageId));

/** Puts a note at the top of its thread's first page, once; a known one is left as it is. */
export function addMessage(client: QueryClient, message: TalkMessage) {
  editPages(client, message.threadId, (data) => withMessage(data, message));
}

function withMessage(data: Pages, message: TalkMessage) {
  const [first, ...rest] = data.pages;
  if (!first || has(data, message.id)) return data;
  const twin = first.messages.findLastIndex(
    (m) =>
      isPending(m.id) && m.authorMemberId === message.authorMemberId && m.body === message.body,
  );
  const messages = twin === -1 ? [message, ...first.messages] : first.messages.with(twin, message);
  return { ...data, pages: [{ ...first, messages }, ...rest] };
}

/** Swaps a note on its way for the one the server stored, or drops it (failed, or already in). */
export function settlePending(
  client: QueryClient,
  threadId: string,
  pending: string,
  message: TalkMessage | null,
) {
  editPages(client, threadId, (data) => {
    const drop = !message || has(data, message.id);
    if (!drop && !has(data, pending)) return withMessage(data, message);
    return {
      ...data,
      pages: data.pages.map((page) =>
        page.messages.some((m) => m.id === pending)
          ? {
              ...page,
              messages: drop
                ? page.messages.filter((m) => m.id !== pending)
                : page.messages.map((m) => (m.id === pending ? message : m)),
            }
          : page,
      ),
    };
  });
}

/** A note's reactions as they now are, wherever it sits in the loaded pages. */
export function setReactions(
  client: QueryClient,
  threadId: string,
  messageId: string,
  reactions: TalkMessage["reactions"],
) {
  editPages(client, threadId, (data) => ({
    ...data,
    pages: data.pages.map((page) =>
      page.messages.some((m) => m.id === messageId)
        ? {
            ...page,
            messages: page.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
          }
        : page,
    ),
  }));
}

/** `memberId`'s `emoji` on a note, on or off, as the server will have it. */
export function toggledReactions(
  reactions: TalkMessage["reactions"],
  memberId: string,
  emoji: string,
  on: boolean,
) {
  const others = (ids: string[]) => ids.filter((id) => id !== memberId);
  const next = reactions
    .map((r) =>
      r.emoji === emoji
        ? { ...r, memberIds: on ? [...others(r.memberIds), memberId] : others(r.memberIds) }
        : r,
    )
    .filter((r) => r.memberIds.length > 0);
  return on && !next.some((r) => r.emoji === emoji)
    ? [...next, { emoji, memberIds: [memberId] }]
    : next;
}

export const messageOf = (client: QueryClient, threadId: string, messageId: string) =>
  client
    .getQueryData<Pages>(keys.talkMessages(threadId))
    ?.pages.flatMap((page) => page.messages)
    .find((m) => m.id === messageId);

/**
 * The thread's newest page, merged into what is loaded: new notes go on top, known ones take the
 * server's reactions. For an event that names a note without carrying it.
 */
export async function fetchNewest(client: QueryClient, threadId: string) {
  if (!client.getQueryData(keys.talkMessages(threadId))) return;
  const page = await call(
    api.talk.threads[":id"].messages.$get({ param: { id: threadId }, query: {} }),
  );
  const fresh = new Map(page.messages.map((m) => [m.id, m]));
  editPages(client, threadId, (data) => {
    const known = new Set(data.pages.flatMap((p) => p.messages.map((m) => m.id)));
    const added = page.messages.filter((m) => !known.has(m.id));
    return {
      ...data,
      pages: data.pages.map((p, i) => {
        const messages = p.messages.map((m) => fresh.get(m.id) ?? m);
        return i === 0 ? { ...p, messages: [...added, ...messages] } : { ...p, messages };
      }),
    };
  });
}

const editPeople = (client: QueryClient, edit: (person: TalkPerson) => TalkPerson) =>
  client.setQueryData<TalkPerson[]>(keys.talkPeople(), (people) => people?.map(edit));

/**
 * A note went by in a thread: its sender's unread count goes up, unless you are looking at it.
 * A thread the list does not know yet is refetched.
 */
export function noteWentBy(
  client: QueryClient,
  event: { threadId: string; fromMemberId: string; createdAt: string | undefined },
  looking: boolean,
) {
  const people = client.getQueryData<TalkPerson[]>(keys.talkPeople());
  if (!people?.some((p) => p.threadId === event.threadId)) {
    return void client.invalidateQueries({ queryKey: keys.talkPeople() }, { cancelRefetch: false });
  }
  editPeople(client, (p) =>
    p.threadId !== event.threadId
      ? p
      : {
          ...p,
          unread: p.memberId === event.fromMemberId && !looking ? p.unread + 1 : p.unread,
          lastMessageAt: event.createdAt ?? p.lastMessageAt,
        },
  );
}

/** You read the thread: nothing in it is unread any more. */
export const threadRead = (client: QueryClient, threadId: string) =>
  editPeople(client, (p) => (p.threadId === threadId && p.unread ? { ...p, unread: 0 } : p));

/**
 * Keeps only the thread's newest page once its window closes, so opening it again draws one page
 * of notes; older ones load again ahead of the scroll.
 */
export const keepNewestPage = (client: QueryClient, threadId: string) =>
  client.setQueryData<Pages>(keys.talkMessages(threadId), (data) =>
    data && data.pages.length > 1
      ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
      : data,
  );
