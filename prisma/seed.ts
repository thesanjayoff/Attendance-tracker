/**
 * Demo seed data: an organization, policies, a Tamil Nadu holiday calendar,
 * a team of 8 with a reporting structure, ~10 months of leave/attendance
 * history, and a few live pending requests so every dashboard has something
 * to show on first run.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { istMidnightUTCForYMD, dateKeyIST } from "../src/lib/date";
import { getOrCreateLeaveYear } from "../src/server/leaveYear";
import { createLeaveRequest } from "../src/server/leaveService";
import { earnCompOff } from "../src/server/compOffService";
import { requestAttendanceAction } from "../src/server/attendanceService";

const prisma = new PrismaClient();

const TODAY = new Date();
const CURRENT_YEAR = Number(dateKeyIST(TODAY).slice(0, 4));
const DEMO_PASSWORD = "Password123";

function d(y: number, m: number, day: number) {
  return istMidnightUTCForYMD(y, m, day);
}

async function main() {
  console.log("Seeding Attendance Tracker demo data...");

  // ---------- Organization ----------
  await prisma.organization.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Marina Software Pvt Ltd",
      timezone: "Asia/Kolkata",
      leaveYearType: "CALENDAR",
      financialYearStartMonth: 4,
      sandwichLeaveRule: true,
      weeklyOffDays: [0, 6],
      defaultTeamCoverageMax: 2,
      teamCoverageEnforcement: "WARN",
      escalationHours: 48,
      backdatedLeaveLimitDays: 3,
      shiftStartMinutes: 570,
      shiftEndMinutes: 1110,
      graceMinutes: 10,
      lateMarksForHalfDay: 3,
      compOffExpiryDays: 90,
      geofenceEnabled: false,
      notifyEmailEnabled: false,
      notifyTelegramEnabled: false,
      notifyWhatsappEnabled: false,
      birthdaysEnabled: false,
      anniversariesEnabled: false,
      dataRetentionYears: 7,
    },
  });

  // ---------- Leave types ----------
  const leaveTypeDefs = [
    { name: "Casual Leave", code: "CL", accrualMethod: "UPFRONT", yearlyQuotaDays: 12, carryForwardLimitDays: 0, maxConsecutiveDays: 3, minNoticeDays: 1, sortOrder: 1 },
    { name: "Sick Leave", code: "SL", accrualMethod: "UPFRONT", yearlyQuotaDays: 12, carryForwardLimitDays: 0, requiresDocAfterDays: 3, minNoticeDays: 0, sortOrder: 2 },
    { name: "Earned Leave", code: "EL", accrualMethod: "MONTHLY", yearlyQuotaDays: 18, carryForwardLimitDays: 30, expiryMonthsAfterYear: null, minNoticeDays: 7, sortOrder: 3 },
    { name: "Comp-Off", code: "COMPOFF", accrualMethod: "UPFRONT", yearlyQuotaDays: 0, carryForwardLimitDays: 0, minNoticeDays: 0, sortOrder: 4 },
    { name: "Maternity Leave", code: "MATERNITY", accrualMethod: "UPFRONT", yearlyQuotaDays: 182, carryForwardLimitDays: 0, applicableGender: "FEMALE", minNoticeDays: 30, sortOrder: 5 },
    { name: "Paternity Leave", code: "PATERNITY", accrualMethod: "UPFRONT", yearlyQuotaDays: 15, carryForwardLimitDays: 0, applicableGender: "MALE", minNoticeDays: 7, sortOrder: 6 },
    { name: "Bereavement Leave", code: "BEREAVEMENT", accrualMethod: "UPFRONT", yearlyQuotaDays: 5, carryForwardLimitDays: 0, minNoticeDays: 0, countWeekendsInRange: true, countHolidaysInRange: true, sortOrder: 7 },
    { name: "Unpaid Leave", code: "UNPAID", accrualMethod: "UPFRONT", yearlyQuotaDays: 30, carryForwardLimitDays: 0, isPaid: false, allowNegativeBalance: true, negativeBalanceLimit: 30, minNoticeDays: 3, sortOrder: 8 },
  ] as const;

  for (const def of leaveTypeDefs) {
    await prisma.leaveType.upsert({
      where: { code: def.code },
      update: {},
      create: { ...def } as never,
    });
  }
  const leaveTypes = await prisma.leaveType.findMany();
  const lt = (code: string) => leaveTypes.find((l) => l.code === code)!;

  // ---------- Holidays (Tamil Nadu + national, approximate — verify/adjust via Admin > Holidays) ----------
  const holidayDefs: { date: Date; name: string; location?: string; isOptional?: boolean }[] = [
    { date: d(CURRENT_YEAR, 1, 1), name: "New Year's Day", isOptional: true },
    { date: d(CURRENT_YEAR, 1, 14), name: "Pongal", location: "Tamil Nadu" },
    { date: d(CURRENT_YEAR, 1, 15), name: "Thiruvalluvar Day", location: "Tamil Nadu" },
    { date: d(CURRENT_YEAR, 1, 16), name: "Uzhavar Thirunal", location: "Tamil Nadu" },
    { date: d(CURRENT_YEAR, 1, 26), name: "Republic Day" },
    { date: d(CURRENT_YEAR, 3, 4), name: "Holi", isOptional: true },
    { date: d(CURRENT_YEAR, 4, 3), name: "Good Friday", isOptional: true },
    { date: d(CURRENT_YEAR, 4, 14), name: "Puthandu (Tamil New Year)", location: "Tamil Nadu" },
    { date: d(CURRENT_YEAR, 5, 1), name: "May Day" },
    { date: d(CURRENT_YEAR, 8, 15), name: "Independence Day" },
    { date: d(CURRENT_YEAR, 9, 14), name: "Ganesh Chaturthi", isOptional: true },
    { date: d(CURRENT_YEAR, 10, 2), name: "Gandhi Jayanthi" },
    { date: d(CURRENT_YEAR, 10, 20), name: "Vijayadashami", isOptional: true },
    { date: d(CURRENT_YEAR, 11, 8), name: "Diwali" },
    { date: d(CURRENT_YEAR, 12, 25), name: "Christmas" },
    { date: d(CURRENT_YEAR + 1, 1, 1), name: "New Year's Day", isOptional: true },
    { date: d(CURRENT_YEAR + 1, 1, 14), name: "Pongal", location: "Tamil Nadu" },
    { date: d(CURRENT_YEAR + 1, 1, 26), name: "Republic Day" },
  ];
  for (const h of holidayDefs) {
    await prisma.holiday.upsert({
      where: { date_name_location: { date: h.date, name: h.name, location: h.location ?? "All" } },
      update: {},
      create: { date: h.date, name: h.name, location: h.location ?? "All", isOptional: h.isOptional ?? false, year: h.date.getUTCFullYear() },
    });
  }
  const holidayKeys = new Set(holidayDefs.map((h) => dateKeyIST(h.date)));

  // ---------- Employees ----------
  const joinedLongAgo = d(CURRENT_YEAR - 2, 6, 1);

  const owner = await upsertUser("owner@marinasoftware.test", { name: "Arun Kumar", role: "OWNER", employeeCode: "EMP001", department: "Leadership", designation: "Founder & CEO", gender: "MALE", dateOfJoining: joinedLongAgo });
  const hr = await upsertUser("hr@marinasoftware.test", { name: "Priya Sharma", role: "HR", employeeCode: "EMP002", department: "People Ops", designation: "HR Manager", gender: "FEMALE", dateOfJoining: joinedLongAgo, managerId: owner.id });
  const engManager = await upsertUser("karthik@marinasoftware.test", { name: "Karthik Raja", role: "MANAGER", employeeCode: "EMP003", department: "Engineering", designation: "Engineering Manager", gender: "MALE", dateOfJoining: joinedLongAgo, managerId: owner.id });
  const salesManager = await upsertUser("divya@marinasoftware.test", { name: "Divya Menon", role: "MANAGER", employeeCode: "EMP004", department: "Sales", designation: "Sales Manager", gender: "FEMALE", dateOfJoining: joinedLongAgo, managerId: owner.id });

  const suresh = await upsertUser("suresh@marinasoftware.test", { name: "Suresh Babu", role: "EMPLOYEE", employeeCode: "EMP005", department: "Engineering", designation: "Senior Engineer", gender: "MALE", dateOfJoining: d(CURRENT_YEAR - 1, 3, 10), managerId: engManager.id, secondApproverId: owner.id });
  const lakshmi = await upsertUser("lakshmi@marinasoftware.test", { name: "Lakshmi Narayanan", role: "EMPLOYEE", employeeCode: "EMP006", department: "Engineering", designation: "Engineer", gender: "FEMALE", dateOfJoining: d(CURRENT_YEAR - 1, 7, 15), managerId: engManager.id, delegateId: salesManager.id });
  const ramesh = await upsertUser("ramesh@marinasoftware.test", { name: "Ramesh Iyer", role: "EMPLOYEE", employeeCode: "EMP007", department: "Sales", designation: "Account Executive", gender: "MALE", dateOfJoining: d(CURRENT_YEAR - 1, 11, 1), managerId: salesManager.id });

  const probationStart = new Date(TODAY.getTime() - 60 * 24 * 60 * 60 * 1000);
  const anitha = await upsertUser("anitha@marinasoftware.test", {
    name: "Anitha Raj",
    role: "EMPLOYEE",
    employeeCode: "EMP008",
    department: "Sales",
    designation: "Sales Associate",
    gender: "FEMALE",
    dateOfJoining: istMidnightUTCForYMD(probationStart.getUTCFullYear(), probationStart.getUTCMonth() + 1, probationStart.getUTCDate()),
    managerId: salesManager.id,
    status: "PROBATION",
    probationEndAt: d(CURRENT_YEAR, 12, 31),
  });

  const employees = [owner, hr, engManager, salesManager, suresh, lakshmi, ramesh, anitha];
  console.log(`Created/updated ${employees.length} employees.`);

  // ---------- Upfront leave allocation for the current leave year ----------
  const leaveYear = await getOrCreateLeaveYear(TODAY);
  for (const emp of employees) {
    for (const code of ["CL", "SL", "MATERNITY", "PATERNITY", "BEREAVEMENT", "UNPAID"]) {
      const type = lt(code);
      if (type.applicableGender !== "ALL" && emp.gender !== type.applicableGender) continue;
      const existing = await prisma.leaveLedgerEntry.findFirst({ where: { userId: emp.id, leaveTypeId: type.id, leaveYearId: leaveYear.id, entryType: "ACCRUAL" } });
      if (existing) continue;
      await prisma.leaveLedgerEntry.create({
        data: { userId: emp.id, leaveTypeId: type.id, leaveYearId: leaveYear.id, amount: Number(type.yearlyQuotaDays), entryType: "ACCRUAL", note: `Upfront allocation for ${leaveYear.label}`, actorId: owner.id },
      });
    }
    // Earned leave: accrue 1.5/month for each month elapsed so far this year.
    const elType = lt("EL");
    const monthsElapsed = Number(dateKeyIST(TODAY).slice(5, 7));
    for (let m = 1; m <= monthsElapsed; m++) {
      const amount = Number(elType.yearlyQuotaDays) / 12;
      await prisma.leaveLedgerEntry.create({
        data: { userId: emp.id, leaveTypeId: elType.id, leaveYearId: leaveYear.id, amount, entryType: "ACCRUAL", note: `Monthly accrual ${CURRENT_YEAR}-${String(m).padStart(2, "0")}`, actorId: owner.id },
      });
    }
  }
  console.log("Seeded leave accruals.");

  // ---------- A couple of comp-offs ----------
  await earnCompOff({ userId: suresh.id, earnedDate: d(CURRENT_YEAR, 6, 7), actorId: engManager.id, note: "Worked a production release on Saturday" });
  await earnCompOff({ userId: ramesh.id, earnedDate: d(CURRENT_YEAR, 8, 16), actorId: salesManager.id, note: "Client event on a holiday" });

  // ---------- Historical approved leave (a few per employee across the year) ----------
  const historicalLeaves: { user: typeof suresh; type: string; start: Date; end: Date; reason: string }[] = [
    { user: suresh, type: "CL", start: d(CURRENT_YEAR, 2, 12), end: d(CURRENT_YEAR, 2, 12), reason: "Personal work" },
    { user: suresh, type: "SL", start: d(CURRENT_YEAR, 5, 20), end: d(CURRENT_YEAR, 5, 21), reason: "Fever" },
    { user: lakshmi, type: "CL", start: d(CURRENT_YEAR, 3, 3), end: d(CURRENT_YEAR, 3, 4), reason: "Family function" },
    { user: lakshmi, type: "EL", start: d(CURRENT_YEAR, 7, 7), end: d(CURRENT_YEAR, 7, 11), reason: "Vacation" },
    { user: ramesh, type: "SL", start: d(CURRENT_YEAR, 4, 15), end: d(CURRENT_YEAR, 4, 15), reason: "Dental appointment" },
    { user: ramesh, type: "CL", start: d(CURRENT_YEAR, 9, 1), end: d(CURRENT_YEAR, 9, 1), reason: "Personal work" },
    { user: anitha, type: "CL", start: d(CURRENT_YEAR, 10, 10), end: d(CURRENT_YEAR, 10, 10), reason: "Personal work" },
  ];
  for (const hLeave of historicalLeaves) {
    if (hLeave.start.getTime() > TODAY.getTime()) continue;
    const type = lt(hLeave.type);
    const days = Math.round((hLeave.end.getTime() - hLeave.start.getTime()) / 86400000) + 1;
    const request = await prisma.leaveRequest.create({
      data: {
        userId: hLeave.user.id,
        leaveTypeId: type.id,
        startDate: hLeave.start,
        endDate: hLeave.end,
        totalDays: days,
        reason: hLeave.reason,
        status: "APPROVED",
        appliedAt: hLeave.start,
        decidedAt: hLeave.start,
      },
    });
    await prisma.leaveLedgerEntry.create({
      data: { userId: hLeave.user.id, leaveTypeId: type.id, leaveYearId: leaveYear.id, amount: -days, entryType: "USAGE", note: "Leave approved (seed history)", actorId: hLeave.user.managerId ?? owner.id, leaveRequestId: request.id },
    });
  }
  console.log("Seeded historical leave history.");

  // ---------- Attendance history: scattered present/late/WFH/absent records ----------
  const onLeaveByEmployeeDay = new Map<string, Set<string>>();
  for (const hLeave of historicalLeaves) {
    const set = onLeaveByEmployeeDay.get(hLeave.user.id) ?? new Set<string>();
    for (let t = hLeave.start.getTime(); t <= hLeave.end.getTime(); t += 86400000) {
      set.add(dateKeyIST(new Date(t)));
    }
    onLeaveByEmployeeDay.set(hLeave.user.id, set);
  }

  let seededAttendanceDays = 0;
  for (const emp of employees) {
    let cursor = new Date(Math.max(emp.dateOfJoining.getTime(), d(CURRENT_YEAR, 1, 1).getTime()));
    const yesterday = new Date(TODAY.getTime() - 86400000);
    let seed = hashString(emp.id);
    while (cursor.getTime() <= yesterday.getTime()) {
      const key = dateKeyIST(cursor);
      const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
      const isWeeklyOff = dow === 0 || dow === 6;
      const isHoliday = holidayKeys.has(key);
      const onLeave = onLeaveByEmployeeDay.get(emp.id)?.has(key);

      if (!isWeeklyOff && !isHoliday && !onLeave) {
        seed = nextRandom(seed);
        const roll = seed % 100;
        const checkInBase = 570; // 09:30
        if (roll < 3) {
          // absent — leave no record, finalizeDailyAttendance-style backfill will mark it
        } else if (roll < 6) {
          await createAttendance(emp.id, cursor, "WFH", null, null);
        } else if (roll < 14) {
          await createAttendance(emp.id, cursor, "LATE", checkInBase + 25 + (seed % 20), 60);
        } else {
          await createAttendance(emp.id, cursor, "PRESENT", checkInBase + (seed % 8), 15);
        }
        seededAttendanceDays += 1;
      }
      cursor = new Date(cursor.getTime() + 86400000);
    }
  }
  console.log(`Seeded ${seededAttendanceDays} attendance records.`);

  // ---------- Live demo data: pending requests so dashboards aren't empty ----------
  try {
    await createLeaveRequest({
      userId: suresh.id,
      leaveTypeId: lt("CL").id,
      startDate: new Date(TODAY.getTime() + 5 * 86400000),
      endDate: new Date(TODAY.getTime() + 5 * 86400000),
      halfDayType: "NONE",
      reason: "Personal work",
    });
    await createLeaveRequest({
      userId: lakshmi.id,
      leaveTypeId: lt("EL").id,
      startDate: new Date(TODAY.getTime() + 10 * 86400000),
      endDate: new Date(TODAY.getTime() + 14 * 86400000),
      halfDayType: "NONE",
      reason: "Family trip",
    });
    await createLeaveRequest({
      userId: ramesh.id,
      leaveTypeId: lt("SL").id,
      startDate: TODAY,
      endDate: TODAY,
      halfDayType: "FIRST_HALF",
      reason: "Doctor's appointment",
    });
  } catch (err) {
    console.warn("Skipped a demo pending leave request (likely already exists):", err instanceof Error ? err.message : err);
  }

  try {
    await requestAttendanceAction({
      userId: anitha.id,
      type: "REGULARIZATION",
      date: new Date(TODAY.getTime() - 2 * 86400000),
      requestedCheckIn: new Date(TODAY.getTime() - 2 * 86400000 + 570 * 60000),
      requestedCheckOut: new Date(TODAY.getTime() - 2 * 86400000 + 1110 * 60000),
      reason: "Forgot to check out",
    });
  } catch (err) {
    console.warn("Skipped demo regularization request:", err instanceof Error ? err.message : err);
  }

  console.log("Seed complete.");
  console.log(`\nDemo login (all accounts use the same password): ${DEMO_PASSWORD}`);
  console.log("Owner:   owner@marinasoftware.test");
  console.log("HR:      hr@marinasoftware.test");
  console.log("Manager: karthik@marinasoftware.test");
  console.log("Employee: suresh@marinasoftware.test");
}

async function upsertUser(
  email: string,
  data: {
    name: string;
    role: "EMPLOYEE" | "MANAGER" | "HR" | "OWNER";
    employeeCode: string;
    department: string;
    designation: string;
    gender: "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";
    dateOfJoining: Date;
    managerId?: string;
    secondApproverId?: string;
    delegateId?: string;
    status?: "ACTIVE" | "PROBATION" | "INACTIVE";
    probationEndAt?: Date;
  }
) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, status: "ACTIVE", ...data },
  });
}

async function createAttendance(userId: string, date: Date, status: "PRESENT" | "LATE" | "WFH", checkInMinutes: number | null, workedExtraMinutes: number | null) {
  if (status === "WFH") {
    await prisma.attendanceRecord.create({ data: { userId, date, status: "WFH", source: "MANUAL" } });
    return;
  }
  const checkInAt = new Date(date.getTime() + (checkInMinutes ?? 570) * 60000);
  const workedMinutes = 510 + (workedExtraMinutes ?? 0);
  const checkOutAt = new Date(checkInAt.getTime() + workedMinutes * 60000);
  await prisma.attendanceRecord.create({
    data: {
      userId,
      date,
      checkInAt,
      checkOutAt,
      status,
      workedMinutes,
      lateMinutes: status === "LATE" ? (checkInMinutes ?? 570) - 570 : 0,
      source: "WEB",
    },
  });
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

function nextRandom(seed: number): number {
  // xorshift32 — fast, deterministic, good enough for demo data variety.
  let x = seed;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
