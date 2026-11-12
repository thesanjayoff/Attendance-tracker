import "server-only";
import Papa from "papaparse";
import { prisma } from "../lib/prisma";
import { startOfDayIST, dateKeyIST, istMidnightUTCForYMD, istDateTimeForYMDHM, parseDMY } from "../lib/date";
import { getOrganization, getCalendarConfig } from "./org";
import { classifyDay } from "../lib/rules/calendar";
import { evaluateCheckIn, evaluateCheckOut, isWithinGeofence, minutesFromMidnightIST, shouldApplyLateMarkDeduction } from "../lib/rules/attendance";
import { canApproveFor, ForbiddenError } from "../lib/auth/rbac";
import { notifyUser } from "../lib/notifications";
import { logAudit } from "../lib/audit";

const IMPORTABLE_STATUSES = new Set(["PRESENT", "ABSENT", "HALF_DAY", "WFH", "ON_DUTY"]);

export class GeofenceError extends Error {}

export async function checkIn(params: { userId: string; lat?: number; lng?: number }) {
  const org = await getOrganization();
  const now = new Date();
  const today = startOfDayIST(now);

  if (org.geofenceEnabled) {
    if (params.lat == null || params.lng == null) {
      throw new GeofenceError("Location is required to check in from this organization's offices.");
    }
    if (!isWithinGeofence(params.lat, params.lng, org.geofenceLat!, org.geofenceLng!, org.geofenceRadiusMeters ?? 200)) {
      throw new GeofenceError("You appear to be outside the office location.");
    }
  }

  const existing = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: params.userId, date: today } } });
  if (existing?.checkInAt) {
    throw new Error("Already checked in today.");
  }

  const evaluation = evaluateCheckIn(minutesFromMidnightIST(now), {
    shiftStartMinutes: org.shiftStartMinutes,
    shiftEndMinutes: org.shiftEndMinutes,
    graceMinutes: org.graceMinutes,
  });

  const record = await prisma.attendanceRecord.upsert({
    where: { userId_date: { userId: params.userId, date: today } },
    update: {
      checkInAt: now,
      checkInLat: params.lat,
      checkInLng: params.lng,
      status: evaluation.isLate ? "LATE" : "PRESENT",
      lateMinutes: evaluation.lateMinutes,
    },
    create: {
      userId: params.userId,
      date: today,
      checkInAt: now,
      checkInLat: params.lat,
      checkInLng: params.lng,
      status: evaluation.isLate ? "LATE" : "PRESENT",
      lateMinutes: evaluation.lateMinutes,
      source: "WEB",
    },
  });

  if (evaluation.isLate) {
    await maybeApplyLateMarkDeduction(params.userId, now);
  }

  return record;
}

export async function checkOut(params: { userId: string }) {
  const today = startOfDayIST(new Date());
  const org = await getOrganization();
  const record = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: params.userId, date: today } } });
  if (!record?.checkInAt) throw new Error("You have not checked in today.");
  if (record.checkOutAt) throw new Error("Already checked out today.");

  const now = new Date();
  const evaluation = evaluateCheckOut(minutesFromMidnightIST(record.checkInAt), minutesFromMidnightIST(now), {
    shiftStartMinutes: org.shiftStartMinutes,
    shiftEndMinutes: org.shiftEndMinutes,
    graceMinutes: org.graceMinutes,
  });

  const status = record.status === "LATE" ? "LATE" : evaluation.isEarlyExit ? "EARLY_EXIT" : "PRESENT";

  return prisma.attendanceRecord.update({
    where: { id: record.id },
    data: { checkOutAt: now, workedMinutes: evaluation.workedMinutes, status },
  });
}

async function maybeApplyLateMarkDeduction(userId: string, asOf: Date) {
  const org = await getOrganization();
  const [istYear, istMonth] = dateKeyIST(asOf).split("-").map(Number);
  const monthStart = istMidnightUTCForYMD(istYear, istMonth, 1);
  const lateCount = await prisma.attendanceRecord.count({
    where: { userId, date: { gte: monthStart }, status: "LATE" },
  });
  if (shouldApplyLateMarkDeduction(lateCount, org.lateMarksForHalfDay)) {
    await logAudit({
      actorId: null,
      action: "LATE_MARK_HALF_DAY_DEDUCTION",
      entityType: "User",
      entityId: userId,
      metadata: { lateCount, threshold: org.lateMarksForHalfDay },
    });
    // Deduction is surfaced in the monthly payroll report (lateDeductionDays);
    // no ledger entry is created here since it affects payable days, not leave balance.
  }
}

export async function requestAttendanceAction(params: {
  userId: string;
  type: "WFH" | "ON_DUTY" | "REGULARIZATION";
  date: Date;
  requestedCheckIn?: Date;
  requestedCheckOut?: Date;
  reason: string;
}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  const approverId = user.managerId ?? user.delegateId ?? user.secondApproverId ?? null;

  const request = await prisma.attendanceRequest.create({
    data: {
      userId: params.userId,
      type: params.type,
      date: startOfDayIST(params.date),
      requestedCheckIn: params.requestedCheckIn,
      requestedCheckOut: params.requestedCheckOut,
      reason: params.reason,
      currentApproverId: approverId,
    },
  });

  if (approverId) {
    await notifyUser({
      userId: approverId,
      subject: `${user.name} submitted a ${labelFor(params.type)} request`,
      body: `${user.name}: ${params.reason}`,
      link: `/approvals/attendance/${request.id}`,
    });
  }
  await logAudit({ actorId: params.userId, action: "ATTENDANCE_REQUEST_CREATED", entityType: "AttendanceRequest", entityId: request.id });
  return request;
}

function labelFor(type: string) {
  return type === "WFH" ? "work-from-home" : type === "ON_DUTY" ? "on-duty" : "attendance regularization";
}

export async function decideAttendanceRequest(params: { requestId: string; actorId: string; action: "APPROVE" | "REJECT"; comment?: string }) {
  const request = await prisma.attendanceRequest.findUniqueOrThrow({ where: { id: params.requestId }, include: { user: true } });
  if (request.status !== "PENDING") throw new Error(`Request is already ${request.status.toLowerCase()}.`);

  const actor = await prisma.user.findUniqueOrThrow({ where: { id: params.actorId } });
  if (!canApproveFor({ id: actor.id, role: actor.role }, request.user)) {
    throw new ForbiddenError("You are not an approver for this request.");
  }

  await prisma.approvalAction.create({
    data: { attendanceRequestId: request.id, actorId: actor.id, action: params.action, comment: params.comment },
  });

  if (params.action === "REJECT") {
    await prisma.attendanceRequest.update({ where: { id: request.id }, data: { status: "REJECTED", decidedAt: new Date() } });
    await notifyUser({ userId: request.userId, subject: "Request rejected", body: `Your ${labelFor(request.type)} request was rejected.` });
    return request;
  }

  const date = request.date;
  if (request.type === "WFH" || request.type === "ON_DUTY") {
    await prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: request.userId, date } },
      update: { status: request.type, isRegularized: true },
      create: { userId: request.userId, date, status: request.type, isRegularized: true, source: "MANUAL" },
    });
  } else if (request.type === "REGULARIZATION") {
    const org = await getOrganization();
    const checkIn = request.requestedCheckIn ?? undefined;
    const checkOut = request.requestedCheckOut ?? undefined;
    const evalIn = checkIn ? evaluateCheckIn(minutesFromMidnightIST(checkIn), { shiftStartMinutes: org.shiftStartMinutes, shiftEndMinutes: org.shiftEndMinutes, graceMinutes: org.graceMinutes }) : undefined;
    const evalOut = checkIn && checkOut ? evaluateCheckOut(minutesFromMidnightIST(checkIn), minutesFromMidnightIST(checkOut), { shiftStartMinutes: org.shiftStartMinutes, shiftEndMinutes: org.shiftEndMinutes, graceMinutes: org.graceMinutes }) : undefined;

    await prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: request.userId, date } },
      update: {
        checkInAt: checkIn,
        checkOutAt: checkOut,
        isRegularized: true,
        lateMinutes: evalIn?.lateMinutes ?? 0,
        workedMinutes: evalOut?.workedMinutes,
        status: evalIn?.isLate ? "LATE" : evalOut?.isEarlyExit ? "EARLY_EXIT" : "PRESENT",
      },
      create: {
        userId: request.userId,
        date,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        isRegularized: true,
        source: "MANUAL",
        status: evalIn?.isLate ? "LATE" : evalOut?.isEarlyExit ? "EARLY_EXIT" : "PRESENT",
      },
    });
  }

  await prisma.attendanceRequest.update({ where: { id: request.id }, data: { status: "APPROVED", decidedAt: new Date() } });
  await notifyUser({ userId: request.userId, subject: "Request approved", body: `Your ${labelFor(request.type)} request was approved.` });
  await logAudit({ actorId: actor.id, action: "ATTENDANCE_REQUEST_DECIDED", entityType: "AttendanceRequest", entityId: request.id, metadata: { action: params.action } });
  return request;
}

/**
 * Backfills attendance status for employees who neither checked in nor
 * have a pending request for `date` — marks holidays, weekly-offs, and
 * approved leave automatically, and anything left over as ABSENT. Intended
 * to run once per day (via a scheduled job) for the previous day.
 */
export async function finalizeDailyAttendance(date: Date) {
  const day = startOfDayIST(date);
  const dayKey = dateKeyIST(day);
  const calendar = await getCalendarConfig([day.getUTCFullYear()]);
  const dayKind = classifyDay(day, calendar);

  const employees = await prisma.user.findMany({ where: { status: { not: "INACTIVE" } } });
  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } },
  });
  const onLeaveUserIds = new Set(approvedLeaves.map((l) => l.userId));

  let created = 0;
  for (const employee of employees) {
    if (employee.dateOfJoining.getTime() > day.getTime()) continue;
    const existing = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: employee.id, date: day } } });
    if (existing) continue;

    let status: "HOLIDAY" | "WEEKLY_OFF" | "ON_LEAVE" | "ABSENT" = "ABSENT";
    if (onLeaveUserIds.has(employee.id)) status = "ON_LEAVE";
    else if (dayKind === "HOLIDAY") status = "HOLIDAY";
    else if (dayKind === "WEEKLY_OFF") status = "WEEKLY_OFF";

    await prisma.attendanceRecord.create({ data: { userId: employee.id, date: day, status, source: "MANUAL" } });
    created += 1;
  }

  await logAudit({ actorId: null, action: "ATTENDANCE_FINALIZED", entityType: "Date", entityId: dayKey, metadata: { created } });
  return created;
}

export interface AttendanceImportRowError {
  row: number;
  message: string;
}

export interface AttendanceImportResult {
  imported: number;
  errors: AttendanceImportRowError[];
}

/**
 * Bulk-imports historical attendance from a CSV (e.g. exported from a
 * biometric device or a legacy system). Expected header columns:
 *   employeeCode, date (DD/MM/YYYY), status (optional), checkIn (HH:MM, optional), checkOut (HH:MM, optional)
 * `status` must be one of PRESENT/ABSENT/HALF_DAY/WFH/ON_DUTY when given —
 * ON_LEAVE/HOLIDAY/WEEKLY_OFF are derived elsewhere and are rejected here to
 * avoid an import silently disagreeing with the leave ledger or calendar.
 * Rows targeting an already-locked payroll month are rejected, not silently
 * skipped, so the operator knows to reopen the month first if that is intended.
 */
export async function importAttendanceCsv(csvText: string, actorId: string): Promise<AttendanceImportResult> {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const errors: AttendanceImportRowError[] = [];
  let imported = 0;

  const employeesByCode = new Map((await prisma.user.findMany()).map((u) => [u.employeeCode, u]));
  const lockedMonths = new Set(
    (await prisma.monthLock.findMany({ where: { status: "LOCKED" } })).map((l) => `${l.year}-${l.month}`)
  );
  const org = await getOrganization();

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2; // header is row 1
    const employeeCode = (row.employeeCode ?? "").trim();
    const employee = employeesByCode.get(employeeCode);
    if (!employee) {
      errors.push({ row: rowNum, message: `No employee found with code "${employeeCode}".` });
      continue;
    }

    const date = parseDMY((row.date ?? "").trim());
    if (!date) {
      errors.push({ row: rowNum, message: `Invalid date "${row.date}" (expected DD/MM/YYYY).` });
      continue;
    }

    const [istYear, istMonth] = dateKeyIST(date).split("-").map(Number);
    if (lockedMonths.has(`${istYear}-${istMonth}`)) {
      errors.push({ row: rowNum, message: `${row.date} falls in a locked payroll month — reopen it first.` });
      continue;
    }

    const explicitStatus = (row.status ?? "").trim().toUpperCase();
    if (explicitStatus && !IMPORTABLE_STATUSES.has(explicitStatus)) {
      errors.push({ row: rowNum, message: `Status "${row.status}" is not importable (use PRESENT, ABSENT, HALF_DAY, WFH, or ON_DUTY).` });
      continue;
    }

    let checkInAt: Date | undefined;
    let checkOutAt: Date | undefined;
    try {
      checkInAt = parseHHMM(row.checkIn, date);
      checkOutAt = parseHHMM(row.checkOut, date);
    } catch {
      errors.push({ row: rowNum, message: `Invalid time "${row.checkIn || row.checkOut}" (expected HH:MM, 24-hour).` });
      continue;
    }

    const evalIn = checkInAt
      ? evaluateCheckIn(minutesFromMidnightIST(checkInAt), { shiftStartMinutes: org.shiftStartMinutes, shiftEndMinutes: org.shiftEndMinutes, graceMinutes: org.graceMinutes })
      : undefined;
    const evalOut =
      checkInAt && checkOutAt
        ? evaluateCheckOut(minutesFromMidnightIST(checkInAt), minutesFromMidnightIST(checkOutAt), { shiftStartMinutes: org.shiftStartMinutes, shiftEndMinutes: org.shiftEndMinutes, graceMinutes: org.graceMinutes })
        : undefined;

    const status = explicitStatus || (evalIn?.isLate ? "LATE" : evalOut?.isEarlyExit ? "EARLY_EXIT" : checkInAt ? "PRESENT" : "ABSENT");

    await prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: employee.id, date } },
      update: {
        checkInAt,
        checkOutAt,
        status: status as "PRESENT" | "ABSENT" | "HALF_DAY" | "WFH" | "ON_DUTY" | "LATE" | "EARLY_EXIT",
        lateMinutes: evalIn?.lateMinutes ?? 0,
        workedMinutes: evalOut?.workedMinutes,
        isRegularized: true,
        source: "IMPORT",
      },
      create: {
        userId: employee.id,
        date,
        checkInAt,
        checkOutAt,
        status: status as "PRESENT" | "ABSENT" | "HALF_DAY" | "WFH" | "ON_DUTY" | "LATE" | "EARLY_EXIT",
        lateMinutes: evalIn?.lateMinutes ?? 0,
        workedMinutes: evalOut?.workedMinutes,
        isRegularized: true,
        source: "IMPORT",
      },
    });
    imported += 1;
  }

  await logAudit({ actorId, action: "ATTENDANCE_IMPORTED", entityType: "System", metadata: { imported, errorCount: errors.length } });
  return { imported, errors };
}

function parseHHMM(value: string | undefined, date: Date): Date | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!m) throw new Error("bad time");
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error("bad time");
  const [year, month, day] = dateKeyIST(date).split("-").map(Number);
  return istDateTimeForYMDHM(year, month, day, hour, minute);
}
