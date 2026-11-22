import type { CalendarEvent } from "./calendar.ts";

export type CalendarView = "week" | "day";

export const HOUR_PX = 48;
export const SLOT_MINUTES = 15;
const DAY_MS = 86_400_000;

/** Local midnight of `date`. */
export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** The Monday of `date`'s week, at local midnight. */
export function startOfWeek(date: Date) {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

/** The days a view shows around `anchor`: a week from Monday, or the one day. */
export const daysOf = (view: CalendarView, anchor: Date) =>
  view === "day"
    ? [startOfDay(anchor)]
    : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

/** `YYYY-MM-DD` of a local date, for the URL. */
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** The local date a `YYYY-MM-DD` names; today for anything else. */
export function parseDayKey(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return startOfDay(new Date());
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** A selected stretch of time on the grid, in whole slots. */
export interface Slot {
  start: Date;
  end: Date;
}

/** The slot `minutes` past midnight of `day`, `length` minutes long. */
export function slotAt(day: Date, minutes: number, length = 30) {
  const snapped = Math.max(
    0,
    Math.min(24 * 60 - SLOT_MINUTES, Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES),
  );
  const start = new Date(day.getTime() + snapped * 60_000);
  return { start, end: new Date(start.getTime() + length * 60_000) } satisfies Slot;
}

/** The next half hour from now, on today. */
export function nextHalfHour(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return slotAt(startOfDay(now), Math.ceil(minutes / 30) * 30);
}

export const minutesInto = (day: Date, at: Date) => (at.getTime() - day.getTime()) / 60_000;

/** An event's piece on one day column, placed beside the events it overlaps. */
export interface Placed {
  event: CalendarEvent;
  /** Minutes from the day's midnight, clipped to the day. */
  from: number;
  to: number;
  column: number;
  columns: number;
}

/** A stable key for an event or one instance of a series. */
export const eventKey = (event: Pick<CalendarEvent, "id" | "recurrenceId">) =>
  event.recurrenceId ? `${event.id}@${event.recurrenceId}` : event.id;

/**
 * The timed events of one day, each placed in a column of its overlap cluster, so overlapping
 * events share the width side by side and the rest take it all.
 */
export function placeDay(day: Date, events: readonly CalendarEvent[]) {
  const dayStart = day.getTime();
  const dayEnd = dayStart + DAY_MS;
  const pieces = events
    .filter((e) => !e.allDay)
    .map((event) => {
      const start = Math.max(Date.parse(event.start), dayStart);
      const end = Math.min(Date.parse(event.end), dayEnd);
      return {
        event,
        from: (start - dayStart) / 60_000,
        to: Math.max((end - dayStart) / 60_000, (start - dayStart) / 60_000 + SLOT_MINUTES),
      };
    })
    .filter((piece) => piece.from < 24 * 60 && Date.parse(piece.event.end) > dayStart)
    .toSorted((a, b) => a.from - b.from || b.to - a.to);
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const close = () => {
    const columns = Math.max(1, ...cluster.map((p) => p.column + 1));
    for (const piece of cluster) piece.columns = columns;
    cluster = [];
  };
  for (const piece of pieces) {
    if (piece.from >= clusterEnd) close();
    const taken = new Set(cluster.filter((p) => p.to > piece.from).map((p) => p.column));
    let column = 0;
    while (taken.has(column)) column++;
    const one = { ...piece, column, columns: 1 };
    cluster.push(one);
    placed.push(one);
    clusterEnd = Math.max(clusterEnd, piece.to);
  }
  close();
  return placed;
}

/** The all-day events that cover `day`. */
export const allDayOn = (day: Date, events: readonly CalendarEvent[]) => {
  const key = dayKey(day);
  return events.filter(
    (e) => e.allDay && e.startDay && e.endDay && e.startDay <= key && key < e.endDay,
  );
};
