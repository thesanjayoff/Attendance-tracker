import { NextResponse } from "next/server";
import { requireUser } from "../../../../../../lib/auth/guard";
import { prisma } from "../../../../../../lib/prisma";
import { reportsToExcelBuffer, type EmployeeMonthlyReport } from "../../../../../../server/reportService";

export async function GET(_request: Request, { params }: { params: Promise<{ year: string; month: string }> }) {
  await requireUser(["HR", "OWNER"]);
  const { year, month } = await params;

  const snapshots = await prisma.monthlyReportSnapshot.findMany({
    where: { year: Number(year), month: Number(month) },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  const reports: EmployeeMonthlyReport[] = snapshots.map((s) => ({
    userId: s.userId,
    name: s.user.name,
    employeeCode: s.user.employeeCode,
    payableDays: Number(s.payableDays),
    totalDaysInMonth: 0,
    presentDays: 0,
    lopDays: Number(s.lopDays),
    lateDeductionDays: Number(s.lateDeductionDays),
    overtimeMinutes: s.overtimeMinutes,
    leaveByType: s.leaveByType as Record<string, number>,
  }));

  const buffer = await reportsToExcelBuffer(reports, Number(year), Number(month));
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payroll-${year}-${month.padStart(2, "0")}.xlsx"`,
    },
  });
}
