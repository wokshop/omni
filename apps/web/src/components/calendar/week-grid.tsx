import { cn } from "cn";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { CanvasButton } from "@/components/ui/canvas-button";
import type { CalendarEvent, CalendarItem } from "@/lib/calendar.ts";
import { calendarTone } from "@/lib/calendar.ts";
import {
  allDayOn,
  dayKey,
  eventKey,
  HOUR_PX,
  minutesInto,
  placeDay,
  sameDay,
  SLOT_MINUTES,
  slotAt,
  type Slot,
} from "@/lib/calendar-grid.ts";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const hourLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });

export type Selection = { kind: "slot"; slot: Slot } | { kind: "event"; key: string } | null;

export interface WeekGridProps {
  days: Date[];
  events: readonly CalendarEvent[];
  calendars: readonly CalendarItem[];
  selection: Selection;
  now: Date;
  onSelect: (selection: Selection) => void;
  onOpen: (event: CalendarEvent) => void;
  onCreate: (slot: Slot) => void;
  onMove: (event: CalendarEvent, minutes: number) => void;
}

/** Whether the member may move it: an event made in Omni that their inbox organizes. */
export const ownEvent = (event: CalendarEvent) => event.source === "omni" && event.organizing;

const snap = (minutes: number) => Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;

/** The week or the day: an all-day strip, then the hours with each day's events in place. */
export function WeekGrid(props: WeekGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hour = Math.max(0, props.now.getHours() - 2);
    scroller.current?.scrollTo({ top: hour * HOUR_PX });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const columns = { gridTemplateColumns: `3.5rem repeat(${props.days.length}, minmax(0, 1fr))` };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid border-b" style={columns}>
        <div />
        {props.days.map((day) => (
          <DayHeading key={day.getTime()} day={day} today={sameDay(day, props.now)} />
        ))}
      </div>
      <div className="grid border-b" style={columns}>
        <div />
        {props.days.map((day) => (
          <div key={day.getTime()} className="flex min-h-7 flex-col gap-0.5 border-l p-0.5">
            {allDayOn(day, props.events).map((event) => (
              <EventChip key={eventKey(event)} event={event} {...props} />
            ))}
          </div>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative grid" style={{ ...columns, height: 24 * HOUR_PX }}>
          <div className="relative">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                className="absolute end-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                style={{ top: hour * HOUR_PX }}
              >
                {hourLabel.format(new Date(2026, 0, 1, hour))}
              </span>
            ))}
          </div>
          {props.days.map((day) => (
            <DayColumn key={day.getTime()} day={day} {...props} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayHeading({ day, today }: { day: Date; today: boolean }) {
  return (
    <div className="flex items-baseline justify-center gap-1.5 border-l py-2 text-sm">
      <span className="text-muted-foreground">{weekday.format(day)}</span>
      <span
        className={cn(
          "grid min-w-6 place-items-center rounded-full px-1 tabular-nums",
          today && "bg-primary text-primary-foreground",
        )}
      >
        {day.getDate()}
      </span>
    </div>
  );
}

function DayColumn(props: WeekGridProps & { day: Date }) {
  const [sweep, setSweep] = useState<{ from: number; to: number } | null>(null);
  const minutesAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return ((event.clientY - box.top) / HOUR_PX) * 60;
  };
  const chosen =
    props.selection?.kind === "slot" && sameDay(props.selection.slot.start, props.day)
      ? props.selection.slot
      : null;
  return (
    <div
      role="presentation"
      data-day={dayKey(props.day)}
      className="relative border-l"
      onPointerDown={(event) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const at = snap(minutesAt(event) - SLOT_MINUTES / 2);
        setSweep({ from: at, to: at + 30 });
      }}
      onPointerMove={(event) => {
        if (!sweep) return;
        setSweep({ ...sweep, to: Math.max(sweep.from + SLOT_MINUTES, snap(minutesAt(event))) });
      }}
      onPointerUp={() => {
        if (!sweep) return;
        props.onSelect({
          kind: "slot",
          slot: slotAt(props.day, sweep.from, sweep.to - sweep.from),
        });
        setSweep(null);
      }}
      onDoubleClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        props.onCreate(slotAt(props.day, snap(((event.clientY - box.top) / HOUR_PX) * 60 - 15)));
      }}
    >
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="pointer-events-none absolute inset-x-0 border-t"
          style={{ top: hour * HOUR_PX }}
        />
      ))}
      {(sweep || chosen) && (
        <div
          className="pointer-events-none absolute inset-x-1 rounded-sm bg-primary-subtle"
          style={
            sweep
              ? {
                  top: (sweep.from / 60) * HOUR_PX,
                  height: ((sweep.to - sweep.from) / 60) * HOUR_PX,
                }
              : chosen
                ? {
                    top: (minutesInto(props.day, chosen.start) / 60) * HOUR_PX,
                    height: ((chosen.end.getTime() - chosen.start.getTime()) / 3_600_000) * HOUR_PX,
                  }
                : undefined
          }
        />
      )}
      {placeDay(props.day, props.events).map((placed) => (
        <EventBlock key={eventKey(placed.event)} placed={placed} {...props} />
      ))}
      {sameDay(props.day, props.now) && (
        <div
          className="pointer-events-none absolute inset-x-0 border-t-2 border-primary"
          style={{ top: (minutesInto(props.day, props.now) / 60) * HOUR_PX }}
        />
      )}
    </div>
  );
}

function toneStyle(props: WeekGridProps, event: CalendarEvent) {
  const tone = calendarTone(props.calendars, event.calendarId);
  return {
    "--tone": tone,
    backgroundColor: `color-mix(in oklab, ${tone} 18%, var(--color-background))`,
    borderColor: tone,
  } as CSSProperties;
}

const answerLook = (event: CalendarEvent) =>
  cn(
    event.myResponse === "declined" && "opacity-45 line-through",
    event.myResponse === "needs_action" && "bg-background!",
    event.myResponse === "tentative" && "border-dashed",
  );

function EventBlock(props: WeekGridProps & { placed: ReturnType<typeof placeDay>[number] }) {
  const { event, from, to, column, columns } = props.placed;
  const [drag, setDrag] = useState<{ y: number; moved: number } | null>(null);
  const selected = props.selection?.kind === "event" && props.selection.key === eventKey(event);
  const movable = ownEvent(event);
  return (
    <CanvasButton
      data-event={eventKey(event)}
      aria-pressed={selected}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-sm border-l-2 px-1.5 py-0.5 text-start text-xs",
        selected && "ring-2 ring-(--tone)",
        movable && "cursor-grab active:cursor-grabbing",
        answerLook(event),
      )}
      style={{
        ...toneStyle(props, event),
        top: ((from + (drag?.moved ?? 0)) / 60) * HOUR_PX,
        height: Math.max(((to - from) / 60) * HOUR_PX - 2, 18),
        left: `calc(${(column / columns) * 100}% + 2px)`,
        width: `calc(${100 / columns}% - 4px)`,
      }}
      onClick={() => props.onSelect({ kind: "event", key: eventKey(event) })}
      onDoubleClick={() => props.onOpen(event)}
      onPointerDown={(e) => {
        if (!movable || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ y: e.clientY, moved: 0 });
      }}
      onPointerMove={(e) =>
        drag && setDrag({ ...drag, moved: snap(((e.clientY - drag.y) / HOUR_PX) * 60) })
      }
      onPointerUp={() => {
        if (drag?.moved) props.onMove(event, drag.moved);
        setDrag(null);
      }}
    >
      <span className="truncate font-medium">{event.title || "(No title)"}</span>
      {to - from >= 45 && (
        <span className="truncate text-muted-foreground tabular-nums">
          {time.format(new Date(event.start))}
        </span>
      )}
    </CanvasButton>
  );
}

function EventChip(props: WeekGridProps & { event: CalendarEvent }) {
  const { event } = props;
  const selected = props.selection?.kind === "event" && props.selection.key === eventKey(event);
  return (
    <CanvasButton
      data-event={eventKey(event)}
      aria-pressed={selected}
      className={cn(
        "truncate rounded-sm border-l-2 px-1.5 py-0.5 text-start text-xs",
        selected && "ring-2 ring-(--tone)",
        answerLook(event),
      )}
      style={toneStyle(props, event)}
      onClick={() => props.onSelect({ kind: "event", key: eventKey(event) })}
      onDoubleClick={() => props.onOpen(event)}
    >
      {event.title || "(No title)"}
    </CanvasButton>
  );
}
