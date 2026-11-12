export interface ShiftConfig {
  shiftStartMinutes: number; // minutes from midnight, IST
  shiftEndMinutes: number;
  graceMinutes: number;
}

export interface CheckInEvaluation {
  isLate: boolean;
  lateMinutes: number;
}

/** minutes-from-midnight for a check-in instant, in IST. */
export function minutesFromMidnightIST(date: Date): number {
  const istMs = date.getTime() + 5.5 * 60 * 60 * 1000;
  const d = new Date(istMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function evaluateCheckIn(checkInMinutes: number, shift: ShiftConfig): CheckInEvaluation {
  const graceDeadline = shift.shiftStartMinutes + shift.graceMinutes;
  if (checkInMinutes <= graceDeadline) {
    return { isLate: false, lateMinutes: 0 };
  }
  return { isLate: true, lateMinutes: checkInMinutes - shift.shiftStartMinutes };
}

export interface CheckOutEvaluation {
  isEarlyExit: boolean;
  earlyMinutes: number;
  workedMinutes: number;
}

export function evaluateCheckOut(checkInMinutes: number, checkOutMinutes: number, shift: ShiftConfig): CheckOutEvaluation {
  const workedMinutes = Math.max(checkOutMinutes - checkInMinutes, 0);
  const isEarlyExit = checkOutMinutes < shift.shiftEndMinutes;
  return {
    isEarlyExit,
    earlyMinutes: isEarlyExit ? shift.shiftEndMinutes - checkOutMinutes : 0,
    workedMinutes,
  };
}

/** True once `lateCountThisMonth` reaches the configured threshold, triggering a half-day deduction. */
export function shouldApplyLateMarkDeduction(lateCountThisMonth: number, lateMarksForHalfDay: number): boolean {
  if (lateMarksForHalfDay <= 0) return false;
  return lateCountThisMonth > 0 && lateCountThisMonth % lateMarksForHalfDay === 0;
}

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function isWithinGeofence(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): boolean {
  return haversineDistanceMeters(lat, lng, centerLat, centerLng) <= radiusMeters;
}
