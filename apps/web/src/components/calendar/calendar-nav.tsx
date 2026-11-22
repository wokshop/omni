import type { CSSProperties } from "react";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/field";
import { SidebarSection } from "@/components/ui/sidebar";
import { useCalendars, useCalendarWrites } from "@/hooks/use-calendar.ts";
import { calendarTone } from "@/lib/calendar.ts";
import { MiniMonth } from "./mini-month.tsx";
import { TodoList } from "./todo-list.tsx";

/** The calendar's sidebar: the month, the member's to-dos, then their calendars. */
export function CalendarNav() {
  return (
    <>
      <MiniMonth />
      <TodoList />
      <CalendarList />
    </>
  );
}

function CalendarList() {
  const calendars = useCalendars().data ?? [];
  const { prefs } = useCalendarWrites();
  if (calendars.length === 0) return null;
  return (
    <SidebarSection label="Calendars">
      <div className="flex flex-col gap-1 px-2.5 py-1">
        {calendars.map((calendar) => {
          const tone = calendarTone(calendars, calendar.id);
          return (
            <CheckboxField
              key={calendar.id}
              isSelected={!calendar.hidden}
              onChange={(shown: boolean) => prefs.mutate({ id: calendar.id, hidden: !shown })}
              style={{ "--checkbox-bg": tone, "--checkbox-ring": tone } as CSSProperties}
              className="min-h-7 items-center"
            >
              <Checkbox>
                <Label className="truncate text-sm">{calendar.address}</Label>
              </Checkbox>
            </CheckboxField>
          );
        })}
      </div>
    </SidebarSection>
  );
}
