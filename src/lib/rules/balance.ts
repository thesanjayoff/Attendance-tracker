export interface LedgerEntryLike {
  leaveTypeId: string;
  leaveYearId: string;
  amount: number;
}

export interface BalanceKey {
  leaveTypeId: string;
  leaveYearId: string;
}

/**
 * The balance for any (employee, leaveType, leaveYear) is always the sum of
 * every ledger entry for that key — never a stored/mutated counter. This is
 * what makes the ledger the single source of truth: balances can always be
 * rebuilt from history.
 */
export function computeBalances(entries: LedgerEntryLike[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const entry of entries) {
    const key = balanceKey(entry);
    balances.set(key, round2((balances.get(key) ?? 0) + Number(entry.amount)));
  }
  return balances;
}

export function computeBalanceFor(
  entries: LedgerEntryLike[],
  leaveTypeId: string,
  leaveYearId: string
): number {
  return round2(
    entries
      .filter((e) => e.leaveTypeId === leaveTypeId && e.leaveYearId === leaveYearId)
      .reduce((sum, e) => sum + Number(e.amount), 0)
  );
}

function balanceKey(k: BalanceKey): string {
  return `${k.leaveTypeId}::${k.leaveYearId}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
