export interface Settlement {
  fromId: string;
  from: string;
  toId: string;
  to: string;
  amount: number;
}

const EPSILON = 0.01;

/**
 * Above this many non-zero balances the exact solve is replaced by plain greedy
 * matching. 3^15 subsets is ~14M steps (fine); 3^20 is ~3.5B and would freeze the
 * summary screen while everyone waits to get paid.
 */
const MAX_EXACT_PLAYERS = 15;

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
 * Complexity: O(3^n) subset enumeration — fast for n ≤ MAX_EXACT_PLAYERS, past
 * which step 2 is skipped and the whole table is settled greedily instead.
 *
 * Balances are keyed by playerId, never by name: a registered player and a typed
 * guest can share a display name, and only the id distinguishes them.
 */
export function computeSettlements(
  results: { playerId: string; playerName: string; profit: number }[]
): Settlement[] {
  const balances = results
    .map((r) => ({ id: r.playerId, name: r.playerName, amount: r.profit }))
    .filter((b) => Math.abs(b.amount) >= EPSILON);

  const n = balances.length;
  if (n <= 1) return [];

  // Greedy over the whole table costs at most n-1 transfers instead of the minimum —
  // the right trade when the alternative is an unresponsive summary screen.
  if (n > MAX_EXACT_PLAYERS) {
    const greedy: Settlement[] = [];
    settleGroup(balances, greedy);
    return greedy;
  }

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
    const members: Balance[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        members.push(balances[i]);
      }
    }
    settleGroup(members, settlements);
  }

  return settlements;
}

interface Balance {
  id: string;
  name: string;
  amount: number;
}

function settleGroup(members: Balance[], out: Settlement[]): void {
  const debtors = members
    .filter((m) => m.amount < -EPSILON)
    .map((m) => ({ id: m.id, name: m.name, owed: Math.abs(m.amount) }))
    .sort((a, b) => b.owed - a.owed);

  const creditors = members
    .filter((m) => m.amount > EPSILON)
    .map((m) => ({ id: m.id, name: m.name, owed: m.amount }))
    .sort((a, b) => b.owed - a.owed);

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].owed, creditors[j].owed);
    if (transfer > EPSILON) {
      out.push({
        fromId: debtors[i].id,
        from: debtors[i].name,
        toId: creditors[j].id,
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
