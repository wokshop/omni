import type { Api } from "@omni/client";
import type { InferResponseType } from "hono/client";
import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { api, ApiError, call } from "./api.ts";
import { withWorkspace, workspaceHeaders } from "./current-workspace.ts";
import { keys } from "./query-keys.ts";

type Talk = Api["talk"];
export type TalkPerson = InferResponseType<Talk["people"]["$get"], 200>["people"][number];
export type TalkMessagesResponse = InferResponseType<
  Talk["threads"][":id"]["messages"]["$get"],
  200
>;
export type TalkMessage = TalkMessagesResponse["messages"][number];

/** At most this many teammates show in the stack; the rest are `+n`. */
export const STACK_MAX = 3;

export const talkPeopleQuery = () =>
  queryOptions({
    queryKey: keys.talkPeople(),
    queryFn: async ({ signal }) =>
      (await call(api.talk.people.$get({}, { init: { signal } }))).people,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });

export const talkMessagesQuery = (threadId: string) =>
  infiniteQueryOptions({
    queryKey: keys.talkMessages(threadId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      call(
        api.talk.threads[":id"].messages.$get(
          { param: { id: threadId }, query: pageParam ? { before: pageParam } : {} },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page: TalkMessagesResponse) =>
      page.more ? page.messages.at(-1)?.id : undefined,
  });

/**
 * Who the stack shows: online teammates, unread ones first, then by name; the shown ones and
 * how many more there are.
 */
export function stackOf(people: readonly TalkPerson[]) {
  const online = people
    .filter((p) => p.online)
    .toSorted(
      (a, b) => Number(b.unread > 0) - Number(a.unread > 0) || a.name.localeCompare(b.name),
    );
  return { shown: online.slice(0, STACK_MAX), more: Math.max(online.length - STACK_MAX, 0) };
}

/** Everyone, for the full list: online first, then the rest, each by name. */
export const everyoneOf = (people: readonly TalkPerson[]) =>
  people.toSorted((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export async function openThread(memberId: string) {
  return (await call(api.talk.threads.$post({ json: { memberId } }))).thread;
}

export async function sendNote(threadId: string, body: string) {
  return (
    await call(api.talk.threads[":id"].messages.$post({ param: { id: threadId }, json: { body } }))
  ).message;
}

/** Sends a file as the request's body: the Worker puts it in your Drive and shares it. */
export async function sendFile(threadId: string, file: File) {
  const url = api.talk.threads[":id"].files.$url({
    param: { id: threadId },
    query: { name: file.name },
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { ...workspaceHeaders(), "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new ApiError(response.status, `sending ${file.name} failed`);
  return ((await response.json()) as { message: TalkMessage }).message;
}

export async function markRead(threadId: string) {
  await call(api.talk.threads[":id"].read.$put({ param: { id: threadId } }));
}

export async function react(messageId: string, emoji: string, on: boolean) {
  const route = api.talk.messages[":id"].reactions[":emoji"];
  const args = { param: { id: messageId, emoji } };
  await call(on ? route.$put(args) : route.$delete(args));
}

/** Where a note's file opens: Storage's own doors decide, after Talk checks the note is yours. */
export const fileUrl = (messageId: string) =>
  withWorkspace(api.talk.messages[":id"].file.$url({ param: { id: messageId } }).toString());

export const isImage = (mimeType: string | null) => Boolean(mimeType?.startsWith("image/"));

/** Puts a note the server just answered at the top of its thread's first page. */
export function addMessage(client: QueryClient, message: TalkMessage) {
  client.setQueryData<InfiniteData<TalkMessagesResponse>>(
    keys.talkMessages(message.threadId),
    (data) => {
      if (!data) return data;
      const [first, ...rest] = data.pages;
      if (!first || first.messages.some((m) => m.id === message.id)) return data;
      return { ...data, pages: [{ ...first, messages: [message, ...first.messages] }, ...rest] };
    },
  );
}

/** A teammate came online or left: their dot follows, with no refetch. */
export function setOnline(client: QueryClient, memberId: string, online: boolean) {
  client.setQueryData<TalkPerson[]>(keys.talkPeople(), (people) =>
    people?.map((p) => (p.memberId === memberId ? { ...p, online } : p)),
  );
}
