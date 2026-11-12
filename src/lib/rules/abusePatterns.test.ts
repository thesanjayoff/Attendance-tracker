import { describe, expect, it } from "vitest";
import { parseDMY } from "../date";
import { detectFrequentMondayFridayLeaves, detectHeavyAttendanceCorrections, detectManyBackdatedRequests } from "./abusePatterns";

const d = (s: string) => parseDMY(s)!;

function req(startDate: string, endDate: string, appliedAt: string, status = "APPROVED") {
  return { startDate: d(startDate), endDate: d(endDate), appliedAt: d(appliedAt), status };
}

describe("detectFrequentMondayFridayLeaves", () => {
  it("flags when the count meets the threshold", () => {
    // 09/01/2026 = Friday, 12/01/2026 = Monday, 16/01/2026 = Friday
    const requests = [
      req("09/01/2026", "09/01/2026", "05/01/2026"),
      req("12/01/2026", "12/01/2026", "05/01/2026"),
      req("16/01/2026", "16/01/2026", "05/01/2026"),
    ];
    const flag = detectFrequentMondayFridayLeaves(requests, 3);
    expect(flag?.code).toBe("FREQUENT_MONDAY_FRIDAY");
  });

  it("does not flag below the threshold", () => {
    const requests = [req("09/01/2026", "09/01/2026", "05/01/2026")];
    expect(detectFrequentMondayFridayLeaves(requests, 3)).toBeNull();
  });

  it("ignores cancelled/rejected requests", () => {
    const requests = [
      req("09/01/2026", "09/01/2026", "05/01/2026", "CANCELLED"),
      req("12/01/2026", "12/01/2026", "05/01/2026", "REJECTED"),
      req("16/01/2026", "16/01/2026", "05/01/2026", "CANCELLED"),
    ];
    expect(detectFrequentMondayFridayLeaves(requests, 3)).toBeNull();
  });

  it("ignores longer requests that merely happen to start on a Friday", () => {
    // A week-long vacation isn't the same signal as weekend-bridging.
    const requests = [
      req("09/01/2026", "09/01/2026", "05/01/2026"),
      req("12/01/2026", "12/01/2026", "05/01/2026"),
      req("16/01/2026", "23/01/2026", "05/01/2026"), // 8-day span, excluded
    ];
    expect(detectFrequentMondayFridayLeaves(requests, 3)).toBeNull();
  });
});

describe("detectManyBackdatedRequests", () => {
  it("flags requests applied after the leave start date", () => {
    const requests = [req("01/01/2026", "01/01/2026", "03/01/2026"), req("05/01/2026", "05/01/2026", "06/01/2026")];
    expect(detectManyBackdatedRequests(requests, 2)?.code).toBe("FREQUENT_BACKDATED");
  });

  it("does not flag requests applied on or before the start date", () => {
    const requests = [req("10/01/2026", "10/01/2026", "05/01/2026")];
    expect(detectManyBackdatedRequests(requests, 1)).toBeNull();
  });
});

describe("detectHeavyAttendanceCorrections", () => {
  it("flags at/above the threshold", () => {
    expect(detectHeavyAttendanceCorrections(5, 5)?.code).toBe("HEAVY_CORRECTIONS");
  });

  it("does not flag below the threshold", () => {
    expect(detectHeavyAttendanceCorrections(2, 5)).toBeNull();
  });
});
