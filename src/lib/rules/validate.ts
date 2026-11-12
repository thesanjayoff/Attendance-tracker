import { dateKeyIST, enumerateDaysIST, startOfDayIST } from "../date";

export type Gender = "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";
export type ApplicableGender = "ALL" | "MALE" | "FEMALE";
export type EmployeeStatus = "ACTIVE" | "PROBATION" | "INACTIVE";
export type Enforcement = "WARN" | "BLOCK";

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ExistingRequestRange {
  id: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

export interface BlackoutPeriodLike {
  name: string;
  startDate: Date;
  endDate: Date;
  department: string | null;
  enforcement: Enforcement;
}

export interface TeamCoverageContext {
  teammateLeaveCountByDateKey: Map<string, number>;
  maxConcurrent: number | null;
  enforcement: Enforcement;
}

export interface LeaveRequestValidationInput {
  now: Date;
  startDate: Date;
  endDate: Date;
  requestedDays: number;
  excludeRequestId?: string; // when editing an existing request
  employee: {
    gender: Gender;
    status: EmployeeStatus;
    department: string | null;
  };
  leaveType: {
    maxConsecutiveDays: number | null;
    minNoticeDays: number;
    allowNegativeBalance: boolean;
    negativeBalanceLimit: number;
    applicableGender: ApplicableGender;
    availableDuringProbation: boolean;
    requiresDocAfterDays?: number | null;
  };
  hasDocument?: boolean;
  currentBalance: number;
  existingUserRequests: ExistingRequestRange[];
  backdatedLimitDays: number;
  allowBackdatedOverride?: boolean;
  blackoutPeriods?: BlackoutPeriodLike[];
  teamCoverage?: TeamCoverageContext;
}

const ACTIVE_STATUSES = new Set(["PENDING", "PENDING_LEVEL_2", "APPROVED", "ESCALATED"]);

export function validateLeaveRequest(input: LeaveRequestValidationInput): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const today = startOfDayIST(input.now);
  const start = startOfDayIST(input.startDate);
  const end = startOfDayIST(input.endDate);

  if (input.leaveType.applicableGender !== "ALL" && input.employee.gender !== input.leaveType.applicableGender) {
    errors.push({ code: "GENDER_NOT_APPLICABLE", message: "This leave type does not apply to the employee's recorded gender." });
  }

  if (input.employee.status === "PROBATION" && !input.leaveType.availableDuringProbation) {
    errors.push({ code: "NOT_AVAILABLE_DURING_PROBATION", message: "This leave type is not available during probation." });
  }

  const projectedBalance = round2(input.currentBalance - input.requestedDays);
  if (projectedBalance < 0) {
    if (!input.leaveType.allowNegativeBalance) {
      errors.push({ code: "INSUFFICIENT_BALANCE", message: `Insufficient balance: ${input.currentBalance} available, ${input.requestedDays} requested.` });
    } else if (projectedBalance < -input.leaveType.negativeBalanceLimit) {
      errors.push({ code: "NEGATIVE_BALANCE_LIMIT_EXCEEDED", message: `Request would exceed the allowed negative balance limit of ${input.leaveType.negativeBalanceLimit} days.` });
    }
  }

  const overlapping = input.existingUserRequests.some(
    (r) =>
      r.id !== input.excludeRequestId &&
      ACTIVE_STATUSES.has(r.status) &&
      rangesOverlap(start, end, startOfDayIST(r.startDate), startOfDayIST(r.endDate))
  );
  if (overlapping) {
    errors.push({ code: "OVERLAPPING_REQUEST", message: "This date range overlaps an existing pending or approved leave request." });
  }

  if (!input.allowBackdatedOverride) {
    const earliestAllowed = addDays(today, -input.backdatedLimitDays);
    if (start.getTime() < earliestAllowed.getTime()) {
      errors.push({ code: "BACKDATED_LIMIT_EXCEEDED", message: `Leave cannot be backdated more than ${input.backdatedLimitDays} day(s).` });
    }
  }

  if (input.leaveType.minNoticeDays > 0) {
    const earliestWithNotice = addDays(today, input.leaveType.minNoticeDays);
    if (start.getTime() < earliestWithNotice.getTime()) {
      warnings.push({ code: "INSUFFICIENT_NOTICE", message: `This leave type usually requires ${input.leaveType.minNoticeDays} day(s) notice.` });
    }
  }

  if (input.leaveType.requiresDocAfterDays != null && input.requestedDays > input.leaveType.requiresDocAfterDays && !input.hasDocument) {
    warnings.push({
      code: "DOCUMENT_REQUIRED",
      message: `A supporting document is usually required for this leave type beyond ${input.leaveType.requiresDocAfterDays} day(s).`,
    });
  }

  if (input.leaveType.maxConsecutiveDays != null) {
    const spanDays = enumerateDaysIST(start, end).length;
    if (spanDays > input.leaveType.maxConsecutiveDays) {
      errors.push({ code: "MAX_CONSECUTIVE_DAYS_EXCEEDED", message: `This leave type allows at most ${input.leaveType.maxConsecutiveDays} consecutive day(s).` });
    }
  }

  for (const blackout of input.blackoutPeriods ?? []) {
    if (blackout.department && blackout.department !== input.employee.department) continue;
    if (!rangesOverlap(start, end, startOfDayIST(blackout.startDate), startOfDayIST(blackout.endDate))) continue;
    const issue = { code: "BLACKOUT_PERIOD", message: `Overlaps blackout period "${blackout.name}".` };
    if (blackout.enforcement === "BLOCK") errors.push(issue);
    else warnings.push(issue);
  }

  if (input.teamCoverage && input.teamCoverage.maxConcurrent != null) {
    const { teammateLeaveCountByDateKey, maxConcurrent, enforcement } = input.teamCoverage;
    const breachedDates = enumerateDaysIST(start, end)
      .map((d) => dateKeyIST(d))
      .filter((key) => (teammateLeaveCountByDateKey.get(key) ?? 0) + 1 > (maxConcurrent as number));
    if (breachedDates.length > 0) {
      const issue = {
        code: "TEAM_COVERAGE_EXCEEDED",
        message: `More than ${maxConcurrent} team member(s) would be off on: ${breachedDates.join(", ")}.`,
      };
      if (enforcement === "BLOCK") errors.push(issue);
      else warnings.push(issue);
    }
  }

  return { errors, warnings };
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
