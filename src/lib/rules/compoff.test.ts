import { describe, expect, it } from "vitest";
import { parseDMY } from "../date";
import { isCompOffExpired, pickCompOffsFIFO } from "./compoff";

const d = (s: string) => parseDMY(s)!;

describe("isCompOffExpired", () => {
  it("is not expired before the expiry date", () => {
    const credit = { id: "1", earnedDate: d("01/01/2026"), expiryDate: d("01/04/2026"), status: "AVAILABLE" as const };
    expect(isCompOffExpired(credit, d("01/02/2026"))).toBe(false);
  });

  it("is expired after the expiry date", () => {
    const credit = { id: "1", earnedDate: d("01/01/2026"), expiryDate: d("01/04/2026"), status: "AVAILABLE" as const };
    expect(isCompOffExpired(credit, d("02/04/2026"))).toBe(true);
  });

  it("an already-used credit is never reported as expired", () => {
    const credit = { id: "1", earnedDate: d("01/01/2026"), expiryDate: d("01/04/2026"), status: "USED" as const };
    expect(isCompOffExpired(credit, d("02/04/2026"))).toBe(false);
  });
});

describe("pickCompOffsFIFO", () => {
  const credits = [
    { id: "c3", earnedDate: d("01/03/2026"), expiryDate: d("01/06/2026"), status: "AVAILABLE" as const },
    { id: "c1", earnedDate: d("01/01/2026"), expiryDate: d("01/04/2026"), status: "AVAILABLE" as const },
    { id: "c2", earnedDate: d("01/02/2026"), expiryDate: d("01/05/2026"), status: "AVAILABLE" as const },
    { id: "expired", earnedDate: d("01/01/2025"), expiryDate: d("01/02/2025"), status: "AVAILABLE" as const },
  ];

  it("picks the oldest-earned credits first and skips expired ones", () => {
    const { usable, shortfall } = pickCompOffsFIFO(credits, 2, d("01/03/2026"));
    expect(usable.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(shortfall).toBe(0);
  });

  it("reports a shortfall when there are not enough available credits", () => {
    const { usable, shortfall } = pickCompOffsFIFO(credits, 5, d("01/03/2026"));
    expect(usable).toHaveLength(3);
    expect(shortfall).toBe(2);
  });
});
