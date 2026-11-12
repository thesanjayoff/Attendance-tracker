import { describe, expect, it } from "vitest";
import { dateKeyIST, formatDMY, istDateTimeForYMDHM, istMidnightUTCForYMD, parseDMY } from "./date";

describe("istMidnightUTCForYMD", () => {
  it("produces the UTC instant 18:30 the previous day (IST is UTC+5:30)", () => {
    const d = istMidnightUTCForYMD(2026, 6, 1);
    expect(d.toISOString()).toBe("2026-05-31T18:30:00.000Z");
  });

  it("round-trips through dateKeyIST back to the same calendar date", () => {
    const d = istMidnightUTCForYMD(2026, 1, 1);
    expect(dateKeyIST(d)).toBe("2026-01-01");
  });

  it("matches parseDMY for the same date", () => {
    expect(istMidnightUTCForYMD(2026, 6, 15).getTime()).toBe(parseDMY("15/06/2026")!.getTime());
  });
});

describe("istDateTimeForYMDHM", () => {
  it("produces the UTC instant for 09:30 IST (3 hours 30 before UTC noon equivalent)", () => {
    const d = istDateTimeForYMDHM(2026, 6, 1, 9, 30);
    expect(d.toISOString()).toBe("2026-06-01T04:00:00.000Z");
  });

  it("falls on the same IST calendar date it was given", () => {
    const d = istDateTimeForYMDHM(2026, 6, 1, 23, 45);
    expect(dateKeyIST(d)).toBe("2026-06-01");
  });
});

describe("formatDMY / parseDMY round-trip", () => {
  it("formats and reparses without drifting a day", () => {
    const original = "28/02/2026";
    const parsed = parseDMY(original)!;
    expect(formatDMY(parsed)).toBe(original);
  });
});
