// Relative date groups for a list sorted newest first: Today, Yesterday, This week, Last week,
// This month, then each month ("October", or "October 2025" for an earlier year).

const MONTH = new Intl.DateTimeFormat(undefined, { month: "long" });
const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DAY_MS = 86_400_000;

/** Midnight at the start of `date`'s day, local time. */
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The group a date falls in, seen from `now`. Weeks start on Monday. */
export function dateGroup(iso: string, now = new Date()) {
  const date = new Date(iso);
  const today = startOfDay(now);
  if (date >= today) return "Today";
  if (date >= new Date(today.getTime() - DAY_MS)) return "Yesterday";
  const weekStart = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY_MS);
  if (date >= weekStart) return "This week";
  if (date >= new Date(weekStart.getTime() - 7 * DAY_MS)) return "Last week";
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return "This month";
  }
  return (date.getFullYear() === now.getFullYear() ? MONTH : MONTH_YEAR).format(date);
}

export interface DateGroup<T> {
  /** Unique within the list: a label can repeat if the rows are not in date order. */
  id: string;
  label: string;
  rows: T[];
}

/** Consecutive rows that share a group, in their own order. */
export function groupByDate<T>(rows: T[], date: (row: T) => string, now = new Date()) {
  const groups: DateGroup<T>[] = [];
  for (const row of rows) {
    const label = dateGroup(date(row), now);
    const last = groups.at(-1);
    if (last?.label === label) last.rows.push(row);
    else groups.push({ id: `${label}:${groups.length}`, label, rows: [row] });
  }
  return groups;
}
