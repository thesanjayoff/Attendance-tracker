import { requireUser } from "../../../../lib/auth/guard";
import { prisma } from "../../../../lib/prisma";
import { formatDMY } from "../../../../lib/date";
import { Card, CardTitle } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Field, Input } from "../../../../components/ui/Form";
import { Badge } from "../../../../components/ui/Badge";
import { createHolidayAction, deleteHolidayAction } from "../../../actions/admin";

export default async function HolidaysPage() {
  await requireUser(["HR", "OWNER"]);
  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Holiday calendar</h1>

      <Card>
        <CardTitle>Add holiday</CardTitle>
        <form action={createHolidayAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required />
          </Field>
          <Field label="Date (DD/MM/YYYY)" htmlFor="date">
            <Input id="date" name="date" placeholder="DD/MM/YYYY" required />
          </Field>
          <Field label="Location" htmlFor="location">
            <Input id="location" name="location" defaultValue="All" placeholder="All, Tamil Nadu, …" />
          </Field>
          <Field label=" " htmlFor="isOptional">
            <label className="flex items-center gap-2 py-2 text-sm text-slate-700 dark:text-slate-300">
              <input id="isOptional" name="isOptional" type="checkbox" /> Optional / restricted holiday
            </label>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Add holiday</Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-white">{formatDMY(h.date)}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{h.name}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{h.location}</td>
                <td className="px-4 py-3">{h.isOptional && <Badge tone="info">Optional</Badge>}</td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteHolidayAction.bind(null, h.id)}>
                    <button className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
