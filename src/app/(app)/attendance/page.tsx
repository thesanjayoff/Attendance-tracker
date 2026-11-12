import { requireUser } from "../../../lib/auth/guard";
import { prisma } from "../../../lib/prisma";
import { startOfDayIST, formatDMY, formatDMYTime } from "../../../lib/date";
import { getOrganization } from "../../../server/org";
import { Card, CardTitle } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/Badge";
import { CheckInOutCard } from "./CheckInOutCard";
import { RequestForm } from "./RequestForm";

export default async function AttendancePage() {
  const user = await requireUser();
  const org = await getOrganization();
  const today = startOfDayIST(new Date());

  const [todayRecord, recent] = await Promise.all([
    prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
    prisma.attendanceRecord.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 14 }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Attendance</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Today — {formatDMY(today)}</CardTitle>
          <div className="mt-3">
            <CheckInOutCard
              checkedInAt={todayRecord?.checkInAt ? formatDMYTime(todayRecord.checkInAt) : null}
              checkedOutAt={todayRecord?.checkOutAt ? formatDMYTime(todayRecord.checkOutAt) : null}
              geofenceEnabled={org.geofenceEnabled}
            />
          </div>
        </Card>

        <Card>
          <CardTitle>Request WFH / on-duty / regularization</CardTitle>
          <div className="mt-3">
            <RequestForm />
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3">Check-out</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-white">{formatDMY(r.date)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.checkInAt ? formatDMYTime(r.checkInAt) : "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.checkOutAt ? formatDMYTime(r.checkOutAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
