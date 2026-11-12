import { describe, expect, it } from "vitest";
import { parseDMY } from "../date";
import {
  computeCarryForward,
  computeCarryForwardExpiry,
  computeMonthlyAccrualAmount,
  computePerDayWorkedAccrual,
  computeUpfrontAllocation,
} from "./accrual";
import { getLeaveYearBounds } from "./leaveYear";

const d = (s: string) => parseDMY(s)!;

describe("computeUpfrontAllocation", () => {
  const year2026 = getLeaveYearBounds("CALENDAR", 4, d("15/06/2026"));

  it("grants the full quota to an employee who joined before the year started", () => {
    expect(computeUpfrontAllocation(12, year2026, d("01/01/2020"))).toBe(12);
  });

  it("pro-rates the quota for a mid-year joiner", () => {
    // Joins 01/07/2026 — exactly the second half of the year (184/365 remaining)
    const allocation = computeUpfrontAllocation(12, year2026, d("01/07/2026"));
    expect(allocation).toBeGreaterThan(5.5);
    expect(allocation).toBeLessThan(6.5);
  });

  it("grants nothing if the employee joins after the leave year ends", () => {
    expect(computeUpfrontAllocation(12, year2026, d("01/01/2027"))).toBe(0);
  });
});

describe("computeMonthlyAccrualAmount", () => {
  const monthStart = d("01/06/2026");
  const monthEnd = d("30/06/2026");

  it("credits a full monthly share for an existing employee", () => {
    expect(computeMonthlyAccrualAmount(12, monthStart, monthEnd, d("01/01/2020"))).toBe(1);
  });

  it("pro-rates the monthly share for the joining month", () => {
    // Joins halfway through June (16th of 30 days -> 15 days remaining)
    const amount = computeMonthlyAccrualAmount(12, monthStart, monthEnd, d("16/06/2026"));
    expect(amount).toBeGreaterThan(0.4);
    expect(amount).toBeLessThan(0.6);
  });

  it("credits nothing if the employee joins after the month ends", () => {
    expect(computeMonthlyAccrualAmount(12, monthStart, monthEnd, d("01/07/2026"))).toBe(0);
  });
});

describe("computePerDayWorkedAccrual", () => {
  it("accrues proportionally to days worked", () => {
    expect(computePerDayWorkedAccrual(12, 240, 20)).toBe(1);
  });

  it("returns 0 when there are no working days in the year", () => {
    expect(computePerDayWorkedAccrual(12, 0, 20)).toBe(0);
  });
});

describe("computeCarryForward", () => {
  it("carries the full balance when under the limit", () => {
    expect(computeCarryForward(5, 10)).toEqual({ carriedForward: 5, expiredImmediately: 0 });
  });

  it("caps the carried amount and expires the rest immediately", () => {
    expect(computeCarryForward(15, 10)).toEqual({ carriedForward: 10, expiredImmediately: 5 });
  });

  it("carries nothing from a zero or negative balance", () => {
    expect(computeCarryForward(0, 10)).toEqual({ carriedForward: 0, expiredImmediately: 0 });
    expect(computeCarryForward(-2, 10)).toEqual({ carriedForward: 0, expiredImmediately: 0 });
  });
});

describe("computeCarryForwardExpiry", () => {
  const expiryDate = d("31/03/2027");

  it("expires nothing before the expiry date", () => {
    expect(computeCarryForwardExpiry(10, 2, d("01/01/2027"), expiryDate)).toBe(0);
  });

  it("expires the unused remainder on/after the expiry date", () => {
    expect(computeCarryForwardExpiry(10, 3, d("01/04/2027"), expiryDate)).toBe(7);
  });

  it("expires nothing if it was all used before expiry", () => {
    expect(computeCarryForwardExpiry(10, 10, d("01/04/2027"), expiryDate)).toBe(0);
  });
});
