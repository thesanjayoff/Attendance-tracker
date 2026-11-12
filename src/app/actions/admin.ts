"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requireUser } from "../../lib/auth/guard";
import { parseDMY } from "../../lib/date";
import { hashPassword, checkPasswordPolicy } from "../../lib/auth/password";
import { logAudit } from "../../lib/audit";
import { runUpfrontAllocation, runMonthlyAccrual, runLeaveYearRollover, runCarryForwardExpiryCheck } from "../../server/accrualService";
import { expireStaleCompOffs } from "../../server/compOffService";
import { finalizeDailyAttendance, importAttendanceCsv, type AttendanceImportResult } from "../../server/attendanceService";
import { lockMonth, reopenMonth, generateMonthlyReport } from "../../server/reportService";

const HR_ROLES = ["HR", "OWNER"] as const;

export async function createHolidayAction(formData: FormData) {
  const actor = await requireUser([...HR_ROLES]);
  const date = parseDMY(String(formData.get("date") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "All").trim() || "All";
  const isOptional = formData.get("isOptional") === "on";
  if (!date || !name) return;

  await prisma.holiday.create({ data: { date, name, location, isOptional, year: date.getUTCFullYear() } });
  await logAudit({ actorId: actor.id, action: "HOLIDAY_CREATED", entityType: "Holiday", metadata: { name } });
  revalidatePath("/admin/holidays");
}

export async function deleteHolidayAction(id: string) {
  const actor = await requireUser([...HR_ROLES]);
  await prisma.holiday.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "HOLIDAY_DELETED", entityType: "Holiday", entityId: id });
  revalidatePath("/admin/holidays");
}

export async function upsertLeaveTypeAction(formData: FormData) {
  const actor = await requireUser([...HR_ROLES]);
  const id = String(formData.get("id") ?? "") || undefined;
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    accrualMethod: String(formData.get("accrualMethod") ?? "UPFRONT") as "UPFRONT" | "MONTHLY" | "PER_DAY_WORKED",
    yearlyQuotaDays: Number(formData.get("yearlyQuotaDays") ?? 0),
    carryForwardLimitDays: Number(formData.get("carryForwardLimitDays") ?? 0),
    expiryMonthsAfterYear: formData.get("expiryMonthsAfterYear") ? Number(formData.get("expiryMonthsAfterYear")) : null,
    maxConsecutiveDays: formData.get("maxConsecutiveDays") ? Number(formData.get("maxConsecutiveDays")) : null,
    minNoticeDays: Number(formData.get("minNoticeDays") ?? 0),
    requiresDocAfterDays: formData.get("requiresDocAfterDays") ? Number(formData.get("requiresDocAfterDays")) : null,
    countWeekendsInRange: formData.get("countWeekendsInRange") === "on",
    countHolidaysInRange: formData.get("countHolidaysInRange") === "on",
    allowNegativeBalance: formData.get("allowNegativeBalance") === "on",
    negativeBalanceLimit: Number(formData.get("negativeBalanceLimit") ?? 0),
    isPaid: formData.get("isPaid") === "on",
    applicableGender: String(formData.get("applicableGender") ?? "ALL") as "ALL" | "MALE" | "FEMALE",
    availableDuringProbation: formData.get("availableDuringProbation") === "on",
    active: formData.get("active") === "on",
  };

  if (id) {
    await prisma.leaveType.update({ where: { id }, data });
  } else {
    await prisma.leaveType.create({ data });
  }
  await logAudit({ actorId: actor.id, action: id ? "LEAVE_TYPE_UPDATED" : "LEAVE_TYPE_CREATED", entityType: "LeaveType", entityId: id, metadata: { name: data.name } });
  revalidatePath("/admin/leave-types");
}

export async function createEmployeeAction(formData: FormData) {
  const actor = await requireUser([...HR_ROLES]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const policy = checkPasswordPolicy(password);
  if (!policy.valid) return;

  const dateOfJoining = parseDMY(String(formData.get("dateOfJoining") ?? ""));
  if (!dateOfJoining) return;

  const passwordHash = await hashPassword(password);
  const employee = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: String(formData.get("name") ?? "").trim(),
      role: String(formData.get("role") ?? "EMPLOYEE") as "EMPLOYEE" | "MANAGER" | "HR" | "OWNER",
      employeeCode: String(formData.get("employeeCode") ?? "").trim() || null,
      department: String(formData.get("department") ?? "").trim() || null,
      designation: String(formData.get("designation") ?? "").trim() || null,
      gender: String(formData.get("gender") ?? "UNSPECIFIED") as "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED",
      dateOfJoining,
      managerId: String(formData.get("managerId") ?? "") || null,
      secondApproverId: String(formData.get("secondApproverId") ?? "") || null,
      delegateId: String(formData.get("delegateId") ?? "") || null,
      status: "ACTIVE",
    },
  });
  await logAudit({ actorId: actor.id, action: "EMPLOYEE_CREATED", entityType: "User", entityId: employee.id });
  revalidatePath("/admin/employees");
}

export async function updateOrgSettingsAction(formData: FormData) {
  const actor = await requireUser([...HR_ROLES]);
  await prisma.organization.update({
    where: { id: 1 },
    data: {
      name: String(formData.get("name") ?? "My Company"),
      leaveYearType: String(formData.get("leaveYearType") ?? "CALENDAR") as "CALENDAR" | "FINANCIAL",
      financialYearStartMonth: Number(formData.get("financialYearStartMonth") ?? 4),
      sandwichLeaveRule: formData.get("sandwichLeaveRule") === "on",
      defaultTeamCoverageMax: formData.get("defaultTeamCoverageMax") ? Number(formData.get("defaultTeamCoverageMax")) : null,
      teamCoverageEnforcement: String(formData.get("teamCoverageEnforcement") ?? "WARN"),
      escalationHours: Number(formData.get("escalationHours") ?? 48),
      backdatedLeaveLimitDays: Number(formData.get("backdatedLeaveLimitDays") ?? 2),
      shiftStartMinutes: Number(formData.get("shiftStartMinutes") ?? 570),
      shiftEndMinutes: Number(formData.get("shiftEndMinutes") ?? 1110),
      graceMinutes: Number(formData.get("graceMinutes") ?? 10),
      lateMarksForHalfDay: Number(formData.get("lateMarksForHalfDay") ?? 3),
      compOffExpiryDays: Number(formData.get("compOffExpiryDays") ?? 90),
      geofenceEnabled: formData.get("geofenceEnabled") === "on",
      geofenceLat: formData.get("geofenceLat") ? Number(formData.get("geofenceLat")) : null,
      geofenceLng: formData.get("geofenceLng") ? Number(formData.get("geofenceLng")) : null,
      geofenceRadiusMeters: formData.get("geofenceRadiusMeters") ? Number(formData.get("geofenceRadiusMeters")) : 200,
      notifyEmailEnabled: formData.get("notifyEmailEnabled") === "on",
      notifyTelegramEnabled: formData.get("notifyTelegramEnabled") === "on",
      notifyWhatsappEnabled: formData.get("notifyWhatsappEnabled") === "on",
      birthdaysEnabled: formData.get("birthdaysEnabled") === "on",
      anniversariesEnabled: formData.get("anniversariesEnabled") === "on",
    },
  });
  await logAudit({ actorId: actor.id, action: "ORG_SETTINGS_UPDATED", entityType: "Organization", entityId: "1" });
  revalidatePath("/admin/settings");
}

export async function runPeriodicJobsAction() {
  const actor = await requireUser([...HR_ROLES]);
  const now = new Date();
  const results = {
    upfront: await runUpfrontAllocation(now),
    monthly: await runMonthlyAccrual(now),
    compOffExpired: await expireStaleCompOffs(),
    carryForwardExpired: await runCarryForwardExpiryCheck(now),
    attendanceFinalized: await finalizeDailyAttendance(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
  };
  await logAudit({ actorId: actor.id, action: "PERIODIC_JOBS_RUN_MANUALLY", entityType: "System", metadata: results });
  revalidatePath("/admin/settings");
  return results;
}

export async function runLeaveYearRolloverAction(oldYearEnd: string, newYearStart: string) {
  const actor = await requireUser([...HR_ROLES]);
  const oldEnd = parseDMY(oldYearEnd);
  const newStart = parseDMY(newYearStart);
  if (!oldEnd || !newStart) return;
  const count = await runLeaveYearRollover(oldEnd, newStart);
  await logAudit({ actorId: actor.id, action: "LEAVE_YEAR_ROLLOVER_RUN_MANUALLY", entityType: "System", metadata: { count } });
  return count;
}

export async function generateReportAction(year: number, month: number) {
  const actor = await requireUser([...HR_ROLES]);
  return generateMonthlyReport(year, month, actor.id);
}

export async function lockMonthAction(year: number, month: number) {
  const actor = await requireUser([...HR_ROLES]);
  await lockMonth(year, month, actor.id);
  revalidatePath("/reports");
}

export async function reopenMonthAction(year: number, month: number, reason: string) {
  const actor = await requireUser([...HR_ROLES]);
  await reopenMonth(year, month, actor.id, reason);
  revalidatePath("/reports");
}

export type ImportAttendanceCsvState = ({ ok: true } & AttendanceImportResult) | { ok: false; error: string };

export async function importAttendanceCsvAction(
  _prevState: ImportAttendanceCsvState | null,
  formData: FormData
): Promise<ImportAttendanceCsvState> {
  const actor = await requireUser([...HR_ROLES]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV file to import." };
  }
  const csvText = await file.text();
  const result = await importAttendanceCsv(csvText, actor.id);
  revalidatePath("/admin/attendance-import");
  return { ok: true, ...result };
}
