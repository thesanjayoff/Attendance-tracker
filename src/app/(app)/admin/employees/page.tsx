import { requireUser } from "../../../../lib/auth/guard";
import { prisma } from "../../../../lib/prisma";
import { formatDMY } from "../../../../lib/date";
import { Card, CardTitle } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Field, Input, Select } from "../../../../components/ui/Form";
import { Badge } from "../../../../components/ui/Badge";
import { createEmployeeAction } from "../../../actions/admin";

export default async function EmployeesPage() {
  await requireUser(["HR", "OWNER"]);
  const employees = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { manager: true } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Employees</h1>

      <Card>
        <CardTitle>Add employee</CardTitle>
        <form action={createEmployeeAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name">
            <Input id="name" name="name" required />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required />
          </Field>
          <Field label="Temporary password" htmlFor="password">
            <Input id="password" name="password" type="password" required minLength={10} />
          </Field>
          <Field label="Employee code" htmlFor="employeeCode">
            <Input id="employeeCode" name="employeeCode" />
          </Field>
          <Field label="Role" htmlFor="role">
            <Select id="role" name="role" defaultValue="EMPLOYEE">
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="HR">HR admin</option>
              <option value="OWNER">Owner</option>
            </Select>
          </Field>
          <Field label="Gender" htmlFor="gender">
            <Select id="gender" name="gender" defaultValue="UNSPECIFIED">
              <option value="UNSPECIFIED">Prefer not to say</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Department" htmlFor="department">
            <Input id="department" name="department" />
          </Field>
          <Field label="Designation" htmlFor="designation">
            <Input id="designation" name="designation" />
          </Field>
          <Field label="Date of joining (DD/MM/YYYY)" htmlFor="dateOfJoining">
            <Input id="dateOfJoining" name="dateOfJoining" placeholder="DD/MM/YYYY" required />
          </Field>
          <Field label="Manager" htmlFor="managerId">
            <Select id="managerId" name="managerId" defaultValue="">
              <option value="">None</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Second-level approver" htmlFor="secondApproverId">
            <Select id="secondApproverId" name="secondApproverId" defaultValue="">
              <option value="">None</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Delegate (for when manager is away)" htmlFor="delegateId">
            <Select id="delegateId" name="delegateId" defaultValue="">
              <option value="">None</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Add employee</Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-white">{e.name}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.role}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.department ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.manager?.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDMY(e.dateOfJoining)}</td>
                <td className="px-4 py-3">
                  <Badge tone={e.status === "ACTIVE" ? "success" : e.status === "PROBATION" ? "warning" : "neutral"}>{e.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
