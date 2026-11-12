import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./org", () => ({
  getOrganization: vi.fn(async () => ({ shiftStartMinutes: 570, shiftEndMinutes: 1110, graceMinutes: 10 })),
  getCalendarConfig: vi.fn(async () => ({ holidays: [], weeklyOffDays: [0, 6] })),
}));

vi.mock("../lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
}));

interface FakeUser {
  id: string;
  employeeCode: string | null;
}

interface FakeRecord {
  userId: string;
  date: Date;
  checkInAt?: Date;
  checkOutAt?: Date;
  status: string;
  lateMinutes: number;
  workedMinutes?: number;
  isRegularized: boolean;
  source: string;
}

let users: FakeUser[];
let lockedMonths: { year: number; month: number; status: string }[];
let records: Map<string, FakeRecord>;
const recordKey = (userId: string, date: Date) => `${userId}:${date.toISOString()}`;

vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => users) },
    monthLock: { findMany: vi.fn(async ({ where }: { where: { status: string } }) => lockedMonths.filter((l) => l.status === where.status)) },
    attendanceRecord: {
      upsert: vi.fn(async ({ where, create }: { where: { userId_date: { userId: string; date: Date } }; create: FakeRecord }) => {
        const k = recordKey(where.userId_date.userId, where.userId_date.date);
        records.set(k, create);
        return create;
      }),
    },
  },
}));

const { importAttendanceCsv } = await import("./attendanceService");

describe("importAttendanceCsv", () => {
  beforeEach(() => {
    users = [
      { id: "u1", employeeCode: "EMP001" },
      { id: "u2", employeeCode: "EMP002" },
    ];
    lockedMonths = [];
    records = new Map();
  });

  it("imports a valid row with explicit status", async () => {
    const csv = "employeeCode,date,status,checkIn,checkOut\nEMP001,15/06/2026,WFH,,";
    const result = await importAttendanceCsv(csv, "actor-1");
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    const record = [...records.values()][0];
    expect(record.status).toBe("WFH");
  });

  it("derives LATE status from a check-in after the grace window", async () => {
    const csv = "employeeCode,date,checkIn,checkOut\nEMP001,15/06/2026,10:30,18:30";
    const result = await importAttendanceCsv(csv, "actor-1");
    expect(result.errors).toHaveLength(0);
    const record = [...records.values()][0];
    expect(record.status).toBe("LATE");
    expect(record.lateMinutes).toBeGreaterThan(0);
  });

  it("derives PRESENT status from an on-time check-in with no explicit status", async () => {
    const csv = "employeeCode,date,checkIn,checkOut\nEMP001,15/06/2026,09:20,18:30";
    const result = await importAttendanceCsv(csv, "actor-1");
    const record = [...records.values()][0];
    expect(record.status).toBe("PRESENT");
  });

  it("rejects a row for an unknown employee code", async () => {
    const csv = "employeeCode,date\nEMP999,15/06/2026";
    const result = await importAttendanceCsv(csv, "actor-1");
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/No employee found/);
  });

  it("rejects a row with an unparseable date", async () => {
    const csv = "employeeCode,date\nEMP001,2026-06-15";
    const result = await importAttendanceCsv(csv, "actor-1");
    expect(result.errors[0].message).toMatch(/Invalid date/);
  });

  it("rejects a non-importable status", async () => {
    const csv = "employeeCode,date,status\nEMP001,15/06/2026,ON_LEAVE";
    const result = await importAttendanceCsv(csv, "actor-1");
    expect(result.errors[0].message).toMatch(/not importable/);
  });

  it("rejects a row targeting an already-locked payroll month", async () => {
    lockedMonths = [{ year: 2026, month: 6, status: "LOCKED" }];
    const csv = "employeeCode,date,status\nEMP001,15/06/2026,PRESENT";
    const result = await importAttendanceCsv(csv, "actor-1");
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toMatch(/locked payroll month/);
  });

  it("rejects a malformed time", async () => {
    const csv = "employeeCode,date,checkIn\nEMP001,15/06/2026,25:99";
    const result = await importAttendanceCsv(csv, "actor-1");
    expect(result.errors[0].message).toMatch(/Invalid time/);
  });

  it("processes multiple rows independently, collecting errors without stopping", async () => {
    const csv = ["employeeCode,date,status", "EMP001,15/06/2026,PRESENT", "EMP999,16/06/2026,PRESENT", "EMP002,17/06/2026,ABSENT"].join("\n");
    const result = await importAttendanceCsv(csv, "actor-1");
    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(1);
  });
});
