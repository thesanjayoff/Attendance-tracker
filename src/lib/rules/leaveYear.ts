import { dateKeyIST, istMidnightUTCForYMD } from "../date";

export type LeaveYearType = "CALENDAR" | "FINANCIAL";

export interface LeaveYearBounds {
  label: string;
  startDate: Date; // UTC instant of IST midnight
  endDate: Date; // UTC instant of IST midnight (last day of year, inclusive)
}

function istYearMonth(date: Date): { year: number; month: number } {
  const key = dateKeyIST(date); // yyyy-MM-dd
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

/** Resolves the leave-year window (calendar or financial) containing `forDate`. */
export function getLeaveYearBounds(
  leaveYearType: LeaveYearType,
  financialYearStartMonth: number,
  forDate: Date
): LeaveYearBounds {
  const { year, month } = istYearMonth(forDate);

  if (leaveYearType === "CALENDAR") {
    return {
      label: String(year),
      startDate: istMidnightUTCForYMD(year, 1, 1),
      endDate: istMidnightUTCForYMD(year, 12, 31),
    };
  }

  const fyStartYear = month >= financialYearStartMonth ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  const endMonth = financialYearStartMonth === 1 ? 12 : financialYearStartMonth - 1;
  const endYear = financialYearStartMonth === 1 ? fyStartYear : fyEndYear;
  const lastDay = daysInMonth(endYear, endMonth);

  return {
    label: `${fyStartYear}-${fyEndYear}`,
    startDate: istMidnightUTCForYMD(fyStartYear, financialYearStartMonth, 1),
    endDate: istMidnightUTCForYMD(endYear, endMonth, lastDay),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysBetweenInclusive(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}
