import { requireUser } from "../../../lib/auth/guard";
import { prisma } from "../../../lib/prisma";
import { Card, CardTitle } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { ReportControls } from "./ReportControls";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  await requireUser(["HR", "OWNER"]);
  const now = new Date();
  const { year: yearParam, month: monthParam } = await searchParams;
  const year = Number(yearParam ?? now.getUTCFullYear());
  const month = Number(monthParam ?? now.getUTCMonth() + 1);

  const [lock, snapshots] = await Promise.all([
    prisma.monthLock.findUnique({ where: { year_month: { year, month } } }),
    prisma.monthlyReportSnapshot.findMany({ where: { year, month }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Monthly report</h1>
        {lock?.status === "LOCKED" ? <Badge tone="danger">Locked</Badge> : <Badge tone="success">Open</Badge>}
      </div>

      <Card>
        <CardTitle>
          {new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric" })}
        </CardTitle>
        <div className="mt-3">
          <ReportControls year={year} month={month} isLocked={lock?.status === "LOCKED"} />
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Payable days</th>
              <th className="px-4 py-3">LOP days</th>
              <th className="px-4 py-3">Late deduction</th>
              <th className="px-4 py-3">Leave taken</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-white">{s.user.name}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.payableDays.toString()}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.lopDays.toString()}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.lateDeductionDays.toString()}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                  {Object.entries(s.leaveByType as Record<string, number>)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ") || "—"}
                </td>
              </tr>
            ))}
            {snapshots.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No report generated yet for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
