export interface CompOffCreditLike {
  id: string;
  earnedDate: Date;
  expiryDate: Date;
  status: "AVAILABLE" | "USED" | "EXPIRED";
}

export function isCompOffExpired(credit: CompOffCreditLike, now: Date): boolean {
  return credit.status === "AVAILABLE" && now.getTime() > credit.expiryDate.getTime();
}

/** Picks the oldest-earned available comp-offs first (FIFO) to cover `daysNeeded`. */
export function pickCompOffsFIFO(
  credits: CompOffCreditLike[],
  daysNeeded: number,
  now: Date
): { usable: CompOffCreditLike[]; shortfall: number } {
  const available = credits
    .filter((c) => c.status === "AVAILABLE" && !isCompOffExpired(c, now))
    .sort((a, b) => a.earnedDate.getTime() - b.earnedDate.getTime());

  const usable = available.slice(0, Math.ceil(daysNeeded));
  const shortfall = Math.max(daysNeeded - usable.length, 0);
  return { usable, shortfall };
}
