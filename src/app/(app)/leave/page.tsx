import Link from "next/link";
import { requireUser } from "../../../lib/auth/guard";
import { prisma } from "../../../lib/prisma";
import { formatDMY } from "../../../lib/date";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { StatusBadge } from "../../../components/ui/Badge";
import { CancelButton } from "./CancelButton";

export default async function LeavePage() {
  const user = await requireUser();
  const requests = await prisma.leaveRequest.findMany({
    where: { userId: user.id },
    orderBy: { appliedAt: "desc" },
    take: 30,
    include: { leaveType: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">My leave</h1>
        <Link href="/leave/apply">
          <Button>Apply for leave</Button>
        </Link>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Days</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-white">{r.leaveType.name}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {formatDMY(r.startDate)} {r.startDate.getTime() !== r.endDate.getTime() ? `– ${formatDMY(r.endDate)}` : ""}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.totalDays.toString()}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {["PENDING", "PENDING_LEVEL_2", "APPROVED", "ESCALATED"].includes(r.status) && <CancelButton requestId={r.id} />}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No leave requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
