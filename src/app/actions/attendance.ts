"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../lib/auth/guard";
import { parseDMY } from "../../lib/date";
import { checkIn, checkOut, requestAttendanceAction as requestAttendanceService, decideAttendanceRequest } from "../../server/attendanceService";

export async function checkInAction(coords?: { lat: number; lng: number }) {
  const user = await requireUser();
  await checkIn({ userId: user.id, lat: coords?.lat, lng: coords?.lng });
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

export async function checkOutAction() {
  const user = await requireUser();
  await checkOut({ userId: user.id });
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

export async function requestAttendanceAction(_prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const user = await requireUser();
  const type = String(formData.get("type") ?? "") as "WFH" | "ON_DUTY" | "REGULARIZATION";
  const date = parseDMY(String(formData.get("date") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  const checkInTimeStr = String(formData.get("requestedCheckIn") ?? "");
  const checkOutTimeStr = String(formData.get("requestedCheckOut") ?? "");

  if (!date || !reason) return { error: "Please fill in all required fields." };

  const requestedCheckIn = date && checkInTimeStr ? combineDateAndTime(date, checkInTimeStr) : undefined;
  const requestedCheckOut = date && checkOutTimeStr ? combineDateAndTime(date, checkOutTimeStr) : undefined;

  try {
    await requestAttendanceService({ userId: user.id, type, date, requestedCheckIn, requestedCheckOut, reason });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
  revalidatePath("/attendance");
  return { success: true };
}

/** `date` is IST midnight (as a UTC instant); adding h:m as real-time deltas lands on that IST day's h:m. */
function combineDateAndTime(date: Date, time: string): Date | undefined {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  const result = new Date(date.getTime());
  result.setUTCHours(result.getUTCHours() + h, result.getUTCMinutes() + m);
  return result;
}

export async function decideAttendanceAction(requestId: string, action: "APPROVE" | "REJECT", comment?: string) {
  const user = await requireUser();
  await decideAttendanceRequest({ requestId, actorId: user.id, action, comment });
  revalidatePath("/approvals");
}
