import "server-only";
import { prisma } from "../lib/prisma";
import { dateKeyIST } from "../lib/date";
import type { CalendarConfig } from "../lib/rules/calendar";

export async function getOrganization() {
  const org = await prisma.organization.findUnique({ where: { id: 1 } });
  if (!org) throw new Error("Organization settings have not been initialized. Run the seed script.");
  return org;
}

export async function getCalendarConfig(yearsNeeded: number[]): Promise<CalendarConfig> {
  const org = await getOrganization();
  const holidays = await prisma.holiday.findMany({ where: { year: { in: yearsNeeded } } });
  return {
    weeklyOffDays: org.weeklyOffDays,
    holidayDateKeys: new Set(holidays.map((h) => dateKeyIST(h.date))),
  };
}
