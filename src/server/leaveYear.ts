import "server-only";
import { prisma } from "../lib/prisma";
import { getLeaveYearBounds } from "../lib/rules/leaveYear";
import { getOrganization } from "./org";

export async function getOrCreateLeaveYear(forDate: Date) {
  const org = await getOrganization();
  const bounds = getLeaveYearBounds(org.leaveYearType, org.financialYearStartMonth, forDate);

  return prisma.leaveYear.upsert({
    where: { label: bounds.label },
    update: {},
    create: { label: bounds.label, startDate: bounds.startDate, endDate: bounds.endDate },
  });
}
