"use client";

import { useActionState, useState } from "react";
import { requestAttendanceAction } from "../../actions/attendance";
import { Button } from "../../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../../components/ui/Form";

export function RequestForm() {
  const [state, formAction, pending] = useActionState(requestAttendanceAction, undefined);
  const [type, setType] = useState<"WFH" | "ON_DUTY" | "REGULARIZATION">("WFH");

  return (
    <form action={formAction} className="space-y-3">
      <Field label="Request type" htmlFor="type">
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="WFH">Work from home</option>
          <option value="ON_DUTY">On duty</option>
          <option value="REGULARIZATION">Attendance regularization</option>
        </Select>
      </Field>
      <Field label="Date (DD/MM/YYYY)" htmlFor="date">
        <Input id="date" name="date" placeholder="DD/MM/YYYY" required />
      </Field>
      {type === "REGULARIZATION" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Correct check-in (HH:MM)" htmlFor="requestedCheckIn">
            <Input id="requestedCheckIn" name="requestedCheckIn" placeholder="09:30" />
          </Field>
          <Field label="Correct check-out (HH:MM)" htmlFor="requestedCheckOut">
            <Input id="requestedCheckOut" name="requestedCheckOut" placeholder="18:30" />
          </Field>
        </div>
      )}
      <Field label="Reason" htmlFor="reason">
        <Textarea id="reason" name="reason" rows={2} required />
      </Field>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">Request submitted.</p>}
      <Button type="submit" className="w-full" variant="secondary" disabled={pending}>
        Submit request
      </Button>
    </form>
  );
}
