import { describe, expect, it } from "vitest";
import { parseDMY } from "../date";
import { validateLeaveRequest, type LeaveRequestValidationInput } from "./validate";

const d = (s: string) => parseDMY(s)!;

function baseInput(overrides: Partial<LeaveRequestValidationInput> = {}): LeaveRequestValidationInput {
  return {
    now: d("01/06/2026"),
    startDate: d("10/06/2026"),
    endDate: d("10/06/2026"),
    requestedDays: 1,
    employee: { gender: "UNSPECIFIED", status: "ACTIVE", department: "Engineering" },
    leaveType: {
      maxConsecutiveDays: null,
      minNoticeDays: 0,
      allowNegativeBalance: false,
      negativeBalanceLimit: 0,
      applicableGender: "ALL",
      availableDuringProbation: true,
    },
    currentBalance: 5,
    existingUserRequests: [],
    backdatedLimitDays: 2,
    ...overrides,
  };
}

describe("validateLeaveRequest", () => {
  it("passes a clean request with no errors or warnings", () => {
    const result = validateLeaveRequest(baseInput());
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("blocks gender-inapplicable leave types", () => {
    const result = validateLeaveRequest(
      baseInput({
        employee: { gender: "MALE", status: "ACTIVE", department: null },
        leaveType: { ...baseInput().leaveType, applicableGender: "FEMALE" },
      })
    );
    expect(result.errors.map((e) => e.code)).toContain("GENDER_NOT_APPLICABLE");
  });

  it("blocks leave types unavailable during probation", () => {
    const result = validateLeaveRequest(
      baseInput({
        employee: { gender: "UNSPECIFIED", status: "PROBATION", department: null },
        leaveType: { ...baseInput().leaveType, availableDuringProbation: false },
      })
    );
    expect(result.errors.map((e) => e.code)).toContain("NOT_AVAILABLE_DURING_PROBATION");
  });

  it("blocks insufficient balance when negative balance is not allowed", () => {
    const result = validateLeaveRequest(baseInput({ currentBalance: 0.5, requestedDays: 1 }));
    expect(result.errors.map((e) => e.code)).toContain("INSUFFICIENT_BALANCE");
  });

  it("allows a negative balance within the configured fallback limit", () => {
    const result = validateLeaveRequest(
      baseInput({
        currentBalance: 0,
        requestedDays: 1,
        leaveType: { ...baseInput().leaveType, allowNegativeBalance: true, negativeBalanceLimit: 2 },
      })
    );
    expect(result.errors).toHaveLength(0);
  });

  it("blocks when the negative balance fallback limit is exceeded", () => {
    const result = validateLeaveRequest(
      baseInput({
        currentBalance: 0,
        requestedDays: 3,
        leaveType: { ...baseInput().leaveType, allowNegativeBalance: true, negativeBalanceLimit: 2 },
      })
    );
    expect(result.errors.map((e) => e.code)).toContain("NEGATIVE_BALANCE_LIMIT_EXCEEDED");
  });

  it("blocks overlapping requests", () => {
    const result = validateLeaveRequest(
      baseInput({
        existingUserRequests: [{ id: "r1", startDate: d("09/06/2026"), endDate: d("11/06/2026"), status: "APPROVED" }],
      })
    );
    expect(result.errors.map((e) => e.code)).toContain("OVERLAPPING_REQUEST");
  });

  it("ignores cancelled/rejected requests for overlap checks", () => {
    const result = validateLeaveRequest(
      baseInput({
        existingUserRequests: [{ id: "r1", startDate: d("09/06/2026"), endDate: d("11/06/2026"), status: "CANCELLED" }],
      })
    );
    expect(result.errors.map((e) => e.code)).not.toContain("OVERLAPPING_REQUEST");
  });

  it("excludes the request's own id from the overlap check when editing", () => {
    const result = validateLeaveRequest(
      baseInput({
        excludeRequestId: "r1",
        existingUserRequests: [{ id: "r1", startDate: d("09/06/2026"), endDate: d("11/06/2026"), status: "APPROVED" }],
      })
    );
    expect(result.errors.map((e) => e.code)).not.toContain("OVERLAPPING_REQUEST");
  });

  it("blocks backdated requests beyond the configured limit", () => {
    const result = validateLeaveRequest(baseInput({ startDate: d("20/05/2026"), endDate: d("20/05/2026") }));
    expect(result.errors.map((e) => e.code)).toContain("BACKDATED_LIMIT_EXCEEDED");
  });

  it("allows a backdated request within the configured limit", () => {
    const result = validateLeaveRequest(baseInput({ startDate: d("31/05/2026"), endDate: d("31/05/2026") }));
    expect(result.errors.map((e) => e.code)).not.toContain("BACKDATED_LIMIT_EXCEEDED");
  });

  it("warns (not errors) on insufficient notice", () => {
    const result = validateLeaveRequest(
      baseInput({
        startDate: d("03/06/2026"),
        endDate: d("03/06/2026"),
        leaveType: { ...baseInput().leaveType, minNoticeDays: 7 },
      })
    );
    expect(result.warnings.map((w) => w.code)).toContain("INSUFFICIENT_NOTICE");
    expect(result.errors).toHaveLength(0);
  });

  it("blocks requests exceeding max consecutive days", () => {
    const result = validateLeaveRequest(
      baseInput({
        startDate: d("10/06/2026"),
        endDate: d("15/06/2026"),
        leaveType: { ...baseInput().leaveType, maxConsecutiveDays: 3 },
      })
    );
    expect(result.errors.map((e) => e.code)).toContain("MAX_CONSECUTIVE_DAYS_EXCEEDED");
  });

  it("blocks a BLOCK-enforced blackout period overlap", () => {
    const result = validateLeaveRequest(
      baseInput({
        blackoutPeriods: [
          { name: "Year-end freeze", startDate: d("08/06/2026"), endDate: d("12/06/2026"), department: null, enforcement: "BLOCK" },
        ],
      })
    );
    expect(result.errors.map((e) => e.code)).toContain("BLACKOUT_PERIOD");
  });

  it("warns (not blocks) a WARN-enforced blackout period overlap", () => {
    const result = validateLeaveRequest(
      baseInput({
        blackoutPeriods: [
          { name: "Year-end freeze", startDate: d("08/06/2026"), endDate: d("12/06/2026"), department: null, enforcement: "WARN" },
        ],
      })
    );
    expect(result.warnings.map((w) => w.code)).toContain("BLACKOUT_PERIOD");
    expect(result.errors).toHaveLength(0);
  });

  it("does not apply a department-scoped blackout to a different department", () => {
    const result = validateLeaveRequest(
      baseInput({
        employee: { gender: "UNSPECIFIED", status: "ACTIVE", department: "Sales" },
        blackoutPeriods: [
          { name: "Eng freeze", startDate: d("08/06/2026"), endDate: d("12/06/2026"), department: "Engineering", enforcement: "BLOCK" },
        ],
      })
    );
    expect(result.errors).toHaveLength(0);
  });

  it("blocks when team coverage is exceeded and enforcement is BLOCK", () => {
    const result = validateLeaveRequest(
      baseInput({
        teamCoverage: {
          teammateLeaveCountByDateKey: new Map([["2026-06-10", 2]]),
          maxConcurrent: 2,
          enforcement: "BLOCK",
        },
      })
    );
    expect(result.errors.map((e) => e.code)).toContain("TEAM_COVERAGE_EXCEEDED");
  });

  it("warns when team coverage is exceeded and enforcement is WARN", () => {
    const result = validateLeaveRequest(
      baseInput({
        teamCoverage: {
          teammateLeaveCountByDateKey: new Map([["2026-06-10", 2]]),
          maxConcurrent: 2,
          enforcement: "WARN",
        },
      })
    );
    expect(result.warnings.map((w) => w.code)).toContain("TEAM_COVERAGE_EXCEEDED");
    expect(result.errors).toHaveLength(0);
  });

  it("does not flag team coverage when under the limit", () => {
    const result = validateLeaveRequest(
      baseInput({
        teamCoverage: {
          teammateLeaveCountByDateKey: new Map([["2026-06-10", 1]]),
          maxConcurrent: 2,
          enforcement: "BLOCK",
        },
      })
    );
    expect(result.errors).toHaveLength(0);
  });
});
