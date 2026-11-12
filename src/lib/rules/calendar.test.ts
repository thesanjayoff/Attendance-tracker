import { describe, expect, it } from "vitest";
import { parseDMY } from "../date";
import { classifyDay, computeSandwichGapDays, countLeaveDays, type CalendarConfig } from "./calendar";

const d = (s: string) => parseDMY(s)!;

const baseCalendar: CalendarConfig = {
  weeklyOffDays: [0, 6], // Sat/Sun off
  holidayDateKeys: new Set(["2026-01-26", "2026-08-15"]), // Republic Day, Independence Day
};

describe("classifyDay", () => {
  it("classifies a weekday as working", () => {
    expect(classifyDay(d("12/01/2026"), baseCalendar)).toBe("WORKING"); // Monday
  });

  it("classifies Saturday/Sunday as weekly off", () => {
    expect(classifyDay(d("10/01/2026"), baseCalendar)).toBe("WEEKLY_OFF"); // Saturday
    expect(classifyDay(d("11/01/2026"), baseCalendar)).toBe("WEEKLY_OFF"); // Sunday
  });

  it("classifies a configured holiday", () => {
    expect(classifyDay(d("26/01/2026"), baseCalendar)).toBe("HOLIDAY"); // Republic Day = Monday in 2026
  });
});

describe("countLeaveDays", () => {
  it("counts a single full working day as 1", () => {
    const result = countLeaveDays(d("12/01/2026"), d("12/01/2026"), "NONE", baseCalendar, {
      countWeekendsInRange: false,
      countHolidaysInRange: false,
    });
    expect(result.totalDays).toBe(1);
  });

  it("counts a half day as 0.5", () => {
    const result = countLeaveDays(d("12/01/2026"), d("12/01/2026"), "FIRST_HALF", baseCalendar, {
      countWeekendsInRange: false,
      countHolidaysInRange: false,
    });
    expect(result.totalDays).toBe(0.5);
  });

  it("excludes weekends inside a multi-day range by default", () => {
    // Fri 09/01 .. Mon 12/01 2026 spans Sat/Sun
    const result = countLeaveDays(d("09/01/2026"), d("12/01/2026"), "NONE", baseCalendar, {
      countWeekendsInRange: false,
      countHolidaysInRange: false,
    });
    expect(result.totalDays).toBe(2); // Fri + Mon only
  });

  it("includes weekends inside a range when the policy says to count them", () => {
    const result = countLeaveDays(d("09/01/2026"), d("12/01/2026"), "NONE", baseCalendar, {
      countWeekendsInRange: true,
      countHolidaysInRange: false,
    });
    expect(result.totalDays).toBe(4);
  });

  it("excludes a holiday that falls inside the range by default", () => {
    // 26/01/2026 is a Monday holiday; range spans Fri 23 .. Tue 27
    const result = countLeaveDays(d("23/01/2026"), d("27/01/2026"), "NONE", baseCalendar, {
      countWeekendsInRange: false,
      countHolidaysInRange: false,
    });
    // Fri 23, Mon 26 excluded (holiday), Tue 27 => Fri + Tue = 2 (Sat/Sun excluded too)
    expect(result.totalDays).toBe(2);
  });
});

describe("computeSandwichGapDays", () => {
  it("charges the weekend gap when leave sandwiches it and the rule is enabled", () => {
    // Friday 09/01/2026 leave, then Monday 12/01/2026 leave -> Sat/Sun gap
    const gap = computeSandwichGapDays(d("09/01/2026"), d("12/01/2026"), baseCalendar, true);
    expect(gap).toHaveLength(2);
    expect(gap.map((g) => g.dateKey)).toEqual(["2026-01-10", "2026-01-11"]);
  });

  it("does not charge anything when the rule is disabled", () => {
    const gap = computeSandwichGapDays(d("09/01/2026"), d("12/01/2026"), baseCalendar, false);
    expect(gap).toHaveLength(0);
  });

  it("does not charge when the gap contains a working day", () => {
    // Thursday 08/01 .. the gap to Monday 12/01 includes Friday 09/01, a working day
    const gap = computeSandwichGapDays(d("08/01/2026"), d("12/01/2026"), baseCalendar, true);
    expect(gap).toHaveLength(0);
  });

  it("returns nothing when there is no gap (adjacent days)", () => {
    const gap = computeSandwichGapDays(d("12/01/2026"), d("13/01/2026"), baseCalendar, true);
    expect(gap).toHaveLength(0);
  });
});
