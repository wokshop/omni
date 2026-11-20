import { Skeleton, SkeletonBox } from "skullet/react";
import { ListFailed } from "@/components/inbox/thread-list";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Link } from "@/components/ui/link";
import { useCrmTasks, useUpdateTask } from "@/hooks/use-crm-tasks.ts";
import { useWorkspacePaths } from "@/hooks/use-workspaces.ts";
import { dueLabel, type CrmTask, type TaskFilter } from "@/lib/crm-tasks.ts";
import { crmErrorToast } from "./crm-errors.ts";
import { MemberAvatar } from "./member-avatar.tsx";
import { RailRow, railPlace, type RailPlace } from "./rail-row.tsx";
import { useMemberNames } from "./task-dialog.tsx";

type RailItem = { kind: "task"; task: CrmTask } | { kind: "done" };

/** A record's tasks on a rail by due day, like its Plan: open ones first, then the done ones. */
export function TaskRail({ filter }: { filter: TaskFilter }) {
  const open = useCrmTasks({ ...filter, status: "open" });
  const done = useCrmTasks({ ...filter, status: "done" });
  if (open.isPending || done.isPending) {
    return (
      <Skeleton loading label="Loading tasks" skeleton={<RailBones />}>
        {null}
      </Skeleton>
    );
  }
  if (open.isError) return <ListFailed retry={() => void open.refetch()} />;
  const items: RailItem[] = [
    ...open.tasks.map((task) => ({ kind: "task" as const, task })),
    ...(done.tasks.length ? [{ kind: "done" as const }] : []),
    ...done.tasks.map((task) => ({ kind: "task" as const, task })),
  ];
  if (!items.length) return null;
  const more = (list: ReturnType<typeof useCrmTasks>) =>
    list.hasNextPage && (
      <Button
        size="sm"
        intent="plain"
        className="ms-31 self-start"
        isPending={list.isFetchingNextPage}
        onPress={() => void list.fetchNextPage()}
      >
        Show more
      </Button>
    );
  return (
    <div className="flex flex-col gap-1">
      <ol aria-label="Tasks" className="flex flex-col">
        {items.map((item, i) => {
          const place = railPlace(i, items.length);
          return item.kind === "done" ? (
            <RailRow key="done" opens place={place} mark={<span className="size-1.5" />}>
              <h3 className="flex h-10 items-center px-2 text-xs text-muted-foreground">Done</h3>
            </RailRow>
          ) : (
            <TaskRailRow key={item.task.id} task={item.task} place={place} />
          );
        })}
      </ol>
      {more(open)}
      {more(done)}
    </div>
  );
}

function TaskRailRow(props: { task: CrmTask; place: RailPlace }) {
  const { task } = props;
  const { href } = useWorkspacePaths();
  const update = useUpdateTask();
  const assignee = useMemberNames().find((member) => member.id === task.assigneeMemberId);
  const done = !!task.completedAt;
  const overdue = !done && !!task.dueAt && new Date(task.dueAt) < new Date();
  const toggle = (next: boolean) =>
    update.mutate(
      { id: task.id, done: next },
      { onError: (error) => crmErrorToast(error, "The task was not changed") },
    );
  return (
    <RailRow
      place={props.place}
      date={
        <span className={overdue ? "text-danger" : "text-muted-foreground"}>
          {dueLabel(done ? task.completedAt : task.dueAt)}
        </span>
      }
      mark={
        <span className="grid size-5 place-items-center rounded-full bg-background">
          <CheckboxField
            aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
            isSelected={done}
            onChange={toggle}
          >
            <Checkbox />
          </CheckboxField>
        </span>
      }
    >
      <div className="flex h-10 min-w-0 items-center gap-3 rounded-lg px-2 transition-colors duration-150 ease-out hover:bg-hover">
        <Link
          href={href(`/crm/tasks/${encodeURIComponent(task.id)}`)}
          className={`min-w-0 flex-1 truncate text-sm ${done ? "text-muted-foreground" : "text-foreground"}`}
        >
          {task.title}
        </Link>
        <span className="flex w-5 shrink-0 justify-center" title={assignee?.name}>
          {assignee && <MemberAvatar name={assignee.name} image={assignee.image} size={20} />}
        </span>
      </div>
    </RailRow>
  );
}

function RailBones() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="grid h-10 grid-cols-[4.5rem_1.25rem_minmax(0,1fr)] max-sm:grid-cols-[3.25rem_1.25rem_minmax(0,1fr)] max-sm:gap-x-2 items-center gap-x-3"
        >
          <span className="flex justify-end">
            <SkeletonBox width={36} height={10} />
          </span>
          <span className="flex justify-center">
            <SkeletonBox width={16} height={16} radius="4px" />
          </span>
          <span className="px-2">
            <SkeletonBox width={`${30 + ((i * 17) % 40)}%`} height={10} />
          </span>
        </div>
      ))}
    </div>
  );
}
