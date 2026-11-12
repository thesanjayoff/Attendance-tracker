"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../lib/auth/guard";
import { parseDMY } from "../../lib/date";
import {
  createLeaveRequest,
  previewLeaveRequest,
  decideLeaveRequest,
  cancelLeaveRequest,
  ValidationFailedError,
} from "../../server/leaveService";
import type { HalfDayType } from "../../lib/rules/calendar";

export interface PreviewState {
  totalDays: number;
  sandwichExtraDays: number;
  currentBalance: number;
  balanceAfter: number;
  errors: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
}

export async function previewLeaveAction(input: {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDayType: HalfDayType;
}): Promise<PreviewState | { errors: { code: string; message: string }[]; warnings: never[] }> {
  const user = await requireUser();
  const startDate = parseDMY(input.startDate);
  const endDate = parseDMY(input.endDate);
  if (!startDate || !endDate || !input.leaveTypeId) {
    return { errors: [{ code: "INVALID_INPUT", message: "Pick a leave type and valid dates." }], warnings: [] };
  }
  return previewLeaveRequest({
    userId: user.id,
    leaveTypeId: input.leaveTypeId,
    startDate,
    endDate,
    halfDayType: input.halfDayType,
  });
}

export async function applyLeaveAction(_prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const user = await requireUser();
  const startDate = parseDMY(String(formData.get("startDate")));
  const endDate = parseDMY(String(formData.get("endDate")));
  const leaveTypeId = String(formData.get("leaveTypeId") ?? "");
  const halfDayType = String(formData.get("halfDayType") ?? "NONE") as HalfDayType;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!startDate || !endDate || !leaveTypeId || !reason) {
    return { error: "Please fill in all required fields." };
  }

  try {
    await createLeaveRequest({ userId: user.id, leaveTypeId, startDate, endDate, halfDayType, reason });
  } catch (err) {
    if (err instanceof ValidationFailedError) {
      return { error: err.issues.map((i) => i.message).join(" ") };
    }
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function decideLeaveAction(requestId: string, action: "APPROVE" | "REJECT", comment?: string) {
  const user = await requireUser();
  await decideLeaveRequest({ requestId, actorId: user.id, action, comment });
  revalidatePath("/approvals");
  revalidatePath("/leave");
}

export async function cancelLeaveAction(requestId: string, reason?: string) {
  const user = await requireUser();
  await cancelLeaveRequest({ requestId, actorId: user.id, reason });
  revalidatePath("/leave");
  revalidatePath("/dashboard");
}
