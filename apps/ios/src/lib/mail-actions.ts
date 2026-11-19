import type { ThreadPage, ThreadSummary } from "@omni/client";
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { api, call, isAuthError } from "./api.ts";
import { idempotencyKey } from "./ids.ts";
import type { MailPage } from "./mail.ts";
import { keys } from "./query-keys.ts";

type Threads = InfiniteData<ThreadPage>;

interface Change {
  apply: (thread: ThreadSummary) => ThreadSummary | null;
  pages?: MailPage[];
}

const INBOX_LISTS: MailPage[] = ["inbox", "needsReply", "awaitingReply"];

async function changeCachedThread(client: QueryClient, threadId: string, change: Change) {
  await client.cancelQueries({ queryKey: ["threads"] });
  const snapshot = client.getQueriesData<Threads>({ queryKey: ["threads"] });
  const lists = {
    queryKey: ["threads"],
    predicate: (query: { queryKey: readonly unknown[] }) =>
      !change.pages || (change.pages as readonly unknown[]).includes(query.queryKey[1]),
  };
  client.setQueriesData<Threads>(lists, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            threads: page.threads.flatMap((t) => {
              if (t.id !== threadId) return [t];
              const next = change.apply(t);
              return next ? [next] : [];
            }),
          })),
        }
      : data,
  );
  return snapshot;
}

function useThreadAction(
  send: (thread: ThreadSummary, key: string) => Promise<unknown>,
  change: Change,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ thread, key }: { thread: ThreadSummary; key: string }) => send(thread, key),
    retry: (count, error) => !isAuthError(error) && count < 2,
    onMutate: async ({ thread }) => {
      void Haptics.selectionAsync();
      return { snapshot: await changeCachedThread(client, thread.id, change) };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["threads"] });
      void client.invalidateQueries({ queryKey: keys.counts() });
    },
  });
}

const runner = (mutation: ReturnType<typeof useThreadAction>) => (thread: ThreadSummary) =>
  mutation.mutate({ thread, key: idempotencyKey() });

/** Done: off the list, through its latest message (a newer reply brings it back). */
export function useDone() {
  return runner(
    useThreadAction(
      (thread, key) =>
        call(
          api.threads[":id"].done.$post({
            param: { id: thread.id },
            header: { "idempotency-key": key },
            json: { through: thread.lastMessageAt },
          }),
        ),
      { apply: () => null, pages: [...INBOX_LISTS, "later"] },
    ),
  );
}

/** Later: off the Inbox, onto Later. */
export function useLater() {
  return runner(
    useThreadAction(
      (thread, key) =>
        call(
          api.threads[":id"].later.$post({
            param: { id: thread.id },
            header: { "idempotency-key": key },
          }),
        ),
      { apply: () => null, pages: INBOX_LISTS },
    ),
  );
}

/** Mark unread (or read): the row's weight follows at once. */
export function useMarkUnread() {
  return runner(
    useThreadAction(
      (thread, key) =>
        call(
          api.threads[":id"].state.$patch({
            param: { id: thread.id },
            header: { "idempotency-key": key },
            json: { read: false },
          }),
        ),
      { apply: (thread) => ({ ...thread, read: false, unread: true }) },
    ),
  );
}
