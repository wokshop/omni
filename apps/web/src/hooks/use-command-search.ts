// What the ⌘K menu finds by name: Drive's files and folders, the CRM's companies, people and
// deals, and mail. Two sources, so the first results never wait on the network:
//
// - local: everything already in the query cache (every folder listing, CRM list and mail list
//   the member opened, plus what the menu warms when it opens), matched as each key is typed;
// - server: Drive's and the CRM's name searches, asked once typing pauses for a beat, their hits
//   merged in under the local ones as they arrive (the last answer stays up while the next loads).
//
// Mail has no per-keystroke server search: its search judges relevance with a model and is rate
// limited, so it stays the menu's "Smart search" row.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { crmCompaniesQuery, crmDealsQuery, crmFindQuery, crmPeopleQuery } from "../lib/crm.ts";
import type { CrmCompany, CrmDeal, CrmPerson } from "../lib/crm.ts";
import { threadsQuery } from "../lib/mail-queries.ts";
import { keys } from "../lib/query-keys.ts";
import { storageListQuery, type StorageNode } from "../lib/storage.ts";
import { storageSearchQuery } from "../lib/storage-find.ts";
import { senderLabel } from "../lib/threads.ts";
import type { ThreadSummary } from "../lib/types.ts";
import { useDebouncedValue } from "./use-debounced-value.ts";

/** Most hits of one kind the menu lists; the rest are a narrower query away. */
const LIMIT = 8;
/** How long typing pauses before the server is asked: short, as the local hits already show. */
const SERVER_DELAY_MS = 120;

export interface CommandHits {
  files: StorageNode[];
  companies: CrmCompany[];
  people: CrmPerson[];
  deals: CrmDeal[];
  threads: ThreadSummary[];
  /** True while a server search for the current text is still on its way. */
  searching: boolean;
}

/** Every array named `field` in the cached answers under `prefix`, infinite lists included. */
function cached<T>(client: QueryClient, prefix: readonly unknown[], field: string): T[] {
  const out: T[] = [];
  for (const [, data] of client.getQueriesData<unknown>({ queryKey: prefix })) {
    const pages =
      data && typeof data === "object" && "pages" in data && Array.isArray(data.pages)
        ? data.pages
        : [data];
    for (const page of pages) {
      const list =
        page && typeof page === "object" ? (page as Record<string, unknown>)[field] : null;
      if (Array.isArray(list)) out.push(...(list as T[]));
    }
  }
  return out;
}

/** The first `LIMIT` of `items` whose text holds `needle`, one per id, in order. */
function pick<T extends { id: string }>(
  items: Iterable<T>,
  needle: string,
  text: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (out.length >= LIMIT) break;
    if (seen.has(item.id) || !text(item).toLowerCase().includes(needle)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

const personText = (p: CrmPerson) => [p.name, ...p.addresses.map((a) => a.address)].join(" ");
const threadText = (t: ThreadSummary) => `${t.subject} ${senderLabel(t)}`;

/**
 * Fills the cache the local search reads, once per menu opening: Drive's roots, the CRM's first
 * pages and the inbox, so a module never opened this session still answers at once. Each is a
 * no-op while its data is fresh.
 */
export function useWarmCommandSearch(company: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    void client.prefetchInfiniteQuery(storageListQuery({ space: "personal" }));
    void client.prefetchInfiniteQuery(threadsQuery({ view: "inbox" }));
    if (!company) return;
    void client.prefetchInfiniteQuery(storageListQuery({ space: "shared" }));
    void client.prefetchInfiniteQuery(crmCompaniesQuery(""));
    void client.prefetchInfiniteQuery(crmPeopleQuery(""));
    void client.prefetchInfiniteQuery(crmDealsQuery(""));
  }, [client, company]);
}

/** Records named like `text`: local ones at once, the server's merged in as they arrive. */
export function useCommandSearch(text: string, company: boolean): CommandHits {
  const client = useQueryClient();
  const needle = text.trim().toLowerCase();
  const settled = useDebouncedValue(needle, SERVER_DELAY_MS);
  const files = useQuery({ ...storageSearchQuery(settled), placeholderData: (prev) => prev });
  const crm = useQuery({
    ...crmFindQuery(settled),
    enabled: company && settled.length > 0,
    placeholderData: (prev) => prev,
  });

  return useMemo(() => {
    const none = { files: [], companies: [], people: [], deals: [], threads: [] };
    if (!needle) return { ...none, searching: false };
    const storage = keys.storage();
    const crmKey = keys.crm();
    const found = crm.data;
    return {
      // The server's own answers come after the cache's, so what showed first stays put.
      files: pick(
        [
          ...cached<StorageNode>(client, [...storage, "list"], "nodes"),
          ...cached<StorageNode>(client, keys.storageSharedWithMe(), "nodes"),
          ...(files.data?.nodes ?? []),
        ],
        needle,
        (n) => n.name,
      ),
      companies: company
        ? pick(
            [
              ...cached<CrmCompany>(client, [...crmKey, "companies"], "companies"),
              ...(found?.companies ?? []),
            ],
            needle,
            (c) => c.name,
          )
        : [],
      people: company
        ? pick(
            [
              ...cached<CrmPerson>(client, [...crmKey, "people"], "people"),
              ...(found?.people ?? []),
            ],
            needle,
            personText,
          )
        : [],
      deals: company
        ? pick(
            [...cached<CrmDeal>(client, keys.crmDealLists(), "deals"), ...(found?.deals ?? [])],
            needle,
            (d) => d.name,
          )
        : [],
      threads: pick(
        cached<ThreadSummary>(client, keys.threadLists(), "threads"),
        needle,
        threadText,
      ),
      searching: settled !== needle || files.isFetching || crm.isFetching,
    };
  }, [client, needle, settled, company, files.data, files.isFetching, crm.data, crm.isFetching]);
}
