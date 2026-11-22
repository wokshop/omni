import { crmErrorToast } from "@/components/crm/crm-errors.ts";
import { useUpdateTask } from "@/hooks/use-crm-tasks.ts";
import type { CalendarEvent } from "@/lib/calendar.ts";
import { atMinutes, type Dragged, type Drop } from "@/lib/calendar-drag.ts";
import { dayKey, parseDayKey } from "@/lib/calendar-grid.ts";
import { dueAtOf } from "@/lib/crm-tasks.ts";
import { ownEvent } from "./week-grid.tsx";

const DAY_MINUTES = 24 * 60;

const daysBetween = (from: string, to: string) =>
  Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86_400_000);

function shiftOf(event: CalendarEvent, drop: Drop) {
  if (event.allDay) {
    const from = event.startDay ?? dayKey(new Date(event.start));
    return daysBetween(from, dayKey(drop.day)) * DAY_MINUTES;
  }
  const start = new Date(event.start);
  const target =
    drop.minutes === undefined
      ? atMinutes(drop.day, start.getHours() * 60 + start.getMinutes())
      : atMinutes(drop.day, drop.minutes);
  return Math.round((target.getTime() - start.getTime()) / 60_000);
}

/**
 * What a drop on the calendar does. An event the member organizes moves there, keeping its
 * length (to the same time on another day, when let go on a day). A to-do takes the drop as its
 * due time: a time on the hours, or the day alone.
 */
export function useCalendarDrop(move: (event: CalendarEvent, minutes: number) => void) {
  const update = useUpdateTask();
  return (item: Dragged, drop: Drop) => {
    if (item.kind === "todo") {
      const dueAt =
        drop.minutes === undefined
          ? dueAtOf(dayKey(drop.day))
          : atMinutes(drop.day, drop.minutes).toISOString();
      if (dueAt === item.task.dueAt) return;
      update.mutate(
        { id: item.task.id, dueAt },
        { onError: (error) => crmErrorToast(error, "The to-do was not moved") },
      );
      return;
    }
    if (!ownEvent(item.event)) return;
    const minutes = shiftOf(item.event, drop);
    if (minutes !== 0) move(item.event, minutes);
  };
}
