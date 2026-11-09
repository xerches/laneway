import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import type { Recurrence } from "@/db/schema";

/** Dates are stored as plain "YYYY-MM-DD" strings, with no time zone. */
export type DateString = string;

export function toDateString(date: Date): DateString {
  return format(date, "yyyy-MM-dd");
}

/** Today in the browser's (or server's) local time zone. */
export function todayString(): DateString {
  return toDateString(new Date());
}

export function parseDate(value: DateString): Date {
  return parseISO(value);
}

export function addDaysTo(value: DateString, days: number): DateString {
  return toDateString(addDays(parseISO(value), days));
}

export function daysBetween(from: DateString, to: DateString): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/** "Today", "Tomorrow", "Mon", "Nov 14" or "Nov 14, 2027". */
export function formatDue(value: DateString, today: DateString): string {
  const diff = daysBetween(today, value);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const date = parseISO(value);
  if (diff > 1 && diff < 7) return format(date, "EEE");
  if (value.slice(0, 4) === today.slice(0, 4)) return format(date, "MMM d");
  return format(date, "MMM d, yyyy");
}

export function describeRecurrence(rec: Recurrence): string {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[
    rec.freq
  ];
  if (rec.interval === 1) {
    return { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[
      rec.freq
    ];
  }
  return `Every ${rec.interval} ${unit}s`;
}

function step(value: DateString, rec: Recurrence): DateString {
  const date = parseISO(value);
  const n = Math.max(1, rec.interval);
  switch (rec.freq) {
    case "daily":
      return toDateString(addDays(date, n));
    case "weekly":
      return toDateString(addWeeks(date, n));
    case "monthly":
      return toDateString(addMonths(date, n));
    case "yearly":
      return toDateString(addYears(date, n));
  }
}

/**
 * The due date for the next copy of a recurring item. It steps forward from
 * the previous due date and never lands in the past, so a chore that was
 * ignored for a month comes back once, not four times.
 */
export function nextOccurrence(
  previousDue: DateString | null,
  rec: Recurrence,
  today: DateString,
): DateString {
  let next = step(previousDue ?? today, rec);
  let guard = 0;
  while (next < today && guard < 1000) {
    next = step(next, rec);
    guard += 1;
  }
  return next;
}

/** "Mon, Nov 9" */
export function formatShort(value: DateString): string {
  return format(parseISO(value), "EEE, MMM d");
}

/** "today", "tomorrow", "in 10 days", "3 days ago" */
export function relativeDays(value: DateString, today: DateString): string {
  const diff = daysBetween(today, value);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}
