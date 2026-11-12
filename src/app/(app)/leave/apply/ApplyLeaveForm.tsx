"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyLeaveAction, previewLeaveAction, type PreviewState } from "../../../actions/leave";
import { Button } from "../../../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../../../components/ui/Form";

export function ApplyLeaveForm({ leaveTypes }: { leaveTypes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDayType, setHalfDayType] = useState<"NONE" | "FIRST_HALF" | "SECOND_HALF">("NONE");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!leaveTypeId || !startDate || !endDate) {
      setPreview(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await previewLeaveAction({ leaveTypeId, startDate, endDate, halfDayType });
        setPreview("totalDays" in result ? result : { ...result, totalDays: 0, sandwichExtraDays: 0, currentBalance: 0, balanceAfter: 0 });
      });
    }, 350);
  }, [leaveTypeId, startDate, endDate, halfDayType]);

  const isSingleDay = startDate && startDate === endDate;

  async function onSubmit(formData: FormData) {
    setSubmitError(null);
    const result = await applyLeaveAction(undefined, formData);
    if (result?.error) {
      setSubmitError(result.error);
      return;
    }
    router.push("/leave");
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <Field label="Leave type" htmlFor="leaveTypeId">
        <Select id="leaveTypeId" name="leaveTypeId" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required>
          {leaveTypes.map((lt) => (
            <option key={lt.id} value={lt.id}>
              {lt.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From (DD/MM/YYYY)" htmlFor="startDate">
          <Input id="startDate" name="startDate" placeholder="DD/MM/YYYY" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="To (DD/MM/YYYY)" htmlFor="endDate">
          <Input id="endDate" name="endDate" placeholder="DD/MM/YYYY" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </Field>
      </div>

      {isSingleDay && (
        <Field label="Day portion" htmlFor="halfDayType">
          <Select id="halfDayType" name="halfDayType" value={halfDayType} onChange={(e) => setHalfDayType(e.target.value as typeof halfDayType)}>
            <option value="NONE">Full day</option>
            <option value="FIRST_HALF">First half</option>
            <option value="SECOND_HALF">Second half</option>
          </Select>
        </Field>
      )}
      {!isSingleDay && <input type="hidden" name="halfDayType" value="NONE" />}

      <Field label="Reason" htmlFor="reason">
        <Textarea id="reason" name="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required />
      </Field>

      {preview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Days counted</span>
            <span className="font-medium text-slate-900 dark:text-white">{preview.totalDays}</span>
          </div>
          {preview.sandwichExtraDays > 0 && (
            <div className="flex justify-between text-amber-600">
              <span>+ sandwich-rule days</span>
              <span>{preview.sandwichExtraDays}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Balance after</span>
            <span className="font-medium text-slate-900 dark:text-white">{preview.balanceAfter}</span>
          </div>
          {preview.warnings.map((w) => (
            <p key={w.code} className="mt-2 text-amber-600">⚠ {w.message}</p>
          ))}
          {preview.errors.map((e) => (
            <p key={e.code} className="mt-2 text-red-600">✕ {e.message}</p>
          ))}
        </div>
      )}

      {submitError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{submitError}</p>}

      <Button type="submit" className="w-full" disabled={pending || Boolean(preview?.errors.length)}>
        Submit request
      </Button>
    </form>
  );
}
