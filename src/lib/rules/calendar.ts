import { dateKeyIST, dayOfWeekIST, enumerateDaysIST, startOfDayIST } from "../date";

export type DayKind = "WORKING" | "WEEKLY_OFF" | "HOLIDAY";

export interface CalendarConfig {
  /** Day-of-week numbers that are weekly off, 0=Sun..6=Sat. Default Sat+Sun. */
  weeklyOffDays: number[];
  /** yyyy-MM-dd keys (IST) of holidays. */
  holidayDateKeys: Set<string>;
}

export function classifyDay(date: Date, config: CalendarConfig): DayKind {
  const key = dateKeyIST(date);
  if (config.holidayDateKeys.has(key)) return "HOLIDAY";
  if (config.weeklyOffDays.includes(dayOfWeekIST(date))) return "WEEKLY_OFF";
  return "WORKING";
}

export function isWorkingDay(date: Date, config: CalendarConfig): boolean {
  return classifyDay(date, config) === "WORKING";
}

export type HalfDayType = "NONE" | "FIRST_HALF" | "SECOND_HALF";

export interface LeaveTypeDayCountPolicy {
  countWeekendsInRange: boolean;
  countHolidaysInRange: boolean;
}

export interface DayBreakdownEntry {
  dateKey: string;
  kind: DayKind;
  portion: number; // 0, 0.5, or 1 — the amount counted against leave balance
}

export interface LeaveDayCountResult {
  totalDays: number;
  breakdown: DayBreakdownEntry[];
}

/**
 * Counts leave days for a single contiguous request, honouring the leave
 * type's weekend/holiday inclusion policy. Half-day portions only apply to
 * single-day requests (startDate === endDate).
 */
export function countLeaveDays(
  startDate: Date,
  endDate: Date,
  halfDayType: HalfDayType,
  calendar: CalendarConfig,
  policy: LeaveTypeDayCountPolicy
): LeaveDayCountResult {
  const days = enumerateDaysIST(startDate, endDate);
  const isSingleDay = days.length === 1;

  const breakdown: DayBreakdownEntry[] = days.map((d) => {
    const kind = classifyDay(d, calendar);
    let portion = 0;
    if (kind === "WORKING") portion = 1;
    else if (kind === "WEEKLY_OFF") portion = policy.countWeekendsInRange ? 1 : 0;
    else if (kind === "HOLIDAY") portion = policy.countHolidaysInRange ? 1 : 0;

    if (isSingleDay && halfDayType !== "NONE" && portion > 0) {
      portion = 0.5;
    }

    return { dateKey: dateKeyIST(d), kind, portion };
  });

  const totalDays = round2(breakdown.reduce((sum, b) => sum + b.portion, 0));
  return { totalDays, breakdown };
}

/**
 * Sandwich rule: if a new leave request is immediately adjacent (separated
 * only by weekly-offs and/or holidays) to another request by the same
 * employee, the non-working gap days in between are also charged as leave,
 * attributed to the later of the two requests. This stops an employee from
 * "free-riding" a weekend by taking Friday and Monday off separately.
 */
export function computeSandwichGapDays(
  earlierRequestEnd: Date,
  laterRequestStart: Date,
  calendar: CalendarConfig,
  sandwichEnabled: boolean
): DayBreakdownEntry[] {
  if (!sandwichEnabled) return [];
  const gapStart = addDaysSimple(startOfDayIST(earlierRequestEnd), 1);
  const gapEnd = addDaysSimple(startOfDayIST(laterRequestStart), -1);
  if (gapEnd.getTime() < gapStart.getTime()) return [];

  const gapDays = enumerateDaysIST(gapStart, gapEnd);
  if (gapDays.length === 0) return [];

  const allNonWorking = gapDays.every((d) => classifyDay(d, calendar) !== "WORKING");
  if (!allNonWorking) return [];

  return gapDays.map((d) => ({
    dateKey: dateKeyIST(d),
    kind: classifyDay(d, calendar),
    portion: 1,
  }));
}

function addDaysSimple(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
