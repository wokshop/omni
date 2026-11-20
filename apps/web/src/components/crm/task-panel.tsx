import { useRouter, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { Skeleton, SkeletonBox } from "skullet/react";
import { EmptyState } from "@/components/empty/empty-state";
import { IconTrash, IconX } from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { ResizeGrip, useStoredWidth } from "@/components/ui/resize-grip";
import { useCrmTask } from "@/hooks/use-crm-tasks.ts";
import { ApiError } from "@/lib/api.ts";
import type { CrmTask } from "@/lib/crm-tasks.ts";
import {
  TaskContent,
  TaskDetails,
  TaskHeading,
  useDeleteThisTask,
  useSaveTask,
} from "./task-detail.tsx";

/** The open task in the page's URL (`?task=`): its id, its link, and a way to open or close one. */
export function useOpenTask() {
  const router = useRouter();
  const { task: open } = useSearch({ strict: false }) as { task?: string };
  const at = useCallback(
    (task: string | undefined) =>
      router.buildLocation({
        to: ".",
        search: ((prev: Record<string, unknown>) => ({ ...prev, task })) as never,
      }).href,
    [router],
  );
  return useMemo(
    () => ({
      id: open ?? null,
      href: (id: string) => at(id),
      close: () => void router.history.push(at(undefined)),
    }),
    [open, at, router],
  );
}

export const TASK_PANEL_WIDTH = 480;
export const TASK_PANEL_MIN = 360;
export const TASK_PANEL_MAX = 4096;
export const TASK_PANEL_KEY = "omni:task-panel-width";

/**
 * The open task as a column on the right of a record page, the width the Tasks page keeps it.
 * `content` is the page beside it, for the grip to measure.
 */
export function RecordTaskColumn(props: {
  id: string;
  row: React.RefObject<HTMLElement | null>;
  content: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const panel = useStoredWidth(TASK_PANEL_KEY, TASK_PANEL_WIDTH, TASK_PANEL_MIN, TASK_PANEL_MAX);
  return (
    <div
      style={{ "--task-width": `${panel.width}px` } as React.CSSProperties}
      className="relative flex min-w-0 max-lg:flex-1 max-lg:*:border-s-0 lg:w-(--task-width) lg:max-w-[calc(100%-46rem)] lg:min-w-90 lg:shrink-0"
    >
      <ResizeGrip
        label="Resize task"
        className="max-lg:hidden"
        width={() => props.content.current?.offsetWidth ?? 0}
        onResize={(width) => panel.set((props.row.current?.offsetWidth ?? 0) - width)}
        onReset={panel.reset}
      />
      <TaskPanel key={props.id} id={props.id} onClose={props.onClose} />
    </div>
  );
}

const isControl = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest("input, textarea, select, [contenteditable], [role=listbox], [role=dialog]");

function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || isControl(event.target)) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** A task beside the list, as an open email sits beside its inbox: its check and title on top, then the task. */
export function TaskPanel(props: { id: string; onClose: () => void }) {
  const query = useCrmTask(props.id);
  const task = query.data?.task;
  useCloseOnEscape(props.onClose);
  return (
    <section aria-label="Task" className="flex min-w-0 flex-1 flex-col border-s bg-background">
      {task ? (
        <LoadedTask task={task} onClose={props.onClose} />
      ) : (
        <>
          <PanelHeader title={null} onClose={props.onClose} />
          {query.isPending ? (
            <Skeleton loading label="Loading task" skeleton={<PanelBones />}>
              {null}
            </Skeleton>
          ) : (
            <div className="flex flex-1 flex-col">
              {query.error instanceof ApiError && query.error.status === 404 ? (
                <EmptyState figure="loupe" title="This task is gone" />
              ) : (
                <EmptyState figure="plug" title="This task didn't load">
                  <Button size="sm" intent="outline" onPress={() => void query.refetch()}>
                    Try again
                  </Button>
                </EmptyState>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LoadedTask(props: { task: CrmTask; onClose: () => void }) {
  const { task } = props;
  const save = useSaveTask(task.id);
  const remove = useDeleteThisTask(task.id, props.onClose);
  return (
    <>
      <PanelHeader title={<TaskHeading task={task} onSave={save} />} onClose={props.onClose}>
        <Button
          intent="plain"
          size="sq-sm"
          aria-label="Delete task"
          isPending={remove.isPending}
          onPress={remove.run}
        >
          <IconTrash />
        </Button>
      </PanelHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
        <TaskContent task={task} onSave={save} />
        <div className="-mx-5 flex flex-col gap-0.5 border-t px-5 pt-4">
          <TaskDetails task={task} onSave={save} />
        </div>
      </div>
    </>
  );
}

function PanelHeader(props: {
  title: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b ps-5 pe-2.5">
      <div className="flex min-w-0 flex-1 items-center">{props.title}</div>
      {props.children}
      <Button intent="plain" size="sq-sm" aria-label="Close task" onPress={props.onClose}>
        <IconX />
      </Button>
    </div>
  );
}

function PanelBones() {
  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <SkeletonBox width="60%" height={12} />
      <SkeletonBox width="85%" height={10} />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBox width={72} height={10} />
          <SkeletonBox width={`${30 + ((i * 11) % 30)}%`} height={10} />
        </div>
      ))}
    </div>
  );
}
