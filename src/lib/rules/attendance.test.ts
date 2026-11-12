import { describe, expect, it } from "vitest";
import {
  evaluateCheckIn,
  evaluateCheckOut,
  haversineDistanceMeters,
  isWithinGeofence,
  shouldApplyLateMarkDeduction,
} from "./attendance";

const shift = { shiftStartMinutes: 570, shiftEndMinutes: 1110, graceMinutes: 10 }; // 09:30-18:30, 10 min grace

describe("evaluateCheckIn", () => {
  it("is on time within the grace window", () => {
    expect(evaluateCheckIn(575, shift)).toEqual({ isLate: false, lateMinutes: 0 }); // 09:35
  });

  it("is on time exactly at the grace deadline", () => {
    expect(evaluateCheckIn(580, shift)).toEqual({ isLate: false, lateMinutes: 0 }); // 09:40
  });

  it("is late just past the grace window", () => {
    expect(evaluateCheckIn(590, shift)).toEqual({ isLate: true, lateMinutes: 20 }); // 09:50 -> 20 min late vs 09:30
  });
});

describe("evaluateCheckOut", () => {
  it("flags an early exit before the shift end", () => {
    const result = evaluateCheckOut(570, 1080, shift); // leaves at 18:00
    expect(result.isEarlyExit).toBe(true);
    expect(result.earlyMinutes).toBe(30);
    expect(result.workedMinutes).toBe(510);
  });

  it("does not flag an on-time or late checkout", () => {
    const result = evaluateCheckOut(570, 1110, shift);
    expect(result.isEarlyExit).toBe(false);
    expect(result.earlyMinutes).toBe(0);
  });
});

describe("shouldApplyLateMarkDeduction", () => {
  it("triggers every Nth late mark", () => {
    expect(shouldApplyLateMarkDeduction(3, 3)).toBe(true);
    expect(shouldApplyLateMarkDeduction(6, 3)).toBe(true);
  });

  it("does not trigger on other counts", () => {
    expect(shouldApplyLateMarkDeduction(1, 3)).toBe(false);
    expect(shouldApplyLateMarkDeduction(2, 3)).toBe(false);
    expect(shouldApplyLateMarkDeduction(0, 3)).toBe(false);
  });
});

describe("geofence", () => {
  it("computes ~0 distance for the same point", () => {
    expect(haversineDistanceMeters(13.0827, 80.2707, 13.0827, 80.2707)).toBeCloseTo(0, 3);
  });

  it("flags a point far outside the radius", () => {
    // Chennai vs Bangalore, ~290km apart
    expect(isWithinGeofence(12.9716, 77.5946, 13.0827, 80.2707, 200)).toBe(false);
  });

  it("accepts a point within the radius", () => {
    // ~100m offset
    expect(isWithinGeofence(13.0827, 80.2717, 13.0827, 80.2707, 200)).toBe(true);
  });
});
