import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth/guard";
import { prisma } from "../../../../lib/prisma";
import { logAudit } from "../../../../lib/audit";

/** Self-service personal data export (privacy requirement: employees can see/export what's held on them). */
export async function GET() {
  const user = await requireUser();

  const [profile, leaveRequests, ledgerEntries, attendanceRecords, attendanceRequests, compOffs, notifications] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, employeeCode: true, department: true, designation: true, gender: true, dateOfJoining: true, status: true, createdAt: true },
    }),
    prisma.leaveRequest.findMany({ where: { userId: user.id }, include: { leaveType: { select: { name: true, code: true } } } }),
    prisma.leaveLedgerEntry.findMany({ where: { userId: user.id } }),
    prisma.attendanceRecord.findMany({ where: { userId: user.id } }),
    prisma.attendanceRequest.findMany({ where: { userId: user.id } }),
    prisma.compOffCredit.findMany({ where: { userId: user.id } }),
    prisma.inAppNotification.findMany({ where: { userId: user.id } }),
  ]);

  await logAudit({ actorId: user.id, action: "SELF_DATA_EXPORTED", entityType: "User", entityId: user.id });

  const payload = { exportedAt: new Date().toISOString(), profile, leaveRequests, ledgerEntries, attendanceRecords, attendanceRequests, compOffs, notifications };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="my-data-export.json"`,
    },
  });
}
