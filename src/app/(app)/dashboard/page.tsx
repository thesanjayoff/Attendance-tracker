import Link from "next/link";
import { requireUser } from "../../../lib/auth/guard";
import { prisma } from "../../../lib/prisma";
import { getOrCreateLeaveYear } from "../../../server/leaveYear";
import { computeBalanceFor } from "../../../lib/rules/balance";
import { formatDMY, startOfDayIST } from "../../../lib/date";
import { StatTile, Card, CardTitle } from "../../../components/ui/Card";
import { StatusBadge, Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { getUnusualPatternFlags } from "../../../server/analytics";

export default async function DashboardPage() {
  const user = await requireUser();
  const today = startOfDayIST(new Date());
  const leaveYear = await getOrCreateLeaveYear(today);

  const [leaveTypes, ledgerEntries, myUpcomingLeave, upcomingHolidays, todayAttendance, myPendingCount] = await Promise.all([
    prisma.leaveType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.leaveLedgerEntry.findMany({ where: { userId: user.id, leaveYearId: leaveYear.id } }),
    prisma.leaveRequest.findMany({
      where: { userId: user.id, status: "APPROVED", endDate: { gte: today } },
      orderBy: { startDate: "asc" },
      take: 5,
      include: { leaveType: true },
    }),
    prisma.holiday.findMany({ where: { date: { gte: today } }, orderBy: { date: "asc" }, take: 5 }),
    prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
    prisma.leaveRequest.count({ where: { userId: user.id, status: { in: ["PENDING", "PENDING_LEVEL_2", "ESCALATED"] } } }),
  ]);

  const balances = leaveTypes.map((lt) => ({
    ...lt,
    balance: computeBalanceFor(
      ledgerEntries.map((e) => ({ leaveTypeId: e.leaveTypeId, leaveYearId: e.leaveYearId, amount: Number(e.amount) })),
      lt.id,
      leaveYear.id
    ),
  }));

  const isApprover = ["MANAGER", "HR", "OWNER"].includes(user.role);
  const isHR = ["HR", "OWNER"].includes(user.role);

  let pendingApprovals = 0;
  let teamToday: { name: string; status: string }[] = [];
  if (isApprover) {
    pendingApprovals = await prisma.leaveRequest.count({ where: { currentApproverId: user.id, status: { in: ["PENDING", "PENDING_LEVEL_2", "ESCALATED"] } } });
    const reports = await prisma.user.findMany({ where: { managerId: user.id }, select: { id: true, name: true } });
    const records = await prisma.attendanceRecord.findMany({ where: { userId: { in: reports.map((r) => r.id) }, date: today } });
    teamToday = reports.map((r) => ({ name: r.name, status: records.find((rec) => rec.userId === r.id)?.status ?? "ABSENT" }));
  }

  let orgStats: { totalEmployees: number; onLeaveToday: number; absentToday: number } | null = null;
  if (isHR) {
    const [totalEmployees, onLeaveToday, absentToday] = await Promise.all([
      prisma.user.count({ where: { status: { not: "INACTIVE" } } }),
      prisma.attendanceRecord.count({ where: { date: today, status: "ON_LEAVE" } }),
      prisma.attendanceRecord.count({ where: { date: today, status: "ABSENT" } }),
    ]);
    orgStats = { totalEmployees, onLeaveToday, absentToday };
  }

  const patternFlags = isHR ? await getUnusualPatternFlags() : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Hi, {user.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{formatDMY(today)}</p>
        </div>
        <Link href="/leave/apply">
          <Button>Apply for leave</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Today" value={todayAttendance?.status.replaceAll("_", " ") ?? "Not checked in"} />
        <StatTile label="Pending requests" value={myPendingCount} />
        {isApprover && <StatTile label="Pending approvals" value={pendingApprovals} hint="Awaiting your action" />}
        {orgStats && <StatTile label="Employees" value={orgStats.totalEmployees} />}
        {orgStats && <StatTile label="On leave today" value={orgStats.onLeaveToday} />}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Leave balances ({leaveYear.label})</CardTitle>
          <div className="mt-3 space-y-2">
            {balances.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">{b.name}</span>
                <span className="font-semibold text-slate-900 dark:text-white">{b.balance} days</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Upcoming holidays</CardTitle>
          <div className="mt-3 space-y-2">
            {upcomingHolidays.length === 0 && <p className="text-sm text-slate-500">No upcoming holidays on record.</p>}
            {upcomingHolidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">{h.name}</span>
                <span className="text-slate-500 dark:text-slate-400">{formatDMY(h.date)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>My upcoming leave</CardTitle>
          <div className="mt-3 space-y-2">
            {myUpcomingLeave.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled.</p>}
            {myUpcomingLeave.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">{l.leaveType.name}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {formatDMY(l.startDate)} – {formatDMY(l.endDate)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {isApprover && (
          <Card>
            <CardTitle>My team today</CardTitle>
            <div className="mt-3 space-y-2">
              {teamToday.length === 0 && <p className="text-sm text-slate-500">No direct reports.</p>}
              {teamToday.map((t) => (
                <div key={t.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{t.name}</span>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {isHR && patternFlags.length > 0 && (
        <Card>
          <CardTitle>Worth a look</CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Patterns over the last 90 days that may be worth a conversation — not a judgement, just a signal.
          </p>
          <div className="mt-3 space-y-3">
            {patternFlags.map((p) => (
              <div key={p.userId} className="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.flags.map((f) => (
                    <Badge key={f.code} tone="warning">
                      {f.message}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
