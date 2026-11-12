import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./org", () => ({
  getOrganization: vi.fn(async () => ({ lateMarksForHalfDay: 3 })),
}));

vi.mock("../lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
}));

interface MonthLockRecord {
  year: number;
  month: number;
  status: "OPEN" | "LOCKED";
  lockedById: string | null;
  lockedAt: Date | null;
  note: string | null;
}

let monthLocks: Map<string, MonthLockRecord>;
const key = (year: number, month: number) => `${year}-${month}`;

vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => []) },
    monthLock: {
      findUnique: vi.fn(async ({ where }: { where: { year_month: { year: number; month: number } } }) => {
        return monthLocks.get(key(where.year_month.year, where.year_month.month)) ?? null;
      }),
      upsert: vi.fn(async ({ where, update, create }: { where: { year_month: { year: number; month: number } }; update: Partial<MonthLockRecord>; create: MonthLockRecord }) => {
        const k = key(where.year_month.year, where.year_month.month);
        const existing = monthLocks.get(k);
        const next: MonthLockRecord = existing ? { ...existing, ...update } : { ...create };
        monthLocks.set(k, next);
        return next;
      }),
    },
    monthlyReportSnapshot: { upsert: vi.fn(async () => ({})) },
  },
}));

const { generateMonthlyReport, lockMonth, reopenMonth } = await import("./reportService");
const { ForbiddenError } = await import("../lib/auth/rbac");

describe("month locking", () => {
  beforeEach(() => {
    monthLocks = new Map();
  });

  it("allows report generation for an open month", async () => {
    const reports = await generateMonthlyReport(2026, 6, "actor-1");
    expect(reports).toEqual([]);
  });

  it("locks a month and records who locked it", async () => {
    const lock = await lockMonth(2026, 6, "hr-1");
    expect(lock.status).toBe("LOCKED");
    expect(lock.lockedById).toBe("hr-1");
  });

  it("blocks regenerating a report for a locked month", async () => {
    await lockMonth(2026, 6, "hr-1");
    await expect(generateMonthlyReport(2026, 6, "hr-1")).rejects.toThrow(ForbiddenError);
  });

  it("reopens a locked month with a reason, allowing generation again", async () => {
    await lockMonth(2026, 6, "hr-1");
    const reopened = await reopenMonth(2026, 6, "hr-1", "Payroll correction needed");
    expect(reopened.status).toBe("OPEN");
    expect(reopened.note).toBe("Payroll correction needed");

    await expect(generateMonthlyReport(2026, 6, "hr-1")).resolves.toEqual([]);
  });

  it("keeps locks for different months independent", async () => {
    await lockMonth(2026, 6, "hr-1");
    const reportsForJuly = await generateMonthlyReport(2026, 7, "hr-1");
    expect(reportsForJuly).toEqual([]);
  });
});
