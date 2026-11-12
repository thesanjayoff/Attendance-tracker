"use client";

import { useState, useTransition } from "react";
import { runPeriodicJobsAction } from "../../../actions/admin";
import { Button } from "../../../../components/ui/Button";

export function RunJobsButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await runPeriodicJobsAction();
            setResult(`Accrued: ${r.upfront + r.monthly} ledger entries · Comp-offs expired: ${r.compOffExpired} · Carry-forward expired: ${r.carryForwardExpired} · Attendance backfilled: ${r.attendanceFinalized}`);
          })
        }
      >
        {pending ? "Running…" : "Run periodic jobs now"}
      </Button>
      {result && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{result}</p>}
    </div>
  );
}
