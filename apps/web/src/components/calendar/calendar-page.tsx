import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@/components/icons/central";
import { StorageFrame } from "@/components/storage/storage-frame";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCalendarEvents, useCalendars } from "@/hooks/use-calendar.ts";
import { useWorkspaceSlug } from "@/hooks/use-workspaces.ts";
import type { CalendarEvent } from "@/lib/calendar.ts";
import {
  addDays,
  daysOf,
  dayKey,
  eventKey,
  nextHalfHour,
  parseDayKey,
  type CalendarView,
  type Slot,
} from "@/lib/calendar-grid.ts";
import { EventDialog } from "./event-dialog.tsx";
import { EventPanel } from "./event-panel.tsx";
import { useCalendarKeys } from "./use-calendar-keys.ts";
import { WeekGrid, type Selection } from "./week-grid.tsx";

const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export type Editing = { event?: CalendarEvent; slot?: Slot } | null;

/** The calendar: a week or a day of every shown calendar, driven by keys or the pointer. */
export function CalendarPage(props: { date?: string; view?: CalendarView }) {
  const view = props.view ?? "week";
  const anchor = parseDayKey(props.date);
  const days = daysOf(view, anchor);
  const from = days[0] ?? anchor;
  const to = addDays(days.at(-1) ?? anchor, 1);
  const now = useNow();
  const calendars = useCalendars().data ?? [];
  const events = useCalendarEvents(from, to).data ?? [];
  const [selection, setSelection] = useState<Selection>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const navigate = useNavigate();
  const workspace = useWorkspaceSlug();
  const go = (next: { date?: Date; view?: CalendarView }) =>
    void navigate({
      to: "/$workspace/calendar",
      params: { workspace },
      search: { date: dayKey(next.date ?? anchor), view: next.view ?? view },
      replace: true,
    });
  const step = view === "week" ? 7 : 1;
  const byKey = useMemo(() => new Map(events.map((e) => [eventKey(e), e])), [events]);
  const opened = panel ? byKey.get(panel) : undefined;

  const { move } = useCalendarKeys({
    events,
    selection,
    setSelection,
    open: (event) => setPanel(eventKey(event)),
    close: () => (panel ? setPanel(null) : setSelection(null)),
    create: (slot) => setEditing({ slot: slot ?? nextHalfHour(now) }),
    go: (delta) => go({ date: addDays(anchor, delta * step) }),
    today: () => go({ date: new Date() }),
    view: (next) => go({ view: next }),
    paused: editing !== null,
  });

  return (
    <StorageFrame
      title={<Heading className="truncate text-md">{monthYear.format(from)}</Heading>}
      actions={
        <>
          <Button size="sm" intent="outline" onPress={() => go({ date: new Date() })}>
            Today
          </Button>
          <Button
            size="sq-sm"
            intent="plain"
            aria-label="Previous"
            onPress={() => go({ date: addDays(anchor, -step) })}
          >
            <IconChevronLeft />
          </Button>
          <Button
            size="sq-sm"
            intent="plain"
            aria-label="Next"
            onPress={() => go({ date: addDays(anchor, step) })}
          >
            <IconChevronRight />
          </Button>
          <ToggleGroup
            aria-label="View"
            size="sm"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[view]}
            onSelectionChange={(keys) => {
              const [next] = [...keys];
              if (next === "week" || next === "day") go({ view: next });
            }}
          >
            <ToggleGroupItem id="week">Week</ToggleGroupItem>
            <ToggleGroupItem id="day">Day</ToggleGroupItem>
          </ToggleGroup>
          <Button
            size="sm"
            onPress={() =>
              setEditing({ slot: selection?.kind === "slot" ? selection.slot : nextHalfHour(now) })
            }
          >
            <IconPlus />
            New event
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1">
        <WeekGrid
          days={days}
          events={events}
          calendars={calendars}
          selection={selection}
          now={now}
          onSelect={setSelection}
          onOpen={(event) => setPanel(eventKey(event))}
          onCreate={(slot) => setEditing({ slot })}
          onMove={(event, minutes) => move(event, minutes)}
        />
        {opened && (
          <EventPanel
            event={opened}
            calendarAddress={calendars.find((c) => c.id === opened.calendarId)?.address}
            onClose={() => setPanel(null)}
            onEdit={() => setEditing({ event: opened })}
          />
        )}
      </div>
      {editing && (
        <EventDialog
          calendars={calendars}
          event={editing.event}
          slot={editing.slot}
          onClose={() => setEditing(null)}
        />
      )}
    </StorageFrame>
  );
}
