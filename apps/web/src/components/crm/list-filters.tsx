import { useState, type ReactNode } from "react";
import {
  IconArchive,
  IconBoard,
  IconBuildings,
  IconCalendar,
  IconFilter,
  IconMoney,
  IconUserRound,
  IconX,
} from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import {
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSubMenu,
  MenuTrigger,
} from "@/components/ui/menu";
import { useCrmStages, useOwners } from "@/hooks/use-crm.ts";
import { formatMoney } from "@/lib/crm.ts";
import { CloseDateDialog, ValueRangeDialog } from "./list-range-dialogs.tsx";
import { MemberAvatar, NoMemberAvatar } from "./member-avatar.tsx";
import { DAY } from "./record-list.tsx";

/** The filters a list offers, in the order its menu shows them. */
export type FilterKind =
  | "owner"
  | "assignee"
  | "company"
  | "stage"
  | "close"
  | "value"
  | "archived";

/** A list's filters as the URL holds them. */
export interface FilterValues {
  owner?: string;
  assignee?: string;
  company?: "with" | "without";
  stage?: string;
  closeAfter?: string;
  closeBefore?: string;
  minValue?: number;
  maxValue?: number;
  archived?: "only";
}

type Patch = Partial<Record<keyof FilterValues, unknown>>;

const CLEARS: Record<FilterKind, Patch> = {
  owner: { owner: undefined },
  assignee: { assignee: undefined },
  company: { company: undefined },
  stage: { stage: undefined },
  close: { closeAfter: undefined, closeBefore: undefined },
  value: { minValue: undefined, maxValue: undefined },
  archived: { archived: undefined },
};

const LABELS: Record<FilterKind, string> = {
  owner: "Owner",
  assignee: "Assignee",
  company: "Company",
  stage: "Stage",
  close: "Close date",
  value: "Value",
  archived: "Archived",
};

const ICONS: Record<FilterKind, ReactNode> = {
  owner: <IconUserRound data-slot="icon" />,
  assignee: <IconUserRound data-slot="icon" />,
  company: <IconBuildings data-slot="icon" />,
  stage: <IconBoard data-slot="icon" />,
  close: <IconCalendar data-slot="icon" />,
  value: <IconMoney data-slot="icon" />,
  archived: <IconArchive data-slot="icon" />,
};

const isSet = (kind: FilterKind, values: FilterValues) => {
  switch (kind) {
    case "close":
      return !!(values.closeAfter || values.closeBefore);
    case "value":
      return values.minValue !== undefined || values.maxValue !== undefined;
    default:
      return values[kind] !== undefined;
  }
};

const shortDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00`));

const range = (from: string | null, to: string | null) =>
  from && to ? `${from} – ${to}` : from ? `≥ ${from}` : `≤ ${to}`;

type FilterProps = { kinds: FilterKind[]; values: FilterValues; onChange: (patch: Patch) => void };

/**
 * Filter, in the page header: the filters in use, each removed from its own row, then the ones
 * not set yet. The button counts the filters in use, so the list needs no row of chips.
 */
export function FilterMenu(props: FilterProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const phone = useIsMobile();
  const set = props.kinds.filter((kind) => isSet(kind, props.values));
  const left = props.kinds.filter((kind) => !isSet(kind, props.values));
  return (
    <>
      <MenuTrigger>
        <Button
          intent="outline"
          size={phone && !set.length ? "sq-sm" : "sm"}
          aria-label="Filter"
          className={set.length ? "bg-primary-subtle" : undefined}
        >
          <IconFilter />
          {!phone && "Filter"}
          {set.length > 0 && (
            <span className="tabular-nums text-muted-foreground">{set.length}</span>
          )}
        </Button>
        <Menu placement="bottom end" aria-label="Filter by" className="min-w-56">
          {set.map((kind) => (
            <SetFilterEntry
              key={kind}
              kind={kind}
              values={props.values}
              onChange={props.onChange}
            />
          ))}
          {set.length > 0 && left.length > 0 && <MenuSeparator />}
          {left.map((kind) => (
            <FilterMenuEntry key={kind} kind={kind} onChange={props.onChange} onEdit={setEditing} />
          ))}
        </Menu>
      </MenuTrigger>
      <FilterDialogs {...props} editing={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function SetFilterEntry(props: {
  kind: FilterKind;
  values: FilterValues;
  onChange: (patch: Patch) => void;
}) {
  const { kind } = props;
  const text = useChipText(kind, props.values);
  return (
    <MenuItem
      id={`remove-${kind}`}
      textValue={`Remove ${LABELS[kind]} filter`}
      onAction={() => props.onChange(CLEARS[kind])}
      className="pe-2.5"
    >
      {ICONS[kind]}
      <MenuLabel className="flex min-w-0 items-center gap-1.5">
        <span className="sr-only">Remove</span>
        {kind !== "archived" && <span className="text-muted-foreground">{LABELS[kind]}</span>}
        <span className="truncate tabular-nums">{text}</span>
        <IconX aria-hidden className="ms-auto size-4 shrink-0 text-muted-foreground" />
      </MenuLabel>
    </MenuItem>
  );
}

type Editing = "close" | "value" | null;

function FilterDialogs(props: FilterProps & { editing: Editing; onClose: () => void }) {
  if (props.editing === "close") {
    return (
      <CloseDateDialog
        after={props.values.closeAfter}
        before={props.values.closeBefore}
        onSave={(closeAfter, closeBefore) => props.onChange({ closeAfter, closeBefore })}
        onClose={props.onClose}
      />
    );
  }
  if (props.editing === "value") {
    return (
      <ValueRangeDialog
        min={props.values.minValue}
        max={props.values.maxValue}
        onSave={(minValue, maxValue) => props.onChange({ minValue, maxValue })}
        onClose={props.onClose}
      />
    );
  }
  return null;
}

function FilterMenuEntry(props: {
  kind: FilterKind;
  onChange: (patch: Patch) => void;
  onEdit: (kind: "close" | "value") => void;
}) {
  const { kind } = props;
  const row = (onAction?: () => void) => (
    <MenuItem id={kind} textValue={LABELS[kind]} onAction={onAction}>
      {ICONS[kind]}
      <MenuLabel>{LABELS[kind]}</MenuLabel>
    </MenuItem>
  );
  if (kind === "close" || kind === "value") return row(() => props.onEdit(kind));
  if (kind === "archived") return row(() => props.onChange({ archived: "only" }));
  return (
    <MenuSubMenu>
      {row()}
      <ChoiceMenu kind={kind} onChange={props.onChange} />
    </MenuSubMenu>
  );
}

function useChipText(kind: FilterKind, values: FilterValues) {
  const owners = useOwners();
  const stages = useCrmStages().data ?? [];
  switch (kind) {
    case "owner":
    case "assignee": {
      const id = values[kind];
      if (id === "none") return kind === "owner" ? "No owner" : "Unassigned";
      return owners.find((o) => o.id === id)?.name ?? "–";
    }
    case "company":
      return values.company === "with" ? "Any" : "None";
    case "stage":
      return stages.find((s) => s.id === values.stage)?.name ?? "–";
    case "close":
      return range(
        values.closeAfter ? shortDay(values.closeAfter) : null,
        values.closeBefore ? shortDay(values.closeBefore) : null,
      );
    case "value":
      return range(
        values.minValue === undefined ? null : formatMoney(values.minValue * 100, null),
        values.maxValue === undefined ? null : formatMoney(values.maxValue * 100, null),
      );
    case "archived":
      return "Archived";
  }
}

function ChoiceMenu(props: { kind: FilterKind; onChange: (patch: Patch) => void }) {
  const owners = useOwners();
  const stages = useCrmStages().data ?? [];
  if (props.kind === "owner" || props.kind === "assignee") {
    const { kind } = props;
    const nobody = kind === "owner" ? "No owner" : "Unassigned";
    return (
      <Menu placement="bottom start" aria-label={LABELS[kind]}>
        {owners.map((owner) => (
          <MenuItem
            key={owner.id}
            id={owner.id}
            textValue={owner.name}
            onAction={() => props.onChange({ [kind]: owner.id })}
          >
            <MemberAvatar name={owner.name} image={owner.image} />
            <MenuLabel>{owner.name}</MenuLabel>
          </MenuItem>
        ))}
        <MenuItem id="none" textValue={nobody} onAction={() => props.onChange({ [kind]: "none" })}>
          <NoMemberAvatar />
          <MenuLabel>{nobody}</MenuLabel>
        </MenuItem>
      </Menu>
    );
  }
  if (props.kind === "company") {
    return (
      <Menu placement="bottom start" aria-label="Company">
        <MenuItem id="with" textValue="Any" onAction={() => props.onChange({ company: "with" })}>
          <IconBuildings data-slot="icon" />
          <MenuLabel>Any</MenuLabel>
        </MenuItem>
        <MenuItem
          id="without"
          textValue="None"
          onAction={() => props.onChange({ company: "without" })}
        >
          <IconX data-slot="icon" />
          <MenuLabel>None</MenuLabel>
        </MenuItem>
      </Menu>
    );
  }
  return (
    <Menu placement="bottom start" aria-label="Stage">
      {stages.map((stage) => (
        <MenuItem
          key={stage.id}
          id={stage.id}
          textValue={stage.name}
          onAction={() => props.onChange({ stage: stage.id })}
        >
          <IconBoard data-slot="icon" />
          <MenuLabel>{stage.name}</MenuLabel>
        </MenuItem>
      ))}
    </Menu>
  );
}
