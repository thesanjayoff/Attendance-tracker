import "server-only";
import { prisma } from "../lib/prisma";
import {
  detectFrequentMondayFridayLeaves,
  detectHeavyAttendanceCorrections,
  detectManyBackdatedRequests,
  type PatternFlag,
} from "../lib/rules/abusePatterns";

const REVIEW_WINDOW_DAYS = 90;
const MONDAY_FRIDAY_THRESHOLD = 3;
const BACKDATED_THRESHOLD = 3;
const CORRECTIONS_THRESHOLD = 4;

export interface EmployeePatternFlags {
  userId: string;
  name: string;
  flags: PatternFlag[];
}

/**
 * Surfaces leave/attendance patterns worth a conversation, phrased
 * neutrally — these are signals for HR to look into, not accusations.
 */
export async function getUnusualPatternFlags(): Promise<EmployeePatternFlags[]> {
  const since = new Date(Date.now() - REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const employees = await prisma.user.findMany({ where: { status: { not: "INACTIVE" } } });

  const [allLeaveRequests, regularizationCounts] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { appliedAt: { gte: since } } }),
    prisma.attendanceRequest.groupBy({
      by: ["userId"],
      where: { type: "REGULARIZATION", createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const regularizationByUser = new Map(regularizationCounts.map((r) => [r.userId, r._count._all]));

  const results: EmployeePatternFlags[] = [];
  for (const employee of employees) {
    const requests = allLeaveRequests.filter((r) => r.userId === employee.id);
    const flags: PatternFlag[] = [];

    const mondayFriday = detectFrequentMondayFridayLeaves(requests, MONDAY_FRIDAY_THRESHOLD);
    if (mondayFriday) flags.push(mondayFriday);

    const backdated = detectManyBackdatedRequests(requests, BACKDATED_THRESHOLD);
    if (backdated) flags.push(backdated);

    const corrections = detectHeavyAttendanceCorrections(regularizationByUser.get(employee.id) ?? 0, CORRECTIONS_THRESHOLD);
    if (corrections) flags.push(corrections);

    if (flags.length > 0) {
      results.push({ userId: employee.id, name: employee.name, flags });
    }
  }
  return results;
}
