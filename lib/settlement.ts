export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

const EPSILON = 0.01;

/**
 * Minimum-transaction settlement via bitmask DP.
 *
 * 1. Filter to non-zero balances (size n).
 * 2. Partition those n people into the *maximum* number of independent
 *    zero-sum subsets.  Each subset of size k can be settled in k-1
 *    transfers, so maximising subsets minimises total transfers.
 * 3. Within each subset, greedy debtor/creditor matching resolves the
 *    actual payment instructions.
 *
 * Complexity: O(3^n) subset enumeration — fast for n ≤ 15, which
 * comfortably covers any poker table.
 */
export function computeSettlements(
  results: { playerName: string; profit: number }[]
): Settlement[] {
  const balances = results
    .map((r) => ({ name: r.playerName, amount: r.profit }))
    .filter((b) => Math.abs(b.amount) >= EPSILON);

  const n = balances.length;
  if (n <= 1) return [];

  const full = (1 << n) - 1;

  // Precompute the balance-sum for every bitmask subset.
  const sums = new Float64Array(1 << n);
  for (let mask = 1; mask <= full; mask++) {
    const lsb = mask & -mask;
    const bit = 31 - Math.clz32(lsb);
    sums[mask] = sums[mask ^ lsb] + balances[bit].amount;
  }

  // dp[mask] = max independent zero-sum subsets that cover exactly `mask`.
  // choice[mask] = the last zero-sum subset chosen to reach dp[mask].
  const dp = new Int32Array(1 << n).fill(-1);
  const choice = new Int32Array(1 << n).fill(0);
  dp[0] = 0;

  for (let mask = 1; mask <= full; mask++) {
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if (Math.abs(sums[sub]) < EPSILON && dp[mask ^ sub] >= 0) {
        const candidate = dp[mask ^ sub] + 1;
        if (candidate > dp[mask]) {
          dp[mask] = candidate;
          choice[mask] = sub;
        }
      }
    }
  }

  // Walk back through choice[] to recover the partition.
  const groups: number[] = [];
  let remaining = full;
  while (remaining > 0) {
    const sub = choice[remaining];
    if (sub <= 0) {
      groups.push(remaining);
      break;
    }
    groups.push(sub);
    remaining ^= sub;
  }

  // Settle each independent group with greedy debtor/creditor matching.
  const settlements: Settlement[] = [];
  for (const mask of groups) {
    const members: { name: string; amount: number }[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        members.push({ name: balances[i].name, amount: balances[i].amount });
      }
    }
    settleGroup(members, settlements);
  }

  return settlements;
}

function settleGroup(
  members: { name: string; amount: number }[],
  out: Settlement[]
): void {
  const debtors = members
    .filter((m) => m.amount < -EPSILON)
    .map((m) => ({ name: m.name, owed: Math.abs(m.amount) }))
    .sort((a, b) => b.owed - a.owed);

  const creditors = members
    .filter((m) => m.amount > EPSILON)
    .map((m) => ({ name: m.name, owed: m.amount }))
    .sort((a, b) => b.owed - a.owed);

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].owed, creditors[j].owed);
    if (transfer > EPSILON) {
      out.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: Math.round(transfer * 100) / 100,
      });
    }
    debtors[i].owed -= transfer;
    creditors[j].owed -= transfer;
    if (debtors[i].owed < EPSILON) i++;
    if (creditors[j].owed < EPSILON) j++;
  }
}
