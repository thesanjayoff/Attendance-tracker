import Link from "next/link";
import { requireUser } from "../../../lib/auth/guard";
import { prisma } from "../../../lib/prisma";
import { filterVisibleEmployees } from "../../../lib/auth/rbac";
import { dateKeyIST, istMidnightUTCForYMD } from "../../../lib/date";
import { getOrganization } from "../../../server/org";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month: monthParam } = await searchParams;

  const now = new Date();
  const [year, month] = monthParam ? monthParam.split("-").map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStart = istMidnightUTCForYMD(year, month, 1);
  const monthEnd = istMidnightUTCForYMD(year, month, totalDays);

  const org = await getOrganization();
  const allEmployees = await prisma.user.findMany({ where: { status: { not: "INACTIVE" } } });
  const visibleEmployees = filterVisibleEmployees({ id: user.id, role: user.role }, allEmployees);
  const visibleIds = visibleEmployees.map((e) => e.id);

  const [leaves, holidays] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: { in: visibleIds }, status: "APPROVED", startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
      include: { user: true, leaveType: true },
    }),
    prisma.holiday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
  ]);
  const wfhOnDuty = await prisma.attendanceRecord.findMany({
    where: { userId: { in: visibleIds }, date: { gte: monthStart, lte: monthEnd }, status: { in: ["WFH", "ON_DUTY"] } },
    include: { user: true },
  });

  const holidaysByKey = new Map(holidays.map((h) => [dateKeyIST(h.date), h.name]));
  const entriesByDay = new Map<string, { name: string; kind: string }[]>();

  for (const leave of leaves) {
    for (let d = new Date(Math.max(leave.startDate.getTime(), monthStart.getTime())); d.getTime() <= Math.min(leave.endDate.getTime(), monthEnd.getTime()); d.setUTCDate(d.getUTCDate() + 1)) {
      const key = dateKeyIST(d);
      const list = entriesByDay.get(key) ?? [];
      list.push({ name: leave.user.name, kind: leave.leaveType.name });
      entriesByDay.set(key, list);
    }
  }
  for (const rec of wfhOnDuty) {
    const key = dateKeyIST(rec.date);
    const list = entriesByDay.get(key) ?? [];
    list.push({ name: rec.user.name, kind: rec.status === "WFH" ? "Work from home" : "On duty" });
    entriesByDay.set(key, list);
  }

  const firstWeekday = new Date(`${dateKeyIST(monthStart)}T00:00:00Z`).getUTCDay();
  const cells: ({ day: number; key: string } | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, key: dateKeyIST(istMidnightUTCForYMD(year, month, d)) });
  }

  const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Team calendar</h1>
        <div className="flex gap-2 text-sm">
          <Link href={`/calendar?month=${prevMonth}`} className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            ← Prev
          </Link>
          <span className="px-2 py-1.5 font-medium text-slate-900 dark:text-white">
            {new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric" })}
          </span>
          <Link href={`/calendar?month=${nextMonth}`} className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Next →
          </Link>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const holidayName = holidaysByKey.get(cell.key);
            const entries = entriesByDay.get(cell.key) ?? [];
            const isWeeklyOff = org.weeklyOffDays.includes(new Date(`${cell.key}T00:00:00Z`).getUTCDay());
            const clash = org.defaultTeamCoverageMax != null && entries.length > org.defaultTeamCoverageMax;
            return (
              <div
                key={i}
                className={`min-h-20 rounded-lg border p-1 text-left text-xs ${
                  holidayName ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20" : isWeeklyOff ? "border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40" : "border-slate-100 dark:border-slate-800"
                }`}
              >
                <div className="font-medium text-slate-700 dark:text-slate-300">{cell.day}</div>
                {holidayName && <div className="mt-0.5 truncate text-emerald-700 dark:text-emerald-400">{holidayName}</div>}
                {entries.slice(0, 2).map((e, idx) => (
                  <div key={idx} className="truncate text-indigo-700 dark:text-indigo-400">
                    {e.name.split(" ")[0]}
                  </div>
                ))}
                {entries.length > 2 && <div className="text-slate-400">+{entries.length - 2} more</div>}
                {clash && (
                  <div className="mt-0.5">
                    <Badge tone="warning">Coverage</Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
