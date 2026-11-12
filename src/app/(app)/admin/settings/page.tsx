import { requireUser } from "../../../../lib/auth/guard";
import { getOrganization } from "../../../../server/org";
import { Card, CardTitle } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Field, Input, Select } from "../../../../components/ui/Form";
import { updateOrgSettingsAction } from "../../../actions/admin";
import { RunJobsButton } from "./RunJobsButton";

export default async function SettingsPage() {
  await requireUser(["HR", "OWNER"]);
  const org = await getOrganization();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Organization settings</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        These are policy configuration values, not legal advice — confirm against applicable Indian labour law for your state before relying on them.
      </p>

      <form action={updateOrgSettingsAction} className="space-y-4">
        <Card>
          <CardTitle>General</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Company name" htmlFor="name">
              <Input id="name" name="name" defaultValue={org.name} />
            </Field>
            <Field label="Leave year" htmlFor="leaveYearType">
              <Select id="leaveYearType" name="leaveYearType" defaultValue={org.leaveYearType}>
                <option value="CALENDAR">Calendar year (Jan–Dec)</option>
                <option value="FINANCIAL">Financial year (Apr–Mar)</option>
              </Select>
            </Field>
            <Field label="Financial year start month (1-12)" htmlFor="financialYearStartMonth">
              <Input id="financialYearStartMonth" name="financialYearStartMonth" type="number" min={1} max={12} defaultValue={org.financialYearStartMonth} />
            </Field>
            <Field label="Backdated leave limit (days)" htmlFor="backdatedLeaveLimitDays">
              <Input id="backdatedLeaveLimitDays" name="backdatedLeaveLimitDays" type="number" defaultValue={org.backdatedLeaveLimitDays} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Leave rules</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 sm:col-span-2">
              <input type="checkbox" name="sandwichLeaveRule" defaultChecked={org.sandwichLeaveRule} /> Sandwich rule (charge weekend/holiday gaps between two leave requests)
            </label>
            <Field label="Max team members off together" htmlFor="defaultTeamCoverageMax">
              <Input id="defaultTeamCoverageMax" name="defaultTeamCoverageMax" type="number" defaultValue={org.defaultTeamCoverageMax ?? ""} placeholder="unlimited" />
            </Field>
            <Field label="Team coverage enforcement" htmlFor="teamCoverageEnforcement">
              <Select id="teamCoverageEnforcement" name="teamCoverageEnforcement" defaultValue={org.teamCoverageEnforcement}>
                <option value="WARN">Warn only</option>
                <option value="BLOCK">Block</option>
              </Select>
            </Field>
            <Field label="Approval escalation (hours)" htmlFor="escalationHours">
              <Input id="escalationHours" name="escalationHours" type="number" defaultValue={org.escalationHours} />
            </Field>
            <Field label="Comp-off expiry (days)" htmlFor="compOffExpiryDays">
              <Input id="compOffExpiryDays" name="compOffExpiryDays" type="number" defaultValue={org.compOffExpiryDays} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Attendance</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Shift start (minutes from midnight)" htmlFor="shiftStartMinutes">
              <Input id="shiftStartMinutes" name="shiftStartMinutes" type="number" defaultValue={org.shiftStartMinutes} />
            </Field>
            <Field label="Shift end (minutes from midnight)" htmlFor="shiftEndMinutes">
              <Input id="shiftEndMinutes" name="shiftEndMinutes" type="number" defaultValue={org.shiftEndMinutes} />
            </Field>
            <Field label="Grace period (minutes)" htmlFor="graceMinutes">
              <Input id="graceMinutes" name="graceMinutes" type="number" defaultValue={org.graceMinutes} />
            </Field>
            <Field label="Late marks for half-day deduction" htmlFor="lateMarksForHalfDay">
              <Input id="lateMarksForHalfDay" name="lateMarksForHalfDay" type="number" defaultValue={org.lateMarksForHalfDay} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 sm:col-span-2">
              <input type="checkbox" name="geofenceEnabled" defaultChecked={org.geofenceEnabled} /> Require office geofence for check-in
            </label>
            <Field label="Office latitude" htmlFor="geofenceLat">
              <Input id="geofenceLat" name="geofenceLat" type="number" step="0.000001" defaultValue={org.geofenceLat ?? ""} />
            </Field>
            <Field label="Office longitude" htmlFor="geofenceLng">
              <Input id="geofenceLng" name="geofenceLng" type="number" step="0.000001" defaultValue={org.geofenceLng ?? ""} />
            </Field>
            <Field label="Geofence radius (meters)" htmlFor="geofenceRadiusMeters">
              <Input id="geofenceRadiusMeters" name="geofenceRadiusMeters" type="number" defaultValue={org.geofenceRadiusMeters ?? 200} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Notifications &amp; extras</CardTitle>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="notifyEmailEnabled" defaultChecked={org.notifyEmailEnabled} /> Email notifications (needs SMTP_* in .env)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="notifyTelegramEnabled" defaultChecked={org.notifyTelegramEnabled} /> Telegram notifications (needs TELEGRAM_BOT_TOKEN)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="notifyWhatsappEnabled" defaultChecked={org.notifyWhatsappEnabled} /> WhatsApp notifications (not wired up — see README)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="birthdaysEnabled" defaultChecked={org.birthdaysEnabled} /> Show birthdays
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="anniversariesEnabled" defaultChecked={org.anniversariesEnabled} /> Show work anniversaries
            </label>
          </div>
        </Card>

        <Button type="submit">Save settings</Button>
      </form>

      <Card>
        <CardTitle>Periodic jobs</CardTitle>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Accrual, comp-off expiry, carry-forward expiry, and attendance backfill normally run on a schedule (see README for the cron/Task Scheduler setup). Trigger them manually here if needed.
        </p>
        <div className="mt-3">
          <RunJobsButton />
        </div>
      </Card>
    </div>
  );
}
