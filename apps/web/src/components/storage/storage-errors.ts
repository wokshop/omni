// What a refused Storage request says in a toast. The Worker's `code` picks the sentence; anything
// else falls back to what the action was.
import { appToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api.ts";

const BY_CODE: Record<string, string> = {
  STORAGE_FULL: "Storage is full",
  BILLING_INACTIVE: "This workspace is read-only",
  FILE_TOO_LARGE: "That file is too large",
  INVALID_NAME: "That name can't be used",
  NAME_TAKEN: "That name is taken",
  FORBIDDEN: "You can't change this",
  NOT_FOUND: "That's no longer here",
  TOO_DEEP: "Folders can't nest that deep",
  CYCLE: "A folder can't move into itself",
  PARENT_TRASHED: "Its folder is in Trash",
};

/** Shows why `error` refused the action, or `fallback` ("The folder was not created"). */
export function storageErrorToast(error: unknown, fallback: string) {
  const code = error instanceof ApiError ? error.code : undefined;
  appToast.error((code && BY_CODE[code]) || fallback);
}
