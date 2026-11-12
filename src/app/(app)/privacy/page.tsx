import { requireUser } from "../../../lib/auth/guard";
import { getOrganization } from "../../../server/org";
import { Card, CardTitle } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

export default async function PrivacyPage() {
  await requireUser();
  const org = await getOrganization();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Your data</h1>

      <Card>
        <CardTitle>What we collect, and why</CardTitle>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Profile details (name, email, department, designation, date of joining) — to identify you and route approvals correctly.</li>
          <li>Leave requests and the leave ledger — to compute accurate balances and keep an auditable history of every change.</li>
          <li>Attendance check-in/out times, and if your organization enables it, your location at check-in only — to record attendance and, where applicable, confirm you checked in from the office. Location is never tracked continuously.</li>
          <li>Approval actions and comments — so decisions on your requests have a clear record.</li>
          <li>Login sessions and security logs — to keep the system secure and auditable.</li>
        </ul>
      </Card>

      <Card>
        <CardTitle>Who can see it</CardTitle>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Only you, your manager (and second-level approver/delegate where configured), and HR/organization admins can see your records. Every access to another
          employee&apos;s data is logged.
        </p>
      </Card>

      <Card>
        <CardTitle>Retention</CardTitle>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Records are currently retained for {org.dataRetentionYears} year(s), configurable by HR/Owner in Settings. Contact HR if you have questions about deletion.
        </p>
      </Card>

      <Card>
        <CardTitle>Export your data</CardTitle>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Download everything held about you as a JSON file.</p>
        <a href="/api/me/export" className="mt-3 inline-block">
          <Button variant="secondary">Download my data</Button>
        </a>
      </Card>
    </div>
  );
}
