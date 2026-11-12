import { notFound } from "next/navigation";
import { requireUser } from "../../../../lib/auth/guard";
import { prisma } from "../../../../lib/prisma";
import { canApproveFor } from "../../../../lib/auth/rbac";
import { formatDMY, formatDMYTime } from "../../../../lib/date";
import { Card, CardTitle } from "../../../../components/ui/Card";
import { StatusBadge } from "../../../../components/ui/Badge";
import { LeaveApprovalActions } from "../ApprovalActions";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(["MANAGER", "HR", "OWNER"]);

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: true, leaveType: true, approvalActions: { include: { actor: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!request) notFound();

  const canAct = canApproveFor({ id: user.id, role: user.role }, request.user) && ["PENDING", "PENDING_LEVEL_2", "ESCALATED"].includes(request.status);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Leave request</h1>
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-slate-900 dark:text-white">{request.user.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{request.leaveType.name}</p>
          </div>
          <StatusBadge status={request.status} />
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Dates" value={`${formatDMY(request.startDate)} – ${formatDMY(request.endDate)}`} />
          <Row label="Days" value={request.totalDays.toString()} />
          <Row label="Reason" value={request.reason} />
          <Row label="Applied" value={formatDMYTime(request.appliedAt)} />
        </dl>
        {canAct && (
          <div className="mt-4">
            <LeaveApprovalActions requestId={request.id} />
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>History</CardTitle>
        <div className="mt-3 space-y-2 text-sm">
          {request.approvalActions.length === 0 && <p className="text-slate-500">No actions yet.</p>}
          {request.approvalActions.map((a) => (
            <div key={a.id} className="flex justify-between">
              <span className="text-slate-700 dark:text-slate-300">
                {a.actor?.name ?? "System"} — {a.action.replaceAll("_", " ")}
                {a.comment ? `: ${a.comment}` : ""}
              </span>
              <span className="text-slate-400">{formatDMYTime(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}
