// SLA due times (ADR 0023): a target in minutes counts only while the inbox is staffed. Pure; the
// Worker calls it whenever a conversation's SLA clock starts or its priority or policy changes.

export interface BusinessHoursWindow {
  /** 0 is Sunday. */
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** `HH:MM` in the schedule's zone. */
  start: string;
  /** `HH:MM` in the schedule's zone, after `start`; `24:00` is midnight at the end of the day. */
  end: string;
}

export interface BusinessSchedule {
  /** IANA zone, e.g. `America/Mexico_City`. */
  timezone: string;
  windows: BusinessHoursWindow[];
  /** Closed all day, as `YYYY-MM-DD` in the zone. */
  holidays: string[];
}

const MINUTE = 60_000;
/** How far ahead to look for opening hours before giving up (a schedule of only holidays). */
const MAX_DAYS = 400;

/**
 * The moment `minutes` of staffed time after `start` have passed. With no schedule, or one with no
 * windows, every minute counts. Null when the schedule never opens again within a year.
 */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  schedule: BusinessSchedule | null,
): Date | null {
  if (!schedule || schedule.windows.length === 0)
    return new Date(start.getTime() + minutes * MINUTE);
  const holidays = new Set(schedule.holidays);
  const byDay = new Map<number, { start: number; end: number }[]>();
  for (const w of schedule.windows) {
    const list = byDay.get(w.day) ?? [];
    list.push({ start: minutesOf(w.start), end: minutesOf(w.end) });
    byDay.set(w.day, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.start - b.start);

  let cursor = start.getTime();
  let remaining = minutes * MINUTE;
  let day = localDate(start, schedule.timezone);
  for (let i = 0; i < MAX_DAYS; i++, day = nextDay(day)) {
    const iso = isoDate(day);
    if (holidays.has(iso)) continue;
    const weekday = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
    for (const window of byDay.get(weekday) ?? []) {
      // Overlapping windows count once: the cursor only moves forward.
      const opens = Math.max(cursor, zonedTime(day, window.start, schedule.timezone));
      const closes = zonedTime(day, window.end, schedule.timezone);
      if (opens >= closes) continue;
      if (remaining <= closes - opens) return new Date(opens + remaining);
      remaining -= closes - opens;
      cursor = closes;
    }
  }
  return null;
}

/** Whether `zone` is an IANA time zone this runtime knows. */
export function isTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

interface LocalDate {
  y: number;
  m: number;
  d: number;
}

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

function isoDate({ y, m, d }: LocalDate) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function nextDay({ y, m, d }: LocalDate): LocalDate {
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(at: number, zone: string) {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(zone, format);
  }
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(at))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

function localDate(at: Date, zone: string): LocalDate {
  const p = wallClock(at.getTime(), zone);
  return { y: p.year, m: p.month, d: p.day };
}

/** The zone's offset from UTC at `at`, in milliseconds. */
function offsetAt(at: number, zone: string) {
  const p = wallClock(at, zone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000
  );
}

/**
 * The instant the zone's clocks read `minutes` past midnight on `day`. A time skipped by a DST
 * jump moves forward by the jump; a repeated one takes its first occurrence.
 */
function zonedTime(day: LocalDate, minutes: number, zone: string) {
  const wall = Date.UTC(day.y, day.m - 1, day.d) + minutes * MINUTE;
  const first = wall - offsetAt(wall, zone);
  const second = wall - offsetAt(first, zone);
  if (first === second) return first;
  // Two candidates: take the one whose wall clock matches, else (a skipped time) the later one.
  const earlier = Math.min(first, second);
  return earlier + offsetAt(earlier, zone) === wall ? earlier : Math.max(first, second);
}
