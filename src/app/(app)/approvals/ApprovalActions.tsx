"use client";

import { useTransition } from "react";
import { decideLeaveAction } from "../../actions/leave";
import { decideAttendanceAction } from "../../actions/attendance";
import { Button } from "../../../components/ui/Button";

export function LeaveApprovalActions({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => startTransition(() => decideLeaveAction(requestId, "APPROVE"))}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => {
          const comment = prompt("Reason for rejection (optional):") ?? undefined;
          startTransition(() => decideLeaveAction(requestId, "REJECT", comment));
        }}
      >
        Reject
      </Button>
    </div>
  );
}

export function AttendanceApprovalActions({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => startTransition(() => decideAttendanceAction(requestId, "APPROVE"))}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => {
          const comment = prompt("Reason for rejection (optional):") ?? undefined;
          startTransition(() => decideAttendanceAction(requestId, "REJECT", comment));
        }}
      >
        Reject
      </Button>
    </div>
  );
}
