import { requireUser } from "../../../lib/auth/guard";
import { prisma } from "../../../lib/prisma";
import { formatDMY } from "../../../lib/date";
import { Card, CardTitle } from "../../../components/ui/Card";
import { LeaveApprovalActions, AttendanceApprovalActions } from "./ApprovalActions";

const ACTIVE = ["PENDING", "PENDING_LEVEL_2", "ESCALATED"] as const;

export default async function ApprovalsPage() {
  const user = await requireUser(["MANAGER", "HR", "OWNER"]);

  const isElevated = user.role === "HR" || user.role === "OWNER";
  const leaveWhere = isElevated ? { status: { in: [...ACTIVE] } } : { status: { in: [...ACTIVE] }, currentApproverId: user.id };
  const attendanceWhere = isElevated ? { status: "PENDING" as const } : { status: "PENDING" as const, currentApproverId: user.id };

  const [leaveRequests, attendanceRequests] = await Promise.all([
    prisma.leaveRequest.findMany({ where: leaveWhere, include: { user: true, leaveType: true }, orderBy: { appliedAt: "asc" } }),
    prisma.attendanceRequest.findMany({ where: attendanceWhere, include: { user: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Approvals</h1>

      <Card>
        <CardTitle>Leave requests</CardTitle>
        <div className="mt-3 space-y-3">
          {leaveRequests.length === 0 && <p className="text-sm text-slate-500">Nothing pending.</p>}
          {leaveRequests.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{r.user.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {r.leaveType.name} · {formatDMY(r.startDate)}
                  {r.startDate.getTime() !== r.endDate.getTime() ? ` – ${formatDMY(r.endDate)}` : ""} · {r.totalDays.toString()} day(s)
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{r.reason}</p>
              </div>
              <LeaveApprovalActions requestId={r.id} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Attendance requests</CardTitle>
        <div className="mt-3 space-y-3">
          {attendanceRequests.length === 0 && <p className="text-sm text-slate-500">Nothing pending.</p>}
          {attendanceRequests.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{r.user.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {r.type.replaceAll("_", " ")} · {formatDMY(r.date)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{r.reason}</p>
              </div>
              <AttendanceApprovalActions requestId={r.id} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
