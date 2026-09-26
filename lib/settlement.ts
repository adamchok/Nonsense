export interface Settlement {
  fromId: string;
  from: string;
  toId: string;
  to: string;
  amount: number;
}

const EPSILON = 0.01;

const MAX_EXACT_PLAYERS = 15;

export function computeSettlements(
  results: { playerId: string; playerName: string; profit: number }[]
): Settlement[] {
  const balances = results
    .map((r) => ({ id: r.playerId, name: r.playerName, amount: r.profit }))
    .filter((b) => Math.abs(b.amount) >= EPSILON);

  const n = balances.length;
  if (n <= 1) return [];

  if (n > MAX_EXACT_PLAYERS) {
    const greedy: Settlement[] = [];
    settleGroup(balances, greedy);
    return greedy;
  }

  const full = (1 << n) - 1;

  const sums = new Float64Array(1 << n);
  for (let mask = 1; mask <= full; mask++) {
    const lsb = mask & -mask;
    const bit = 31 - Math.clz32(lsb);
    sums[mask] = sums[mask ^ lsb] + balances[bit].amount;
  }

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
