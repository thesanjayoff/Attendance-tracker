import { requireUser } from "../../../../lib/auth/guard";
import { Card, CardTitle } from "../../../../components/ui/Card";
import { ImportForm } from "./ImportForm";

export default async function AttendanceImportPage() {
  await requireUser(["HR", "OWNER"]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Import attendance</h1>

      <Card>
        <CardTitle>Expected CSV format</CardTitle>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Header row required, with these columns:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
employeeCode,date,status,checkIn,checkOut{"\n"}
EMP005,15/06/2026,,09:15,18:30{"\n"}
EMP006,15/06/2026,WFH,,
        </pre>
        <ul className="mt-2 list-inside list-disc text-xs text-slate-500 dark:text-slate-400">
          <li><code>date</code> is DD/MM/YYYY.</li>
          <li><code>status</code> is optional — leave blank to derive PRESENT/LATE/EARLY_EXIT from check-in/out
            times, or set explicitly to PRESENT, ABSENT, HALF_DAY, WFH, or ON_DUTY.</li>
          <li><code>checkIn</code>/<code>checkOut</code> are optional, 24-hour HH:MM.</li>
          <li>Rows for an already-locked payroll month are rejected — reopen the month first.</li>
          <li>Re-importing the same employeeCode + date overwrites that day&apos;s record.</li>
        </ul>
      </Card>

      <Card>
        <CardTitle>Upload CSV</CardTitle>
        <ImportForm />
      </Card>
    </div>
  );
}
