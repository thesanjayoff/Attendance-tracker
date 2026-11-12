import { dayOfWeekIST } from "../date";

export interface LeaveRequestLike {
  startDate: Date;
  endDate: Date;
  appliedAt: Date;
  status: string;
}

export interface PatternFlag {
  code: string;
  message: string;
}

const ACTIVE_STATUSES = new Set(["PENDING", "PENDING_LEVEL_2", "APPROVED", "ESCALATED"]);

/**
 * Flags employees whose leave requests cluster on Mondays/Fridays — a
 * pattern worth a conversation, not an accusation. Only counts short
 * (<=2 day) requests, since a planned week-long vacation starting on a
 * Friday isn't the same signal as repeatedly bridging the weekend.
 */
export function detectFrequentMondayFridayLeaves(requests: LeaveRequestLike[], thresholdCount: number): PatternFlag | null {
  const count = requests.filter((r) => {
    if (!ACTIVE_STATUSES.has(r.status)) return false;
    const spanDays = Math.round((r.endDate.getTime() - r.startDate.getTime()) / 86400000) + 1;
    if (spanDays > 2) return false;
    const startDow = dayOfWeekIST(r.startDate);
    const endDow = dayOfWeekIST(r.endDate);
    return startDow === 1 || startDow === 5 || endDow === 1 || endDow === 5;
  }).length;

  if (count < thresholdCount) return null;
  return { code: "FREQUENT_MONDAY_FRIDAY", message: `${count} short Monday/Friday leave request(s) in the review period.` };
}

/** Flags employees who frequently apply for leave for dates already in the past. */
export function detectManyBackdatedRequests(requests: LeaveRequestLike[], thresholdCount: number): PatternFlag | null {
  const count = requests.filter((r) => r.appliedAt.getTime() > r.startDate.getTime()).length;
  if (count < thresholdCount) return null;
  return { code: "FREQUENT_BACKDATED", message: `${count} backdated leave request(s) in the review period.` };
}

/** Flags employees with an unusually high number of attendance regularization requests. */
export function detectHeavyAttendanceCorrections(regularizationCount: number, thresholdCount: number): PatternFlag | null {
  if (regularizationCount < thresholdCount) return null;
  return { code: "HEAVY_CORRECTIONS", message: `${regularizationCount} attendance regularization request(s) in the review period.` };
}
