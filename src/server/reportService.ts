import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { istMidnightUTCForYMD } from "../lib/date";
import { getOrganization } from "./org";
import { logAudit } from "../lib/audit";
import { ForbiddenError } from "../lib/auth/rbac";

export interface EmployeeMonthlyReport {
  userId: string;
  name: string;
  employeeCode: string | null;
  payableDays: number;
  totalDaysInMonth: number;
  presentDays: number;
  lopDays: number;
  lateDeductionDays: number;
  overtimeMinutes: number;
  leaveByType: Record<string, number>;
}

function monthRange(year: number, month: number) {
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = istMidnightUTCForYMD(year, month, 1);
  const end = istMidnightUTCForYMD(year, month, totalDays);
  return { start, end, totalDays };
}

export async function computeMonthlyReportForEmployee(userId: string, year: number, month: number): Promise<EmployeeMonthlyReport> {
  const org = await getOrganization();
  const { start, end, totalDays } = monthRange(year, month);
  const employee = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const records = await prisma.attendanceRecord.findMany({ where: { userId, date: { gte: start, lte: end } } });
  const recordByKey = new Map(records.map((r) => [r.date.toISOString(), r]));

  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: { userId, status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } },
    include: { leaveType: true },
  });

  let presentDays = 0;
  let lopDays = 0;
  let lateCount = 0;
  const leaveByType: Record<string, number> = {};

  for (let d = 1; d <= totalDays; d++) {
    const date = istMidnightUTCForYMD(year, month, d);
    if (date.getTime() < employee.dateOfJoining.getTime()) continue;
    if (date.getTime() > Date.now()) continue;

    const record = recordByKey.get(date.toISOString());
    const status = record?.status ?? "ABSENT";

    if (status === "LATE") lateCount += 1;

    if (["PRESENT", "LATE", "EARLY_EXIT", "WFH", "ON_DUTY", "HOLIDAY", "WEEKLY_OFF"].includes(status)) {
      presentDays += 1;
    } else if (status === "ON_LEAVE") {
      const leave = approvedLeaves.find((l) => l.startDate.getTime() <= date.getTime() && l.endDate.getTime() >= date.getTime());
      if (leave && !leave.leaveType.isPaid) {
        lopDays += 1;
      } else {
        presentDays += 1;
      }
      if (leave) {
        leaveByType[leave.leaveType.code] = (leaveByType[leave.leaveType.code] ?? 0) + 1;
      }
    } else {
      lopDays += 1;
    }
  }

  const lateDeductionDays = Math.floor(lateCount / Math.max(org.lateMarksForHalfDay, 1)) * 0.5;
  const payableDays = Math.max(totalDays - lopDays - lateDeductionDays, 0);

  return {
    userId,
    name: employee.name,
    employeeCode: employee.employeeCode,
    payableDays: round2(payableDays),
    totalDaysInMonth: totalDays,
    presentDays,
    lopDays,
    lateDeductionDays: round2(lateDeductionDays),
    overtimeMinutes: 0,
    leaveByType,
  };
}

export async function generateMonthlyReport(year: number, month: number, actorId: string) {
  const lock = await prisma.monthLock.findUnique({ where: { year_month: { year, month } } });
  if (lock?.status === "LOCKED") {
    throw new ForbiddenError(`${year}-${month} is locked. Reopen it (HR only) before regenerating.`);
  }

  const employees = await prisma.user.findMany({ where: { status: { not: "INACTIVE" } } });
  const reports: EmployeeMonthlyReport[] = [];
  for (const employee of employees) {
    const report = await computeMonthlyReportForEmployee(employee.id, year, month);
    reports.push(report);
    await prisma.monthlyReportSnapshot.upsert({
      where: { year_month_userId: { year, month, userId: employee.id } },
      update: {
        payableDays: report.payableDays,
        leaveByType: report.leaveByType,
        lopDays: report.lopDays,
        overtimeMinutes: report.overtimeMinutes,
        lateDeductionDays: report.lateDeductionDays,
        generatedAt: new Date(),
      },
      create: {
        year,
        month,
        userId: employee.id,
        payableDays: report.payableDays,
        leaveByType: report.leaveByType,
        lopDays: report.lopDays,
        overtimeMinutes: report.overtimeMinutes,
        lateDeductionDays: report.lateDeductionDays,
      },
    });
  }

  await logAudit({ actorId, action: "MONTHLY_REPORT_GENERATED", entityType: "MonthLock", entityId: `${year}-${month}`, metadata: { count: reports.length } });
  return reports;
}

export async function lockMonth(year: number, month: number, actorId: string) {
  await generateMonthlyReport(year, month, actorId);
  const lock = await prisma.monthLock.upsert({
    where: { year_month: { year, month } },
    update: { status: "LOCKED", lockedById: actorId, lockedAt: new Date() },
    create: { year, month, status: "LOCKED", lockedById: actorId, lockedAt: new Date() },
  });
  await logAudit({ actorId, action: "MONTH_LOCKED", entityType: "MonthLock", entityId: `${year}-${month}` });
  return lock;
}

export async function reopenMonth(year: number, month: number, actorId: string, reason: string) {
  const lock = await prisma.monthLock.upsert({
    where: { year_month: { year, month } },
    update: { status: "OPEN", note: reason },
    create: { year, month, status: "OPEN", note: reason },
  });
  await logAudit({ actorId, action: "MONTH_REOPENED", entityType: "MonthLock", entityId: `${year}-${month}`, metadata: { reason } });
  return lock;
}

export function reportsToCsv(reports: EmployeeMonthlyReport[]): string {
  const leaveTypeCodes = Array.from(new Set(reports.flatMap((r) => Object.keys(r.leaveByType)))).sort();
  const header = ["Employee Code", "Name", "Payable Days", "Total Days", "LOP Days", "Late Deduction Days", "Overtime Minutes", ...leaveTypeCodes];
  const rows = reports.map((r) => [
    r.employeeCode ?? "",
    r.name,
    r.payableDays,
    r.totalDaysInMonth,
    r.lopDays,
    r.lateDeductionDays,
    r.overtimeMinutes,
    ...leaveTypeCodes.map((code) => r.leaveByType[code] ?? 0),
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value: unknown): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function reportsToExcelBuffer(reports: EmployeeMonthlyReport[], year: number, month: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${year}-${String(month).padStart(2, "0")}`);
  const leaveTypeCodes = Array.from(new Set(reports.flatMap((r) => Object.keys(r.leaveByType)))).sort();

  sheet.addRow(["Employee Code", "Name", "Payable Days", "Total Days", "LOP Days", "Late Deduction Days", "Overtime Minutes", ...leaveTypeCodes]);
  sheet.getRow(1).font = { bold: true };
  for (const r of reports) {
    sheet.addRow([r.employeeCode ?? "", r.name, r.payableDays, r.totalDaysInMonth, r.lopDays, r.lateDeductionDays, r.overtimeMinutes, ...leaveTypeCodes.map((c) => r.leaveByType[c] ?? 0)]);
  }
  sheet.columns.forEach((col) => (col.width = 18));

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
