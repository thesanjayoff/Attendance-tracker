import { describe, expect, it } from "vitest";
import { formatDMY, parseDMY } from "../date";
import { getLeaveYearBounds } from "./leaveYear";

const d = (s: string) => parseDMY(s)!;

describe("getLeaveYearBounds", () => {
  it("resolves a calendar year to Jan 1 - Dec 31", () => {
    const bounds = getLeaveYearBounds("CALENDAR", 4, d("15/06/2026"));
    expect(bounds.label).toBe("2026");
    expect(formatDMY(bounds.startDate)).toBe("01/01/2026");
    expect(formatDMY(bounds.endDate)).toBe("31/12/2026");
  });

  it("resolves a financial year (April-March) when the date is after the FY start month", () => {
    const bounds = getLeaveYearBounds("FINANCIAL", 4, d("15/06/2026"));
    expect(bounds.label).toBe("2026-2027");
    expect(formatDMY(bounds.startDate)).toBe("01/04/2026");
    expect(formatDMY(bounds.endDate)).toBe("31/03/2027");
  });

  it("resolves a financial year when the date is before the FY start month", () => {
    const bounds = getLeaveYearBounds("FINANCIAL", 4, d("15/02/2026"));
    expect(bounds.label).toBe("2025-2026");
    expect(formatDMY(bounds.startDate)).toBe("01/04/2025");
    expect(formatDMY(bounds.endDate)).toBe("31/03/2026");
  });
});
