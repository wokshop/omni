import { useNavigate } from "@tanstack/react-router";
import { createContext, use, useEffect, useMemo, useRef, useState } from "react";
import { Skeleton, SkeletonBox } from "skullet/react";
import { EmptyState } from "@/components/empty/empty-state";
import { IconPlus } from "@/components/icons/central";
import { ListFailed } from "@/components/inbox/thread-list";
import { StorageFrame } from "@/components/storage/storage-frame";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { ResizeGrip, useStoredWidth } from "@/components/ui/resize-grip";
import { Link } from "@/components/ui/link";
import { SearchField, SearchInput } from "@/components/ui/search-field";
import { ItemLabel } from "@/components/ui/dropdown";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCrmTaskCounts, useCrmTasks, useUpdateTask } from "@/hooks/use-crm-tasks.ts";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { useWorkspacePaths } from "@/hooks/use-workspaces.ts";
import type { CrmRecordKind } from "@/lib/crm.ts";
import {
  DUE_GROUPS,
  dueGroup,
  dueLabel,
  recordFilter,
  taskRecord,
  type CrmTask,
  type TaskFilter,
} from "@/lib/crm-tasks.ts";
import { crmErrorToast } from "./crm-errors.ts";
import { useListSearch } from "./record-list.tsx";
import { RecordMark } from "./record-list.tsx";
import { MemberAvatar } from "./member-avatar.tsx";
import { NewTaskDialog, useMemberNames } from "./task-dialog.tsx";
import { TaskPanel, useOpenTask } from "./task-panel.tsx";

export type TasksView = "mine" | "all" | "done";

const VIEWS: { id: TasksView; label: string }[] = [
  { id: "mine", label: "My tasks" },
  { id: "all", label: "All" },
  { id: "done", label: "Done" },
];

/** Every task in the workspace: mine, everyone's (by assignee and due), or done. */
export function TasksPage(props: {
  view: TasksView;
  assignee?: string;
  q: string;
  /** The task open in the panel beside the list. */
  task?: string;
}) {
  const phone = useIsMobile();
  const open = useOpenTask();
  const panel = useStoredWidth("omni:task-panel-width", PANEL_WIDTH, PANEL_MIN, PANEL_MAX);
  const rowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const { close } = open;
  useEffect(() => {
    if (!props.task) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || isControl(event.target)) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.task, close]);
  const opened = useMemo(
    () => ({ id: props.task ?? null, href: open.href }),
    [props.task, open.href],
  );
  const search = useListSearch(props.q);
  const [adding, setAdding] = useState(false);
  const filter: TaskFilter = {
    status: props.view === "done" ? "done" : "open",
    assignee: props.view === "mine" ? "me" : props.assignee,
    q: props.q,
  };
  const views = (
    <>
      <ViewTabs view={props.view} />
      {props.view !== "mine" && <AssigneeFilter value={props.assignee} />}
    </>
  );
  const stacked = phone || !!props.task;
  const list = (
    <StorageFrame
      title={
        <div className="flex min-w-0 items-center gap-3">
          <Heading className="truncate text-md">Tasks</Heading>
          {!stacked && views}
        </div>
      }
      actions={
        <>
          <SearchField
            aria-label="Search tasks"
            value={search.text}
            onChange={search.setText}
            className="w-40 sm:w-56"
          >
            <SearchInput size="sm" />
          </SearchField>
          <Button
            size={phone ? "sq-sm" : "sm"}
            aria-label={phone ? "New task" : undefined}
            onPress={() => setAdding(true)}
          >
            <IconPlus />
            {!phone && "New task"}
          </Button>
        </>
      }
    >
      {stacked && <div className="flex shrink-0 items-center gap-2 px-5 pb-2">{views}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <TaskList filter={filter} grouped={props.view !== "done"} showRecord searched={!!props.q} />
      </div>
      {adding && <NewTaskDialog onClose={() => setAdding(false)} />}
    </StorageFrame>
  );
  if (!props.task) return <OpenTaskContext value={opened}>{list}</OpenTaskContext>;
  return (
    <OpenTaskContext value={opened}>
      <div
        ref={rowRef}
        className={`flex h-svh min-h-0 min-w-0 flex-1 ${resizing ? "cursor-ew-resize select-none" : ""}`}
      >
        <div ref={listRef} className={`flex min-w-80 flex-1 flex-col ${phone ? "hidden" : ""}`}>
          {list}
        </div>
        <div
          style={phone ? undefined : { width: panel.width }}
          className={`relative flex min-w-0 ${phone ? "flex-1" : "shrink"}`}
        >
          {!phone && (
            <ResizeGrip
              label="Resize tasks"
              width={() => listRef.current?.offsetWidth ?? 0}
              onResize={(width) =>
                panel.set((rowRef.current?.offsetWidth ?? 0) - Math.max(LIST_MIN, width))
              }
              onReset={panel.reset}
              onResizingChange={setResizing}
            />
          )}
          <TaskPanel key={props.task} id={props.task} onClose={open.close} />
        </div>
      </div>
    </OpenTaskContext>
  );
}

const PANEL_WIDTH = 480;
const PANEL_MIN = 360;
const PANEL_MAX = 4096;
const LIST_MIN = 320;

const isControl = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest("input, textarea, select, [contenteditable], [role=listbox], [role=dialog]");

const OpenTaskContext = createContext<{
  id: string | null;
  href: (id: string) => string;
} | null>(null);

function ViewTabs({ view }: { view: TasksView }) {
  const navigate = useNavigate();
  const counts = useCrmTaskCounts().data;
  const count = (id: TasksView) =>
    id === "mine" ? counts?.mine : id === "all" ? counts?.open : undefined;
  return (
    <ToggleGroup
      size="xs"
      aria-label="Tasks"
      selectedKeys={[view]}
      disallowEmptySelection
      onSelectionChange={(keys) => {
        const next = [...keys][0] as TasksView | undefined;
        if (!next) return;
        void navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            view: next === "mine" ? undefined : next,
          }),
          replace: true,
        });
      }}
    >
      {VIEWS.map(({ id, label }) => (
        <ToggleGroupItem key={id} id={id} className="whitespace-nowrap">
          {label}
          {count(id) ? (
            <span className="text-muted-foreground tabular-nums">{count(id)}</span>
          ) : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const ANYONE = "anyone";

function AssigneeFilter({ value }: { value: string | undefined }) {
  const navigate = useNavigate();
  const members = useMemberNames();
  const people = [
    { id: ANYONE, name: "Anyone", image: null },
    ...members,
    { id: "none", name: "Unassigned", image: null },
  ];
  const chosen = members.find((member) => member.id === value);
  return (
    <Select
      aria-label="Assignee"
      value={value ?? ANYONE}
      onChange={(id) =>
        void navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            assignee: !id || id === ANYONE ? undefined : String(id),
          }),
          replace: true,
        })
      }
      className="w-44"
    >
      <SelectTrigger
        className="h-7"
        leading={chosen && <MemberAvatar name={chosen.name} image={chosen.image} />}
      />
      <SelectContent items={people}>
        {(person) => (
          <SelectItem id={person.id} textValue={person.name}>
            {members.includes(person) && <MemberAvatar name={person.name} image={person.image} />}
            <ItemLabel>{person.name}</ItemLabel>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

/** A record's own tasks, open first then done, with a way to add one. */
export function RecordTasks(props: { kind: CrmRecordKind; id: string }) {
  const [adding, setAdding] = useState(false);
  const filter = recordFilter(props.kind, props.id);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onPress={() => setAdding(true)}>
          <IconPlus />
          New task
        </Button>
      </div>
      <TaskList filter={{ ...filter, status: "open" }} grouped={false} showRecord={false} />
      <DoneTasks filter={filter} />
      {adding && (
        <NewTaskDialog
          record={{ kind: props.kind, id: props.id }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function DoneTasks({ filter }: { filter: TaskFilter }) {
  const list = useCrmTasks({ ...filter, status: "done" });
  if (!list.tasks.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="flex h-12 items-end px-2 pb-2 text-sm text-muted-foreground">Done</h3>
      <TaskRows tasks={list.tasks} showRecord={false} />
    </section>
  );
}

function TaskList(props: {
  filter: TaskFilter;
  grouped: boolean;
  showRecord: boolean;
  searched?: boolean;
}) {
  const list = useCrmTasks(props.filter);
  if (list.isPending) {
    return (
      <Skeleton loading label="Loading tasks" skeleton={<TaskBones />}>
        {null}
      </Skeleton>
    );
  }
  if (list.isError) return <ListFailed retry={() => void list.refetch()} />;
  if (!list.tasks.length) {
    if (!props.grouped && !props.showRecord) return null;
    return props.searched ? (
      <EmptyState figure="loupe" title="Nothing matches" />
    ) : (
      <EmptyState
        figure="cabinet"
        title={props.filter.status === "done" ? "No done tasks" : "No tasks"}
      />
    );
  }
  const more = list.hasNextPage && (
    <Button
      size="sm"
      intent="plain"
      className="self-start"
      isPending={list.isFetchingNextPage}
      onPress={() => void list.fetchNextPage()}
    >
      Show more
    </Button>
  );
  if (!props.grouped) {
    return (
      <div className="flex flex-col gap-1">
        <TaskRows tasks={list.tasks} showRecord={props.showRecord} />
        {more}
      </div>
    );
  }
  const now = new Date();
  return (
    <div className="flex flex-col">
      {DUE_GROUPS.filter(({ id }) => list.tasks.some((task) => dueGroup(task, now) === id)).map(
        ({ id, label }, index) => {
          const tasks = list.tasks.filter((task) => dueGroup(task, now) === id);
          return (
            <section key={id} aria-label={label} className="flex flex-col">
              <h3
                className={`flex items-end gap-1.5 px-2 pb-2 text-sm text-muted-foreground ${index ? "h-12" : "h-9"}`}
              >
                {label}
                <span className="text-subtle-foreground tabular-nums">{tasks.length}</span>
              </h3>
              <TaskRows tasks={tasks} showRecord={props.showRecord} />
            </section>
          );
        },
      )}
      {more}
    </div>
  );
}

function TaskRows(props: { tasks: CrmTask[]; showRecord: boolean }) {
  return (
    <ul className="flex flex-col">
      {props.tasks.map((task) => (
        <TaskRow key={task.id} task={task} showRecord={props.showRecord} />
      ))}
    </ul>
  );
}

/** One task: its check, title, record, due day and assignee. */
export function TaskRow(props: { task: CrmTask; showRecord: boolean }) {
  const { task } = props;
  const { href: inWorkspace } = useWorkspacePaths();
  const opened = use(OpenTaskContext);
  const update = useUpdateTask();
  const names = useMemberNames();
  const assignee = names.find((member) => member.id === task.assigneeMemberId);
  const record = props.showRecord ? taskRecord(task) : null;
  const done = !!task.completedAt;
  const overdue = !done && !!task.dueAt && new Date(task.dueAt) < new Date();
  const toggle = (next: boolean) =>
    update.mutate(
      { id: task.id, done: next },
      { onError: (error) => crmErrorToast(error, "The task was not changed") },
    );
  return (
    <li
      className={`group flex h-12 min-w-0 items-center gap-3 rounded-lg px-2 transition-colors duration-150 ease-out ${opened?.id === task.id ? "bg-accent" : "hover:bg-hover"}`}
    >
      <CheckboxField
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        isSelected={done}
        onChange={toggle}
      >
        <Checkbox />
      </CheckboxField>
      <Link
        href={
          opened ? opened.href(task.id) : inWorkspace(`/crm/tasks/${encodeURIComponent(task.id)}`)
        }
        className={`min-w-0 flex-1 truncate text-sm ${done ? "text-muted-foreground" : "text-foreground"}`}
      >
        {task.title}
      </Link>
      {record && (
        <Link
          href={inWorkspace(`/crm/${record.kind}/${encodeURIComponent(record.id)}`)}
          className="flex max-w-48 min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-foreground max-sm:hidden"
        >
          <RecordMark
            name={record.name}
            square={record.kind === "companies"}
            who={"domain" in record && record.domain ? { domain: record.domain } : null}
            size={16}
          />
          <span className="truncate">{record.name}</span>
        </Link>
      )}
      <span
        className={`w-20 shrink-0 text-end text-xs tabular-nums ${overdue ? "text-danger" : "text-muted-foreground"}`}
      >
        {dueLabel(done ? task.completedAt : task.dueAt)}
      </span>
      <span className="flex w-5 shrink-0 justify-center" title={assignee?.name}>
        {assignee && <MemberAvatar name={assignee.name} image={assignee.image} size={20} />}
      </span>
    </li>
  );
}

function TaskBones() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-3 px-2">
          <SkeletonBox width={16} height={16} radius="4px" />
          <span className="min-w-0 flex-1">
            <SkeletonBox width={`${30 + ((i * 17) % 40)}%`} height={10} />
          </span>
          <SkeletonBox width={48} height={10} />
          <SkeletonBox width={20} height={20} radius="999px" />
        </div>
      ))}
    </div>
  );
}
