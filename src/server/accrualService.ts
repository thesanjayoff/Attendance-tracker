import "server-only";
import { prisma } from "../lib/prisma";
import { dateKeyIST, istMidnightUTCForYMD } from "../lib/date";
import { getOrganization } from "./org";
import { getOrCreateLeaveYear } from "./leaveYear";
import { computeCarryForward, computeCarryForwardExpiry, computeMonthlyAccrualAmount, computeUpfrontAllocation } from "../lib/rules/accrual";
import { getLeaveYearBounds } from "../lib/rules/leaveYear";
import { computeBalanceFor } from "../lib/rules/balance";
import { logAudit } from "../lib/audit";

const SYSTEM_ACTOR = "SYSTEM";

async function systemActorId(): Promise<string> {
  // HR/OWNER accounts created by the seed always exist; ledger entries still
  // need a real actor id for the FK, so periodic jobs attribute to the
  // earliest OWNER account and tag the note with "(system)".
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" }, orderBy: { createdAt: "asc" } });
  return owner.id;
}

/** Upfront allocation: run once per leave year per employee per UPFRONT leave type. */
export async function runUpfrontAllocation(forDate: Date) {
  const org = await getOrganization();
  const leaveYear = await getOrCreateLeaveYear(forDate);
  const actorId = await systemActorId();
  const leaveTypes = await prisma.leaveType.findMany({ where: { active: true, accrualMethod: "UPFRONT" } });
  const employees = await prisma.user.findMany({ where: { status: { not: "INACTIVE" } } });

  let created = 0;
  for (const leaveType of leaveTypes) {
    for (const employee of employees) {
      const already = await prisma.leaveLedgerEntry.findFirst({
        where: { userId: employee.id, leaveTypeId: leaveType.id, leaveYearId: leaveYear.id, entryType: "ACCRUAL" },
      });
      if (already) continue;

      const bounds = getLeaveYearBounds(org.leaveYearType, org.financialYearStartMonth, forDate);
      const amount = computeUpfrontAllocation(Number(leaveType.yearlyQuotaDays), bounds, employee.dateOfJoining);
      if (amount <= 0) continue;

      await prisma.leaveLedgerEntry.create({
        data: {
          userId: employee.id,
          leaveTypeId: leaveType.id,
          leaveYearId: leaveYear.id,
          amount,
          entryType: "ACCRUAL",
          note: `Upfront allocation for ${leaveYear.label} (${SYSTEM_ACTOR})`,
          actorId,
        },
      });
      created += 1;
    }
  }
  await logAudit({ actorId: null, action: "UPFRONT_ACCRUAL_RUN", entityType: "LeaveYear", entityId: leaveYear.id, metadata: { created } });
  return created;
}

/** Monthly accrual: run once per calendar month per employee per MONTHLY leave type. */
export async function runMonthlyAccrual(forDate: Date) {
  const leaveYear = await getOrCreateLeaveYear(forDate);
  const actorId = await systemActorId();
  const [istYear, istMonth] = dateKeyIST(forDate).split("-").map(Number);
  const monthStart = istMidnightUTCForYMD(istYear, istMonth, 1);
  const daysInThisMonth = new Date(Date.UTC(istYear, istMonth, 0)).getUTCDate();
  const monthEnd = istMidnightUTCForYMD(istYear, istMonth, daysInThisMonth);
  const monthTag = `${istYear}-${String(istMonth).padStart(2, "0")}`;

  const leaveTypes = await prisma.leaveType.findMany({ where: { active: true, accrualMethod: "MONTHLY" } });
  const employees = await prisma.user.findMany({ where: { status: { not: "INACTIVE" } } });

  let created = 0;
  for (const leaveType of leaveTypes) {
    for (const employee of employees) {
      const tagNote = `Monthly accrual ${monthTag}`;
      const already = await prisma.leaveLedgerEntry.findFirst({
        where: { userId: employee.id, leaveTypeId: leaveType.id, leaveYearId: leaveYear.id, entryType: "ACCRUAL", note: tagNote },
      });
      if (already) continue;

      const amount = computeMonthlyAccrualAmount(Number(leaveType.yearlyQuotaDays), monthStart, monthEnd, employee.dateOfJoining);
      if (amount <= 0) continue;

      await prisma.leaveLedgerEntry.create({
        data: {
          userId: employee.id,
          leaveTypeId: leaveType.id,
          leaveYearId: leaveYear.id,
          amount,
          entryType: "ACCRUAL",
          note: tagNote,
          actorId,
        },
      });
      created += 1;
    }
  }
  await logAudit({ actorId: null, action: "MONTHLY_ACCRUAL_RUN", entityType: "LeaveYear", entityId: leaveYear.id, metadata: { monthTag, created } });
  return created;
}

/** Leave-year rollover: cap+carry each employee's balance into the new leave year. */
export async function runLeaveYearRollover(oldYearEnd: Date, newYearStart: Date) {
  const actorId = await systemActorId();
  const oldYear = await getOrCreateLeaveYear(oldYearEnd);
  const newYear = await getOrCreateLeaveYear(newYearStart);
  const leaveTypes = await prisma.leaveType.findMany({ where: { active: true } });
  const employees = await prisma.user.findMany({ where: { status: { not: "INACTIVE" } } });

  let processed = 0;
  for (const leaveType of leaveTypes) {
    for (const employee of employees) {
      const alreadyRolled = await prisma.leaveLedgerEntry.findFirst({
        where: { userId: employee.id, leaveTypeId: leaveType.id, leaveYearId: newYear.id, entryType: "CARRY_FORWARD" },
      });
      if (alreadyRolled) continue;

      const entries = await prisma.leaveLedgerEntry.findMany({
        where: { userId: employee.id, leaveTypeId: leaveType.id, leaveYearId: oldYear.id },
      });
      const balance = computeBalanceFor(
        entries.map((e) => ({ leaveTypeId: e.leaveTypeId, leaveYearId: e.leaveYearId, amount: Number(e.amount) })),
        leaveType.id,
        oldYear.id
      );
      if (balance <= 0) continue;

      const { carriedForward, expiredImmediately } = computeCarryForward(balance, Number(leaveType.carryForwardLimitDays));

      if (expiredImmediately > 0) {
        await prisma.leaveLedgerEntry.create({
          data: {
            userId: employee.id,
            leaveTypeId: leaveType.id,
            leaveYearId: oldYear.id,
            amount: -expiredImmediately,
            entryType: "EXPIRY",
            note: `Forfeited at ${oldYear.label} year-end (over carry-forward limit)`,
            actorId,
          },
        });
      }
      if (carriedForward > 0) {
        await prisma.leaveLedgerEntry.create({
          data: {
            userId: employee.id,
            leaveTypeId: leaveType.id,
            leaveYearId: newYear.id,
            amount: carriedForward,
            entryType: "CARRY_FORWARD",
            note: `Carried forward from ${oldYear.label}`,
            actorId,
          },
        });
      }
      processed += 1;
    }
  }
  await logAudit({ actorId: null, action: "LEAVE_YEAR_ROLLOVER", entityType: "LeaveYear", entityId: newYear.id, metadata: { processed } });
  return processed;
}

/** Expires any carried-forward balance still unused after its leave type's expiry window. */
export async function runCarryForwardExpiryCheck(now: Date) {
  const actorId = await systemActorId();
  const leaveTypes = await prisma.leaveType.findMany({ where: { active: true, expiryMonthsAfterYear: { not: null } } });
  let expiredCount = 0;

  for (const leaveType of leaveTypes) {
    const carryForwardEntries = await prisma.leaveLedgerEntry.findMany({
      where: { leaveTypeId: leaveType.id, entryType: "CARRY_FORWARD" },
      include: { leaveYear: true },
    });

    for (const cf of carryForwardEntries) {
      const expiryDate = new Date(cf.leaveYear.startDate);
      expiryDate.setUTCMonth(expiryDate.getUTCMonth() + leaveType.expiryMonthsAfterYear!);
      if (now.getTime() < expiryDate.getTime()) continue;

      const alreadyExpired = await prisma.leaveLedgerEntry.findFirst({
        where: { userId: cf.userId, leaveTypeId: leaveType.id, leaveYearId: cf.leaveYearId, entryType: "EXPIRY", note: { contains: "carry-forward expiry" } },
      });
      if (alreadyExpired) continue;

      const usageSince = await prisma.leaveLedgerEntry.aggregate({
        where: { userId: cf.userId, leaveTypeId: leaveType.id, leaveYearId: cf.leaveYearId, entryType: "USAGE", date: { gte: cf.leaveYear.startDate } },
        _sum: { amount: true },
      });
      const usedSinceRollover = Math.abs(Number(usageSince._sum.amount ?? 0));
      const toExpire = computeCarryForwardExpiry(Number(cf.amount), usedSinceRollover, now, expiryDate);
      if (toExpire <= 0) continue;

      await prisma.leaveLedgerEntry.create({
        data: {
          userId: cf.userId,
          leaveTypeId: leaveType.id,
          leaveYearId: cf.leaveYearId,
          amount: -toExpire,
          entryType: "EXPIRY",
          note: `carry-forward expiry: unused carried-forward balance expired`,
          actorId,
        },
      });
      expiredCount += 1;
    }
  }
  await logAudit({ actorId: null, action: "CARRY_FORWARD_EXPIRY_RUN", entityType: "LeaveType", metadata: { expiredCount } });
  return expiredCount;
}
