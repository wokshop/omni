import { useState } from "react";
import { IconPlus } from "@/components/icons/central";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TextField } from "@/components/ui/text-field";
import type { CrmTask, TaskChange } from "@/lib/crm-tasks.ts";

type Step = NonNullable<CrmTask["subtasks"]>[number];

const STEP_MAX = 500;
const lineClass = "h-8 w-full rounded-md px-2 text-sm hover:bg-hover focus:bg-hover";

/** The task's checklist: a titled group of steps, each with its check, and a line to add one. */
export function Subtasks(props: { task: CrmTask; onSave: (change: TaskChange) => void }) {
  const steps = props.task.subtasks ?? [];
  const put = (subtasks: Step[]) => props.onSave({ subtasks });
  return (
    <section aria-label="Subtasks" className="flex flex-col gap-0.5">
      <h3 className="flex h-7 items-center px-2 text-sm text-muted-foreground">Subtasks</h3>
      {steps.map((step) => (
        <SubtaskRow
          key={step.id}
          step={step}
          onChange={(next) => put(steps.map((s) => (s.id === step.id ? next : s)))}
          onRemove={() => put(steps.filter((s) => s.id !== step.id))}
        />
      ))}
      <NewSubtask
        onAdd={(title) => put([...steps, { id: crypto.randomUUID(), title, done: false }])}
      />
    </section>
  );
}

function SubtaskRow(props: { step: Step; onChange: (step: Step) => void; onRemove: () => void }) {
  const { step } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const title = draft.trim();
    if (!title) return props.onRemove();
    if (title !== step.title) props.onChange({ ...step, title });
  };
  return (
    <div className="flex items-center gap-1">
      <div className="flex size-8 shrink-0 items-center justify-center">
        <CheckboxField
          aria-label={`Complete ${step.title}`}
          isSelected={step.done}
          onChange={(done) => props.onChange({ ...step, done })}
        >
          <Checkbox />
        </CheckboxField>
      </div>
      <TextField
        aria-label="Subtask"
        maxLength={STEP_MAX}
        value={draft ?? step.title}
        onChange={setDraft}
        className="min-w-0 flex-1"
      >
        <Input
          plain
          autoComplete="off"
          className={`${lineClass} ${step.done ? "text-muted-foreground line-through" : ""}`}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(null);
          }}
        />
      </TextField>
    </div>
  );
}

function NewSubtask(props: { onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    props.onAdd(title);
    setDraft("");
  };
  return (
    <div className="flex items-center gap-1">
      <div className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
        <IconPlus className="size-3.5" />
      </div>
      <TextField
        aria-label="New subtask"
        maxLength={STEP_MAX}
        value={draft}
        onChange={setDraft}
        className="min-w-0 flex-1"
      >
        <Input
          plain
          autoComplete="off"
          placeholder="Add subtask"
          className={`${lineClass} placeholder:text-muted-foreground`}
          onBlur={add}
          onKeyDown={(event) => event.key === "Enter" && add()}
        />
      </TextField>
    </div>
  );
}
