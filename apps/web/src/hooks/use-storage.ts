// Storage (ADR 0034): a folder's contents, Trash, the changes, and uploads.
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  changeNodeMutation,
  createFolderMutation,
  deleteForeverMutation,
  restoreNodeMutation,
  storageListQuery,
  storageTrashQuery,
  trashNodeMutation,
  type StoragePlace,
} from "../lib/storage.ts";
import { addUploads, removeUpload, retryUpload, uploadsStore } from "../lib/storage-uploads.ts";
import { useWorkspaces } from "./use-workspaces.ts";

/**
 * A folder's contents (a space's root, or a folder by id), folders first. `nodes` is every loaded
 * page flattened; `folder` is the folder itself with its `path`, null at a root.
 */
export function useStorageList(place: StoragePlace, options: { enabled?: boolean } = {}) {
  const query = useInfiniteQuery({ ...storageListQuery(place), enabled: options.enabled ?? true });
  const nodes = useMemo(() => query.data?.pages.flatMap((page) => page.nodes) ?? [], [query.data]);
  return { ...query, nodes, folder: query.data?.pages[0]?.folder ?? null };
}

/** What you may restore from Trash, newest first. */
export function useStorageTrash() {
  const query = useInfiniteQuery(storageTrashQuery());
  const nodes = useMemo(() => query.data?.pages.flatMap((page) => page.nodes) ?? [], [query.data]);
  return { ...query, nodes };
}

/** True in a company workspace: only those have Shared (a Personal space has My files alone). */
export function useHasSharedFiles() {
  const workspaces = useWorkspaces().data;
  const active = workspaces?.workspaces.find((w) => w.id === workspaces.activeOrganizationId);
  return !!active && active.kind !== "personal";
}

/** `mutate({ name, place })`. */
export function useCreateFolder() {
  return useMutation(createFolderMutation(useQueryClient()));
}

/** `mutate({ id, name })` renames; `mutate({ id, place })` moves. */
export function useChangeNode() {
  return useMutation(changeNodeMutation(useQueryClient()));
}

/** `mutate(id)` moves it to Trash. */
export function useTrashNode() {
  return useMutation(trashNodeMutation(useQueryClient()));
}

/** `mutate(id)` restores it from Trash. */
export function useRestoreNode() {
  return useMutation(restoreNodeMutation(useQueryClient()));
}

/** `mutate(id)` deletes it from Trash for good. */
export function useDeleteForever() {
  return useMutation(deleteForeverMutation(useQueryClient()));
}

/**
 * The uploads in progress and what to do with them. `upload(files, place, onFailed)` queues
 * files; a failed one stays in `uploads` until `retry(id)` (it resumes) or `remove(id)`.
 */
export function useUploads() {
  const client = useQueryClient();
  const uploads = useSyncExternalStore(uploadsStore.subscribe, uploadsStore.get);
  const upload = useCallback(
    (files: File[], place: StoragePlace, onFailed: (name: string, error: unknown) => void) =>
      addUploads(client, files, place, onFailed),
    [client],
  );
  return { uploads, upload, retry: retryUpload, remove: removeUpload };
}
