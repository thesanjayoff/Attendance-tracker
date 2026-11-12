import "server-only";
import { prisma } from "../lib/prisma";
import { startOfDayIST, formatDMY } from "../lib/date";
import { getOrganization } from "./org";
import { getOrCreateLeaveYear } from "./leaveYear";
import { pickCompOffsFIFO } from "../lib/rules/compoff";
import { notifyUser } from "../lib/notifications";
import { logAudit } from "../lib/audit";

const COMP_OFF_LEAVE_TYPE_CODE = "COMPOFF";

/**
 * Comp-off balance is tracked two ways that are kept in sync: the
 * CompOffCredit table (one row per earned day, so FIFO expiry can be
 * tracked individually) and a mirrored entry on the unified leave ledger
 * against the "Comp-Off" leave type (so it previews/applies/approves
 * through the exact same flow as any other leave type).
 */
export async function earnCompOff(params: { userId: string; earnedDate: Date; actorId: string; note?: string }) {
  const org = await getOrganization();
  const earnedDate = startOfDayIST(params.earnedDate);
  const expiryDate = new Date(earnedDate.getTime() + org.compOffExpiryDays * 24 * 60 * 60 * 1000);

  const credit = await prisma.compOffCredit.create({
    data: { userId: params.userId, earnedDate, expiryDate, note: params.note },
  });

  const compOffType = await prisma.leaveType.findUnique({ where: { code: COMP_OFF_LEAVE_TYPE_CODE } });
  if (compOffType) {
    const leaveYear = await getOrCreateLeaveYear(earnedDate);
    await prisma.leaveLedgerEntry.create({
      data: {
        userId: params.userId,
        leaveTypeId: compOffType.id,
        leaveYearId: leaveYear.id,
        amount: 1,
        entryType: "COMP_OFF_CREDIT",
        note: `Earned for working on ${formatDMY(earnedDate)}`,
        actorId: params.actorId,
      },
    });
  }

  await notifyUser({
    userId: params.userId,
    subject: "Comp-off credited",
    body: `You've earned a comp-off for working on ${formatDMY(earnedDate)}. It expires on ${formatDMY(expiryDate)}.`,
  });
  await logAudit({ actorId: params.actorId, action: "COMP_OFF_CREDITED", entityType: "CompOffCredit", entityId: credit.id });
  return credit;
}

export async function getAvailableCompOffs(userId: string) {
  const credits = await prisma.compOffCredit.findMany({ where: { userId, status: "AVAILABLE" }, orderBy: { earnedDate: "asc" } });
  const now = new Date();
  return credits.filter((c) => c.expiryDate.getTime() >= now.getTime());
}

/** Marks expired comp-offs as EXPIRED and mirrors the debit onto the ledger. Intended to run daily. */
export async function expireStaleCompOffs() {
  const now = new Date();
  const expiring = await prisma.compOffCredit.findMany({ where: { status: "AVAILABLE", expiryDate: { lt: now } } });
  if (expiring.length === 0) return 0;

  const compOffType = await prisma.leaveType.findUnique({ where: { code: COMP_OFF_LEAVE_TYPE_CODE } });
  const owner = compOffType ? await prisma.user.findFirstOrThrow({ where: { role: "OWNER" }, orderBy: { createdAt: "asc" } }) : null;

  for (const credit of expiring) {
    if (compOffType && owner) {
      const leaveYear = await getOrCreateLeaveYear(credit.earnedDate);
      await prisma.leaveLedgerEntry.create({
        data: {
          userId: credit.userId,
          leaveTypeId: compOffType.id,
          leaveYearId: leaveYear.id,
          amount: -1,
          entryType: "COMP_OFF_EXPIRY",
          note: `Comp-off earned ${formatDMY(credit.earnedDate)} expired unused`,
          actorId: owner.id,
        },
      });
    }
  }

  const result = await prisma.compOffCredit.updateMany({
    where: { id: { in: expiring.map((c) => c.id) } },
    data: { status: "EXPIRED" },
  });
  await logAudit({ actorId: null, action: "COMP_OFF_EXPIRED", entityType: "CompOffCredit", metadata: { count: result.count } });
  return result.count;
}

/** Consumes comp-off credits (FIFO) to cover `daysNeeded` against a leave request. */
export async function consumeCompOffsForRequest(params: { userId: string; leaveRequestId: string; daysNeeded: number }) {
  const credits = await getAvailableCompOffs(params.userId);
  const { usable, shortfall } = pickCompOffsFIFO(credits, params.daysNeeded, new Date());
  if (shortfall > 0) {
    throw new Error(`Not enough comp-off balance: short by ${shortfall} day(s).`);
  }
  await prisma.compOffCredit.updateMany({
    where: { id: { in: usable.map((c) => c.id) } },
    data: { status: "USED", usedInRequestId: params.leaveRequestId },
  });
  return usable.length;
}
