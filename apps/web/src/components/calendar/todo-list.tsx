import { useState } from "react";
import { crmErrorToast } from "@/components/crm/crm-errors.ts";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/ui/link";
import { SidebarSection } from "@/components/ui/sidebar";
import { TextField } from "@/components/ui/text-field";
import { useHasCrm } from "@/hooks/use-crm.ts";
import { useCreateTask, useCrmTasks, useUpdateTask } from "@/hooks/use-crm-tasks.ts";
import { useMember } from "@/hooks/use-session.ts";
import { useWorkspacePaths } from "@/hooks/use-workspaces.ts";
import {
  DUE_GROUPS,
  dueGroup,
  dueLabel,
  taskPath,
  type CrmTask,
  type TaskFilter,
} from "@/lib/crm-tasks.ts";

/** The member's open to-dos: the workspace's tasks assigned to them. */
export const MY_TODOS = { status: "open", assignee: "me" } satisfies TaskFilter;

/** Checks a to-do off, or opens it again. */
export function useToggleTodo() {
  const update = useUpdateTask();
  return (task: CrmTask, done: boolean) =>
    update.mutate(
      { id: task.id, done },
      { onError: (error) => crmErrorToast(error, "The to-do was not changed") },
    );
}

/** The to-dos beside the calendar: a field that adds one, then each due group in turn. */
export function TodoList() {
  if (!useHasCrm()) return null;
  return <Todos />;
}

function Todos() {
  const { tasks } = useCrmTasks(MY_TODOS);
  const [draft, setDraft] = useState("");
  const create = useCreateTask();
  const { member } = useMember();
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    create.mutate(
      { title, assigneeMemberId: member.id },
      { onError: (error) => crmErrorToast(error, "The to-do was not added") },
    );
  };
  const now = new Date();
  return (
    <SidebarSection label="To-dos">
      <form
        className="px-2 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <TextField aria-label="New to-do" maxLength={500} value={draft} onChange={setDraft}>
          <Input placeholder="New to-do" autoComplete="off" />
        </TextField>
      </form>
      {DUE_GROUPS.map((group) => {
        const inGroup = tasks.filter((task) => dueGroup(task, now) === group.id);
        if (inGroup.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col">
            <span className="flex h-7 items-center gap-1.5 px-2.25 text-xs text-muted-foreground">
              {group.label}
              <span className="text-subtle-foreground tabular-nums">{inGroup.length}</span>
            </span>
            {inGroup.map((task) => (
              <TodoRow key={task.id} task={task} overdue={group.id === "overdue"} />
            ))}
          </div>
        );
      })}
    </SidebarSection>
  );
}

function TodoRow({ task, overdue }: { task: CrmTask; overdue: boolean }) {
  const toggle = useToggleTodo();
  const { href } = useWorkspacePaths();
  const done = !!task.completedAt;
  return (
    <div className="mx-0.5 flex h-8 min-w-0 items-center gap-2.5 rounded-md px-1.75 hover:bg-hover">
      <CheckboxField
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        isSelected={done}
        onChange={(next: boolean) => toggle(task, next)}
      >
        <Checkbox />
      </CheckboxField>
      <Link
        href={href(taskPath(task.id))}
        className={`min-w-0 flex-1 truncate text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
      >
        {task.title}
      </Link>
      {task.dueAt && (
        <span
          className={`shrink-0 text-xs tabular-nums ${overdue ? "text-danger" : "text-muted-foreground"}`}
        >
          {dueLabel(task.dueAt)}
        </span>
      )}
    </div>
  );
}
