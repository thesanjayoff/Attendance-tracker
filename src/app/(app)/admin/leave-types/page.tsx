import { requireUser } from "../../../../lib/auth/guard";
import { prisma } from "../../../../lib/prisma";
import { Card, CardTitle } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Field, Input, Select } from "../../../../components/ui/Form";
import { Badge } from "../../../../components/ui/Badge";
import { upsertLeaveTypeAction } from "../../../actions/admin";

export default async function LeaveTypesPage() {
  await requireUser(["HR", "OWNER"]);
  const leaveTypes = await prisma.leaveType.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Leave types</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Policy settings only — not legal advice. Confirm leave entitlements against applicable state and central law for your company.
      </p>

      <Card>
        <CardTitle>Add leave type</CardTitle>
        <form action={upsertLeaveTypeAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required />
          </Field>
          <Field label="Code" htmlFor="code">
            <Input id="code" name="code" placeholder="CL, SL, EL…" required />
          </Field>
          <Field label="Accrual method" htmlFor="accrualMethod">
            <Select id="accrualMethod" name="accrualMethod" defaultValue="UPFRONT">
              <option value="UPFRONT">Upfront (full quota at year start)</option>
              <option value="MONTHLY">Monthly</option>
              <option value="PER_DAY_WORKED">Per day worked</option>
            </Select>
          </Field>
          <Field label="Yearly quota (days)" htmlFor="yearlyQuotaDays">
            <Input id="yearlyQuotaDays" name="yearlyQuotaDays" type="number" step="0.5" defaultValue="0" />
          </Field>
          <Field label="Carry-forward limit (days)" htmlFor="carryForwardLimitDays">
            <Input id="carryForwardLimitDays" name="carryForwardLimitDays" type="number" step="0.5" defaultValue="0" />
          </Field>
          <Field label="Carry-forward expiry (months)" htmlFor="expiryMonthsAfterYear">
            <Input id="expiryMonthsAfterYear" name="expiryMonthsAfterYear" type="number" placeholder="e.g. 3" />
          </Field>
          <Field label="Max consecutive days" htmlFor="maxConsecutiveDays">
            <Input id="maxConsecutiveDays" name="maxConsecutiveDays" type="number" placeholder="unlimited" />
          </Field>
          <Field label="Minimum notice (days)" htmlFor="minNoticeDays">
            <Input id="minNoticeDays" name="minNoticeDays" type="number" defaultValue="0" />
          </Field>
          <Field label="Require document after (days)" htmlFor="requiresDocAfterDays">
            <Input id="requiresDocAfterDays" name="requiresDocAfterDays" type="number" placeholder="e.g. 3" />
          </Field>
          <Field label="Negative balance limit (days)" htmlFor="negativeBalanceLimit">
            <Input id="negativeBalanceLimit" name="negativeBalanceLimit" type="number" step="0.5" defaultValue="0" />
          </Field>
          <Field label="Applicable gender" htmlFor="applicableGender">
            <Select id="applicableGender" name="applicableGender" defaultValue="ALL">
              <option value="ALL">All</option>
              <option value="MALE">Male only</option>
              <option value="FEMALE">Female only</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-3">
            <Checkbox name="countWeekendsInRange" label="Count weekends in range" />
            <Checkbox name="countHolidaysInRange" label="Count holidays in range" />
            <Checkbox name="allowNegativeBalance" label="Allow negative balance" />
            <Checkbox name="isPaid" label="Paid leave" defaultChecked />
            <Checkbox name="availableDuringProbation" label="Available during probation" defaultChecked />
            <Checkbox name="active" label="Active" defaultChecked />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Save leave type</Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Accrual</th>
              <th className="px-4 py-3">Quota</th>
              <th className="px-4 py-3">Carry-fwd</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {leaveTypes.map((lt) => (
              <tr key={lt.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-white">{lt.name} <span className="text-slate-400">({lt.code})</span></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{lt.accrualMethod.replaceAll("_", " ")}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{lt.yearlyQuotaDays.toString()}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{lt.carryForwardLimitDays.toString()}</td>
                <td className="px-4 py-3">{lt.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Checkbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} /> {label}
    </label>
  );
}
