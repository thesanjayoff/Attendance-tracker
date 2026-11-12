import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, differenceInCalendarDays, isWithinInterval } from "date-fns";

export const IST = "Asia/Kolkata";

/** Format a UTC instant as DD/MM/YYYY in IST (Indian convention). */
export function formatDMY(date: Date): string {
  return formatInTimeZone(date, IST, "dd/MM/yyyy");
}

export function formatDMYTime(date: Date): string {
  return formatInTimeZone(date, IST, "dd/MM/yyyy HH:mm");
}

/** yyyy-MM-dd key in IST, used for set membership / grouping. */
export function dateKeyIST(date: Date): string {
  return formatInTimeZone(date, IST, "yyyy-MM-dd");
}

/** Midnight IST for the given date, returned as the equivalent UTC instant. */
export function startOfDayIST(date: Date): Date {
  const key = dateKeyIST(date);
  return fromZonedTime(`${key} 00:00:00`, IST);
}

/** Midnight IST for a specific Y/M/D (IST calendar date), as a UTC instant. */
export function istMidnightUTCForYMD(year: number, month: number, day: number): Date {
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000;
  return new Date(utcMs);
}

/** A specific wall-clock moment in IST (Y/M/D H:M), as the equivalent UTC instant. */
export function istDateTimeForYMDHM(year: number, month: number, day: number, hour: number, minute: number): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  return fromZonedTime(`${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:00`, IST);
}

/** "Now", expressed as the IST wall-clock Date object (for day-of-week etc.). */
export function nowInIST(): Date {
  return toZonedTime(new Date(), IST);
}

export function todayKeyIST(): string {
  return dateKeyIST(new Date());
}

/** Inclusive list of calendar dates (as UTC midnight-IST instants) between start and end. */
export function enumerateDaysIST(start: Date, end: Date): Date[] {
  const startMid = startOfDayIST(start);
  const endMid = startOfDayIST(end);
  const days = differenceInCalendarDays(endMid, startMid);
  if (days < 0) return [];
  return Array.from({ length: days + 1 }, (_, i) => addDays(startMid, i));
}

export function dayOfWeekIST(date: Date): number {
  // 0 = Sunday ... 6 = Saturday, matching the IST calendar date.
  const key = dateKeyIST(date); // yyyy-MM-dd
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

export function isDateWithin(date: Date, start: Date, end: Date): boolean {
  return isWithinInterval(startOfDayIST(date), {
    start: startOfDayIST(start),
    end: startOfDayIST(end),
  });
}

export function parseDMY(input: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const key = `${yyyy}-${mm}-${dd}`;
  const date = fromZonedTime(`${key} 00:00:00`, IST);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
