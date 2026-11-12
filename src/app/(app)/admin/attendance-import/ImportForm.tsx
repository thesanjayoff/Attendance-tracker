"use client";

import { useActionState } from "react";
import { importAttendanceCsvAction } from "../../../actions/admin";
import { Button } from "../../../../components/ui/Button";
import { Field, Input } from "../../../../components/ui/Form";

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importAttendanceCsvAction, null);

  return (
    <form action={formAction} className="mt-3 space-y-4">
      <Field label="CSV file" htmlFor="file">
        <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Importing…" : "Import"}
      </Button>

      {state && !state.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{state.error}</p>
      )}

      {state?.ok && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <p className="font-medium text-slate-900 dark:text-white">
            Imported {state.imported} row{state.imported === 1 ? "" : "s"}.
          </p>
          {state.errors.length > 0 && (
            <>
              <p className="mt-2 text-amber-600">{state.errors.length} row(s) could not be imported:</p>
              <ul className="mt-1 max-h-64 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-slate-600 dark:text-slate-400">
                {state.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
