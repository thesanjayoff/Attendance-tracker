"use client";

import { useTransition } from "react";
import { cancelLeaveAction } from "../../actions/leave";

export function CancelButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        if (!confirm("Cancel this leave request?")) return;
        startTransition(() => cancelLeaveAction(requestId));
      }}
    >
      Cancel
    </button>
  );
}
