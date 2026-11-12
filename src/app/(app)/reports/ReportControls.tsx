"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateReportAction, lockMonthAction, reopenMonthAction } from "../../actions/admin";
import { Button } from "../../../components/ui/Button";

export function ReportControls({ year, month, isLocked }: { year: number; month: number; isLocked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeMonth(delta: number) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    router.push(`/reports?year=${date.getUTCFullYear()}&month=${date.getUTCMonth() + 1}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" onClick={() => changeMonth(-1)}>← Prev month</Button>
      <Button size="sm" variant="ghost" onClick={() => changeMonth(1)}>Next month →</Button>

      <Button
        size="sm"
        variant="secondary"
        disabled={pending || isLocked}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await generateReportAction(year, month);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to generate.");
            }
          })
        }
      >
        Generate / refresh report
      </Button>

      <a href={`/api/reports/${year}/${month}/csv`}>
        <Button size="sm" variant="secondary">Export CSV</Button>
      </a>
      <a href={`/api/reports/${year}/${month}/xlsx`}>
        <Button size="sm" variant="secondary">Export Excel</Button>
      </a>

      {!isLocked ? (
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Lock ${month}/${year}? Changes after locking will need to be logged and re-approved.`)) return;
            startTransition(async () => {
              await lockMonthAction(year, month);
              router.refresh();
            });
          }}
        >
          Lock month
        </Button>
      ) : (
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => {
            const reason = prompt("Reason for reopening this month:");
            if (!reason) return;
            startTransition(async () => {
              await reopenMonthAction(year, month, reason);
              router.refresh();
            });
          }}
        >
          Reopen month
        </Button>
      )}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
