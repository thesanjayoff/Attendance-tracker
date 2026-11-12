import "server-only";
import { prisma } from "../lib/prisma";
import { getOrganization, getCalendarConfig } from "./org";
import { getOrCreateLeaveYear } from "./leaveYear";
import { countLeaveDays, computeSandwichGapDays, type HalfDayType } from "../lib/rules/calendar";
import { computeBalanceFor } from "../lib/rules/balance";
import { validateLeaveRequest, type ExistingRequestRange } from "../lib/rules/validate";
import { canApproveFor } from "../lib/auth/rbac";
import { notifyUser } from "../lib/notifications";
import { logAudit } from "../lib/audit";
import { formatDMY } from "../lib/date";
import { ForbiddenError } from "../lib/auth/rbac";

const ACTIVE_STATUSES = ["PENDING", "PENDING_LEVEL_2", "APPROVED", "ESCALATED"] as const;

export class ValidationFailedError extends Error {
  constructor(public issues: { code: string; message: string }[]) {
    super(issues.map((i) => i.message).join(" "));
    this.name = "ValidationFailedError";
  }
}

export interface LeavePreviewInput {
  userId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  halfDayType: HalfDayType;
  excludeRequestId?: string;
  allowBackdatedOverride?: boolean;
}

export interface LeavePreviewResult {
  totalDays: number;
  sandwichExtraDays: number;
  currentBalance: number;
  balanceAfter: number;
  errors: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
}

export async function previewLeaveRequest(input: LeavePreviewInput): Promise<LeavePreviewResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  const leaveType = await prisma.leaveType.findUniqueOrThrow({ where: { id: input.leaveTypeId } });
  const org = await getOrganization();

  const yearsNeeded = [input.startDate.getUTCFullYear(), input.endDate.getUTCFullYear()];
  const calendar = await getCalendarConfig(yearsNeeded);
  const leaveYear = await getOrCreateLeaveYear(input.startDate);

  const dayCount = countLeaveDays(input.startDate, input.endDate, input.halfDayType, calendar, {
    countWeekendsInRange: leaveType.countWeekendsInRange,
    countHolidaysInRange: leaveType.countHolidaysInRange,
  });

  const existingRequestsRaw = await prisma.leaveRequest.findMany({
    where: { userId: input.userId, status: { in: [...ACTIVE_STATUSES] } },
  });
  const existingRequests: ExistingRequestRange[] = existingRequestsRaw.map((r) => ({
    id: r.id,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
  }));

  // Sandwich rule: check gaps against the nearest adjacent requests on both sides.
  let sandwichExtraDays = 0;
  if (org.sandwichLeaveRule) {
    const others = existingRequestsRaw.filter((r) => r.id !== input.excludeRequestId);
    const before = others
      .filter((r) => r.endDate.getTime() < input.startDate.getTime())
      .sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0];
    const after = others
      .filter((r) => r.startDate.getTime() > input.endDate.getTime())
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];

    if (before) sandwichExtraDays += computeSandwichGapDays(before.endDate, input.startDate, calendar, true).length;
    if (after) sandwichExtraDays += computeSandwichGapDays(input.endDate, after.startDate, calendar, true).length;
  }

  const totalDays = round2(dayCount.totalDays + sandwichExtraDays);

  const ledgerEntries = await prisma.leaveLedgerEntry.findMany({
    where: { userId: input.userId, leaveTypeId: input.leaveTypeId, leaveYearId: leaveYear.id },
  });
  const ledgerBalance = computeBalanceFor(
    ledgerEntries.map((e) => ({ leaveTypeId: e.leaveTypeId, leaveYearId: e.leaveYearId, amount: Number(e.amount) })),
    input.leaveTypeId,
    leaveYear.id
  );

  const reserved = existingRequestsRaw
    .filter((r) => r.leaveTypeId === input.leaveTypeId && r.id !== input.excludeRequestId)
    .reduce((sum, r) => sum + Number(r.totalDays), 0);

  const effectiveBalance = round2(ledgerBalance - reserved);

  // Team coverage: count teammates (same department) with active leave overlapping any requested day.
  let teamCoverage;
  if (org.defaultTeamCoverageMax != null && user.department) {
    const teammates = await prisma.leaveRequest.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        user: { department: user.department, id: { not: input.userId } },
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
      },
    });
    const countByDateKey = new Map<string, number>();
    for (const t of teammates) {
      for (const d of countLeaveDays(t.startDate, t.endDate, "NONE", calendar, { countWeekendsInRange: true, countHolidaysInRange: true }).breakdown) {
        countByDateKey.set(d.dateKey, (countByDateKey.get(d.dateKey) ?? 0) + 1);
      }
    }
    teamCoverage = {
      teammateLeaveCountByDateKey: countByDateKey,
      maxConcurrent: org.defaultTeamCoverageMax,
      enforcement: org.teamCoverageEnforcement as "WARN" | "BLOCK",
    };
  }

  const result = validateLeaveRequest({
    now: new Date(),
    startDate: input.startDate,
    endDate: input.endDate,
    requestedDays: totalDays,
    excludeRequestId: input.excludeRequestId,
    employee: { gender: user.gender, status: user.status, department: user.department },
    leaveType: {
      maxConsecutiveDays: leaveType.maxConsecutiveDays,
      minNoticeDays: leaveType.minNoticeDays,
      allowNegativeBalance: leaveType.allowNegativeBalance,
      negativeBalanceLimit: Number(leaveType.negativeBalanceLimit),
      applicableGender: leaveType.applicableGender,
      availableDuringProbation: leaveType.availableDuringProbation,
    },
    currentBalance: effectiveBalance,
    existingUserRequests: existingRequests,
    backdatedLimitDays: org.backdatedLeaveLimitDays,
    allowBackdatedOverride: input.allowBackdatedOverride,
    teamCoverage,
  });

  return {
    totalDays,
    sandwichExtraDays,
    currentBalance: effectiveBalance,
    balanceAfter: round2(effectiveBalance - totalDays),
    errors: result.errors,
    warnings: result.warnings,
  };
}

export interface CreateLeaveRequestInput extends LeavePreviewInput {
  reason: string;
  documentUrl?: string;
}

export async function createLeaveRequest(input: CreateLeaveRequestInput) {
  const preview = await previewLeaveRequest(input);
  if (preview.errors.length > 0) {
    throw new ValidationFailedError(preview.errors);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  const firstApproverId = user.managerId ?? user.delegateId ?? user.secondApproverId ?? null;

  const request = await prisma.leaveRequest.create({
    data: {
      userId: input.userId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      halfDayType: input.halfDayType,
      totalDays: preview.totalDays,
      reason: input.reason,
      documentUrl: input.documentUrl,
      status: "PENDING",
      currentApproverId: firstApproverId,
    },
  });

  await logAudit({ actorId: input.userId, action: "LEAVE_REQUEST_CREATED", entityType: "LeaveRequest", entityId: request.id, metadata: { totalDays: preview.totalDays } });

  if (firstApproverId) {
    await notifyUser({
      userId: firstApproverId,
      subject: `${user.name} applied for leave`,
      body: `${user.name} applied for ${preview.totalDays} day(s) leave from ${formatDMY(input.startDate)} to ${formatDMY(input.endDate)}.`,
      link: `/approvals/${request.id}`,
    });
  }

  return request;
}

export async function decideLeaveRequest(params: {
  requestId: string;
  actorId: string;
  action: "APPROVE" | "REJECT";
  comment?: string;
}) {
  const request = await prisma.leaveRequest.findUniqueOrThrow({
    where: { id: params.requestId },
    include: { user: true, leaveType: true },
  });

  if (!["PENDING", "PENDING_LEVEL_2", "ESCALATED"].includes(request.status)) {
    throw new Error(`Request is already ${request.status.toLowerCase()}.`);
  }

  const actor = await prisma.user.findUniqueOrThrow({ where: { id: params.actorId } });
  if (!canApproveFor({ id: actor.id, role: actor.role }, request.user)) {
    throw new ForbiddenError("You are not an approver for this request.");
  }

  await prisma.approvalAction.create({
    data: { leaveRequestId: request.id, actorId: actor.id, action: params.action === "APPROVE" ? "APPROVE" : "REJECT", comment: params.comment },
  });

  if (params.action === "REJECT") {
    await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "REJECTED", decidedAt: new Date() } });
    await notifyUser({
      userId: request.userId,
      subject: "Leave request rejected",
      body: `Your leave request for ${formatDMY(request.startDate)} to ${formatDMY(request.endDate)} was rejected.${params.comment ? ` Reason: ${params.comment}` : ""}`,
      link: `/leave/${request.id}`,
    });
    await logAudit({ actorId: actor.id, action: "LEAVE_REQUEST_REJECTED", entityType: "LeaveRequest", entityId: request.id });
    return request;
  }

  const needsSecondLevel = request.status === "PENDING" && request.user.secondApproverId && request.user.secondApproverId !== actor.id;
  if (needsSecondLevel) {
    const updated = await prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status: "PENDING_LEVEL_2", currentApproverId: request.user.secondApproverId },
    });
    await notifyUser({
      userId: request.user.secondApproverId!,
      subject: `${request.user.name}'s leave needs your approval`,
      body: `${request.user.name}'s leave request for ${formatDMY(request.startDate)} to ${formatDMY(request.endDate)} needs second-level approval.`,
      link: `/approvals/${request.id}`,
    });
    await logAudit({ actorId: actor.id, action: "LEAVE_REQUEST_APPROVED_LEVEL_1", entityType: "LeaveRequest", entityId: request.id });
    return updated;
  }

  // Final approval: debit the ledger now.
  const leaveYear = await getOrCreateLeaveYear(request.startDate);
  await prisma.$transaction([
    prisma.leaveLedgerEntry.create({
      data: {
        userId: request.userId,
        leaveTypeId: request.leaveTypeId,
        leaveYearId: leaveYear.id,
        amount: Number(request.totalDays) * -1,
        entryType: "USAGE",
        note: `Leave approved: ${formatDMY(request.startDate)} - ${formatDMY(request.endDate)}`,
        actorId: actor.id,
        leaveRequestId: request.id,
      },
    }),
    prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "APPROVED", decidedAt: new Date() } }),
  ]);

  await notifyUser({
    userId: request.userId,
    subject: "Leave request approved",
    body: `Your leave request for ${formatDMY(request.startDate)} to ${formatDMY(request.endDate)} (${request.totalDays} day(s)) was approved.`,
    link: `/leave/${request.id}`,
  });
  await logAudit({ actorId: actor.id, action: "LEAVE_REQUEST_APPROVED", entityType: "LeaveRequest", entityId: request.id });
  return request;
}

export async function cancelLeaveRequest(params: { requestId: string; actorId: string; reason?: string }) {
  const request = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: params.requestId }, include: { user: true } });
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: params.actorId } });

  const isOwner = actor.id === request.userId;
  const isApprover = canApproveFor({ id: actor.id, role: actor.role }, request.user);
  if (!isOwner && !isApprover) {
    throw new ForbiddenError("You cannot cancel this request.");
  }
  if (!["PENDING", "PENDING_LEVEL_2", "APPROVED", "ESCALATED"].includes(request.status)) {
    throw new Error(`Request is already ${request.status.toLowerCase()}.`);
  }

  const statusUpdate = prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });

  if (request.status === "APPROVED") {
    const leaveYear = await getOrCreateLeaveYear(request.startDate);
    const reversal = prisma.leaveLedgerEntry.create({
      data: {
        userId: request.userId,
        leaveTypeId: request.leaveTypeId,
        leaveYearId: leaveYear.id,
        amount: Number(request.totalDays),
        entryType: "REVERSAL",
        note: `Cancelled: ${params.reason ?? "no reason given"}`,
        actorId: actor.id,
        leaveRequestId: request.id,
      },
    });
    await prisma.$transaction([reversal, statusUpdate]);
  } else {
    await statusUpdate;
  }

  await notifyUser({
    userId: request.userId,
    subject: "Leave request cancelled",
    body: `Leave for ${formatDMY(request.startDate)} to ${formatDMY(request.endDate)} was cancelled.`,
  });
  await logAudit({ actorId: actor.id, action: "LEAVE_REQUEST_CANCELLED", entityType: "LeaveRequest", entityId: request.id });
}

/** Moves stale PENDING requests to the second-level approver after the configured escalation window. */
export async function autoEscalateStaleRequests() {
  const org = await getOrganization();
  const cutoff = new Date(Date.now() - org.escalationHours * 60 * 60 * 1000);

  const stale = await prisma.leaveRequest.findMany({
    where: { status: "PENDING", appliedAt: { lte: cutoff } },
    include: { user: true },
  });

  for (const request of stale) {
    const escalateTo = request.user.secondApproverId ?? request.user.delegateId;
    if (!escalateTo) continue;
    await prisma.$transaction([
      prisma.leaveRequest.update({ where: { id: request.id }, data: { status: "ESCALATED", currentApproverId: escalateTo } }),
      prisma.approvalAction.create({ data: { leaveRequestId: request.id, actorId: null, action: "AUTO_ESCALATE" } }),
    ]);
    await notifyUser({
      userId: escalateTo,
      subject: `Escalated: ${request.user.name}'s leave request`,
      body: `No response after ${org.escalationHours}h — this leave request has been escalated to you.`,
      link: `/approvals/${request.id}`,
    });
  }

  return stale.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
