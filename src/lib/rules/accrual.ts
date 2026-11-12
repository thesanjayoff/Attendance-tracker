import { daysBetweenInclusive, LeaveYearBounds } from "./leaveYear";

/** Rounds to the nearest half-day, which is the smallest unit most Indian leave policies track. */
export function roundToHalfDay(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * Upfront accrual: the full yearly quota is credited at the start of the
 * leave year, pro-rated for employees who join mid-year.
 */
export function computeUpfrontAllocation(
  yearlyQuotaDays: number,
  yearBounds: LeaveYearBounds,
  dateOfJoining: Date
): number {
  if (dateOfJoining.getTime() <= yearBounds.startDate.getTime()) {
    return yearlyQuotaDays;
  }
  if (dateOfJoining.getTime() > yearBounds.endDate.getTime()) {
    return 0;
  }
  const totalDays = daysBetweenInclusive(yearBounds.startDate, yearBounds.endDate);
  const remainingDays = daysBetweenInclusive(dateOfJoining, yearBounds.endDate);
  return roundToHalfDay(yearlyQuotaDays * (remainingDays / totalDays));
}

/**
 * Monthly accrual: 1/12th of the yearly quota credited each month,
 * pro-rated for the partial month in which the employee joined.
 */
export function computeMonthlyAccrualAmount(
  yearlyQuotaDays: number,
  monthStart: Date,
  monthEnd: Date,
  dateOfJoining: Date
): number {
  const monthlyShare = yearlyQuotaDays / 12;
  if (dateOfJoining.getTime() <= monthStart.getTime()) {
    return roundToHalfDay(monthlyShare);
  }
  if (dateOfJoining.getTime() > monthEnd.getTime()) {
    return 0;
  }
  const totalDaysInMonth = daysBetweenInclusive(monthStart, monthEnd);
  const workedDaysInMonth = daysBetweenInclusive(dateOfJoining, monthEnd);
  return roundToHalfDay(monthlyShare * (workedDaysInMonth / totalDaysInMonth));
}

/**
 * Per-day-worked accrual: credits a fraction of the yearly quota for each
 * day actually worked (attendance-driven), e.g. comp-off style earned leave.
 */
export function computePerDayWorkedAccrual(
  yearlyQuotaDays: number,
  totalWorkingDaysInYear: number,
  daysWorkedInPeriod: number
): number {
  if (totalWorkingDaysInYear <= 0) return 0;
  return roundToHalfDay(yearlyQuotaDays * (daysWorkedInPeriod / totalWorkingDaysInYear));
}

export interface CarryForwardResult {
  carriedForward: number;
  expiredImmediately: number;
}

/** At leave-year rollover: caps the amount carried into the new year. */
export function computeCarryForward(
  balanceAtYearEnd: number,
  carryForwardLimitDays: number
): CarryForwardResult {
  if (balanceAtYearEnd <= 0) return { carriedForward: 0, expiredImmediately: 0 };
  const carriedForward = Math.min(balanceAtYearEnd, carryForwardLimitDays);
  const expiredImmediately = Math.max(balanceAtYearEnd - carryForwardLimitDays, 0);
  return { carriedForward, expiredImmediately };
}

/**
 * Carried-forward balance expires `expiryMonthsAfterYear` months into the
 * new year if unused. Usage since rollover is assumed to consume the
 * carried-forward portion first (FIFO), so only the untouched remainder
 * expires.
 */
export function computeCarryForwardExpiry(
  carriedForwardAmount: number,
  usedSinceRollover: number,
  now: Date,
  expiryDate: Date
): number {
  if (now.getTime() < expiryDate.getTime()) return 0;
  const remaining = Math.max(carriedForwardAmount - usedSinceRollover, 0);
  return remaining;
}
