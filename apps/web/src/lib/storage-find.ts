// Drive's Search: live files and folders across the member's My files and, in a company, Shared.
// Not paged; under `keys.storage()`, so every change refetches it.
import { queryOptions } from "@tanstack/react-query";
import { api, call } from "./api.ts";
import { keys } from "./query-keys.ts";

/** Files and folders whose name holds `q`, folders first. */
export const storageSearchQuery = (q: string) =>
  queryOptions({
    queryKey: keys.storageSearch(q),
    queryFn: ({ signal }) => call(api.storage.search.$get({ query: { q } }, { init: { signal } })),
    enabled: q.trim().length > 0,
  });
