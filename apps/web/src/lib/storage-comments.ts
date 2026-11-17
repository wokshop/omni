// A file's comments (ADR 0043 decisions 4 and 5), by the member's door or a shared link's: the
// list, a new thread or reply, resolving a thread, and deleting a comment the reader wrote.
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import type { Api } from "@omni/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api, call } from "./api.ts";
import { keys } from "./query-keys.ts";

type Door = Api["storage"]["files"][":id"]["comments"];
export type StorageComment = InferResponseType<Door["$get"], 200>["comments"][number];
type StorageAddCommentBody = InferRequestType<Door["$post"]>["json"];
export type StorageCommentAnchor = NonNullable<StorageComment["anchor"]>;

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

const refetch = (client: QueryClient, id: string) =>
  client.invalidateQueries({ queryKey: keys.storageComments(id) });

/** `mutate({ id, body: { body, anchor? } | { body, parentId }, shareId? })`. */
export const addCommentMutation = (client: QueryClient) =>
  mutationOptions({
    meta: { handlesError: true },
    mutationFn: ({
      id,
      shareId,
      body,
    }: {
      id: string;
      shareId?: string;
      body: StorageAddCommentBody;
    }) =>
      shareId
        ? call(sharedDoor().$post({ param: { shareId, id }, json: body }))
        : call(memberDoor().$post({ param: { id }, json: body })),
    onSuccess: (_data, { id }) => refetch(client, id),
  });

/** `mutate({ id, commentId, resolved, shareId? })` resolves a thread or opens it again. */
export const resolveCommentMutation = (client: QueryClient) =>
  mutationOptions({
    meta: { handlesError: true },
    mutationFn: ({
      id,
      commentId,
      resolved,
      shareId,
    }: {
      id: string;
      commentId: string;
      resolved: boolean;
      shareId?: string;
    }) =>
      shareId
        ? call(
            sharedDoor()[":commentId"].$patch({
              param: { shareId, id, commentId },
              json: { resolved },
            }),
          )
        : call(memberDoor()[":commentId"].$patch({ param: { id, commentId }, json: { resolved } })),
    onSuccess: (_data, { id }) => refetch(client, id),
  });

/** `mutate({ id, commentId, shareId? })` deletes a comment the reader wrote (a root with its replies). */
export const deleteCommentMutation = (client: QueryClient) =>
  mutationOptions({
    meta: { handlesError: true },
    mutationFn: ({ id, commentId, shareId }: { id: string; commentId: string; shareId?: string }) =>
      shareId
        ? call(sharedDoor()[":commentId"].$delete({ param: { shareId, id, commentId } }))
        : call(memberDoor()[":commentId"].$delete({ param: { id, commentId } })),
    onSuccess: (_data, { id }) => refetch(client, id),
  });
