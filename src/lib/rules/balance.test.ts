import { describe, expect, it } from "vitest";
import { computeBalanceFor, computeBalances } from "./balance";

describe("computeBalances", () => {
  it("rebuilds the balance purely from ledger entries", () => {
    const entries = [
      { leaveTypeId: "CL", leaveYearId: "2026", amount: 12 }, // accrual
      { leaveTypeId: "CL", leaveYearId: "2026", amount: -1 }, // usage
      { leaveTypeId: "CL", leaveYearId: "2026", amount: -0.5 }, // usage
      { leaveTypeId: "SL", leaveYearId: "2026", amount: 6 },
    ];
    const balances = computeBalances(entries);
    expect(balances.get("CL::2026")).toBe(10.5);
    expect(balances.get("SL::2026")).toBe(6);
  });

  it("matches computeBalanceFor for a specific key", () => {
    const entries = [
      { leaveTypeId: "CL", leaveYearId: "2026", amount: 12 },
      { leaveTypeId: "CL", leaveYearId: "2026", amount: -1 },
      { leaveTypeId: "CL", leaveYearId: "2027", amount: 12 }, // different year, must not mix
    ];
    expect(computeBalanceFor(entries, "CL", "2026")).toBe(11);
    expect(computeBalanceFor(entries, "CL", "2027")).toBe(12);
  });

  it("reversal entries restore balance exactly (cancellation)", () => {
    const entries = [
      { leaveTypeId: "CL", leaveYearId: "2026", amount: 12 },
      { leaveTypeId: "CL", leaveYearId: "2026", amount: -3 }, // usage
      { leaveTypeId: "CL", leaveYearId: "2026", amount: 3 }, // reversal on cancellation
    ];
    expect(computeBalanceFor(entries, "CL", "2026")).toBe(12);
  });
});
