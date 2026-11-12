import "server-only";
import { prisma } from "../lib/prisma";
import { startOfDayIST, formatDMY } from "../lib/date";
import { getOrganization } from "./org";
import { pickCompOffsFIFO } from "../lib/rules/compoff";
import { notifyUser } from "../lib/notifications";
import { logAudit } from "../lib/audit";

/** Credits a comp-off for approved work on a holiday or weekly off. */
export async function earnCompOff(params: { userId: string; earnedDate: Date; actorId: string; note?: string }) {
  const org = await getOrganization();
  const earnedDate = startOfDayIST(params.earnedDate);
  const expiryDate = new Date(earnedDate.getTime() + org.compOffExpiryDays * 24 * 60 * 60 * 1000);

  const credit = await prisma.compOffCredit.create({
    data: { userId: params.userId, earnedDate, expiryDate, note: params.note },
  });

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

/** Marks expired comp-offs as EXPIRED. Intended to run daily. */
export async function expireStaleCompOffs() {
  const now = new Date();
  const result = await prisma.compOffCredit.updateMany({
    where: { status: "AVAILABLE", expiryDate: { lt: now } },
    data: { status: "EXPIRED" },
  });
  if (result.count > 0) {
    await logAudit({ actorId: null, action: "COMP_OFF_EXPIRED", entityType: "CompOffCredit", metadata: { count: result.count } });
  }
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
