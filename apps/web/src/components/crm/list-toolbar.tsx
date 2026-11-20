import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { CrmSort } from "@/lib/crm.ts";
import { FilterBar, type FilterKind, type FilterValues } from "./list-filters.tsx";
import { SortControl, sortOf, sortParams, type SortState } from "./list-sort.tsx";

/** A list's view as the URL holds it: its sort and its filters. */
export type ListSearch = FilterValues & { sort?: CrmSort; dir?: "asc" | "desc" };

/** Writes `patch` into the URL's search, in place, so the view can be linked and reloaded. */
export function useSetListSearch() {
  const navigate = useNavigate();
  return useCallback(
    (patch: Record<string, unknown>) =>
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
        replace: true,
      }),
    [navigate],
  );
}

/**
 * The filter chips under a list's header (Attio's view bar). A table sorts from its column
 * headers, so only a view without them (the deals' board) passes `sorts` for a sort control.
 */
export function ListToolbar(props: {
  search: ListSearch;
  sorts?: CrmSort[];
  filters: FilterKind[];
}) {
  const set = useSetListSearch();
  const sort = sortOf(props.search);
  return (
    <div
      role="toolbar"
      aria-label="View"
      className="flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto px-5"
    >
      {props.sorts && (
        <SortControl
          fields={props.sorts}
          value={props.sorts.includes(sort.sort) ? sort : { sort: "name", dir: "asc" }}
          onChange={(next: SortState) => set(sortParams(next))}
        />
      )}
      <FilterBar kinds={props.filters} values={props.search} onChange={set} />
    </div>
  );
}
