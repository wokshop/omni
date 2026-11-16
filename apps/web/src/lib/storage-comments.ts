// A file's comments (ADR 0043 decisions 4 and 5), by the member's door or a shared link's: the
// chat, and adding, editing, resolving and deleting. Comments are not the file's content: a
// change refetches this file's comments only, never the folder lists.
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import type { Api } from "@omni/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api, call } from "./api.ts";
import { keys } from "./query-keys.ts";
import { parseReply, quoteText, type Reply } from "./reply.ts";

export type StorageComments = InferResponseType<
  Api["storage"]["files"][":id"]["comments"]["$get"],
  200
>;
export type StorageComment = StorageComments["comments"][number];
export type StorageCommentAnchor = NonNullable<StorageComment["anchor"]>;
type AddBody = InferRequestType<Api["storage"]["files"][":id"]["comments"]["$post"]>["json"];
type ChangeBody = InferRequestType<
  Api["storage"]["files"][":id"]["comments"][":commentId"]["$patch"]
>["json"];

/** A comment as the chat shows it: its words, and the message it answers, if any. */
export interface StorageChatLine {
  comment: StorageComment;
  body: string;
  reply: Reply | undefined;
}

const sharedDoor = () => api.storage.shared[":shareId"].files[":id"].comments;
const memberDoor = () => api.storage.files[":id"].comments;

export const storageCommentsQuery = (id: string, shareId?: string) =>
  queryOptions({
    queryKey: keys.storageComments(id),
    queryFn: ({ signal }) =>
      shareId
        ? call(sharedDoor().$get({ param: { shareId, id } }, { init: { signal } }))
        : call(memberDoor().$get({ param: { id } }, { init: { signal } })),
  });

/**
 * The comments as one chat, oldest first. A reply carries the passage it answers in its body (as
 * the inbox's notes do); a reply made under a thread (`parentId`) quotes that thread's first
 * message instead.
 */
export function chatOf(comments: StorageComment[]): StorageChatLine[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const sorted = comments.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sorted.map((comment) => {
    const { reply, body } = parseReply(comment.body);
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined;
    const quoted = parent && {
      from: commentAuthor(parent),
      text: quoteText(parseReply(parent.body).body),
    };
    return { comment, body, reply: reply ?? quoted };
  });
}

export const commentAuthor = (comment: StorageComment) => comment.authorName ?? "Former member";

const refetch = (client: QueryClient, id: string) =>
  client.invalidateQueries({ queryKey: keys.storageComments(id) });

/** `mutate({ id, shareId?, body })`: a new thread, or with `parentId` in `body` a reply. */
export const addCommentMutation = (client: QueryClient) =>
  mutationOptions({
    mutationFn: ({ id, shareId, body }: { id: string; shareId?: string; body: AddBody }) =>
      shareId
        ? call(sharedDoor().$post({ param: { shareId, id }, json: body }))
        : call(memberDoor().$post({ param: { id }, json: body })),
    onSuccess: (_answer, { id }) => refetch(client, id),
  });

/** `mutate({ id, commentId, shareId?, change })`: `{ body }` edits, `{ resolved }` resolves. */
export const changeCommentMutation = (client: QueryClient) =>
  mutationOptions({
    mutationFn: ({
      id,
      commentId,
      shareId,
      change,
    }: {
      id: string;
      commentId: string;
      shareId?: string;
      change: ChangeBody;
    }) =>
      shareId
        ? call(
            sharedDoor()[":commentId"].$patch({ param: { shareId, id, commentId }, json: change }),
          )
        : call(memberDoor()[":commentId"].$patch({ param: { id, commentId }, json: change })),
    onSuccess: (_answer, { id }) => refetch(client, id),
  });

/** `mutate({ id, commentId, shareId? })` deletes a comment of one's own, a root with its replies. */
export const deleteCommentMutation = (client: QueryClient) =>
  mutationOptions({
    mutationFn: async ({
      id,
      commentId,
      shareId,
    }: {
      id: string;
      commentId: string;
      shareId?: string;
    }) => {
      const response = await (shareId
        ? sharedDoor()[":commentId"].$delete({ param: { shareId, id, commentId } })
        : memberDoor()[":commentId"].$delete({ param: { id, commentId } }));
      if (!response.ok) await call(Promise.resolve(response));
    },
    onSuccess: (_answer, { id }) => refetch(client, id),
  });
