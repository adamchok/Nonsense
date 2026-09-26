/**
 * Run with: npm test   (node --test, no framework, no dependencies)
 *
 * Mirrors the source tree: test/lib/x.test.ts covers lib/x.ts.
 *
 * Node's native type-stripping needs the explicit `.ts` extension on relative
 * imports and `import type` for type-only imports. The `@/` alias is deliberately
 * not used here — Node has no import map for it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeSettlements } from '../../lib/settlement.ts';
import type { Settlement } from '../../lib/settlement.ts';

interface Player {
  playerId: string;
  playerName: string;
  profit: number;
}

function player(playerId: string, profit: number, playerName = playerId): Player {
  return { playerId, playerName, profit };
}

/** Net movement for one player across all transfers: paying out is negative. */
function netFor(settlements: Settlement[], playerId: string): number {
  return settlements.reduce((sum, s) => {
    if (s.fromId === playerId) return sum - s.amount;
    if (s.toId === playerId) return sum + s.amount;
    return sum;
  }, 0);
}

/** Every player ends up whole, nobody pays themselves, and n players need at most n-1 transfers. */
function assertSettles(players: Player[], settlements: Settlement[]): void {
  for (const p of players) {
    assert.ok(
      Math.abs(netFor(settlements, p.playerId) - p.profit) < 0.011,
      `${p.playerId} nets ${netFor(settlements, p.playerId)}, expected ${p.profit}`
    );
  }
  for (const s of settlements) {
    assert.notEqual(s.fromId, s.toId, 'a player was told to pay themselves');
    assert.ok(s.amount > 0, 'zero or negative transfer emitted');
  }
  const nonZero = players.filter((p) => Math.abs(p.profit) >= 0.01);
  assert.ok(
    settlements.length <= Math.max(0, nonZero.length - 1),
    `${settlements.length} transfers for ${nonZero.length} players exceeds n-1`
  );
}

test('no transfers when nobody has a balance', () => {
  assert.deepEqual(computeSettlements([]), []);
  assert.deepEqual(computeSettlements([player('a', 0)]), []);
  assert.deepEqual(computeSettlements([player('a', 0), player('b', 0)]), []);
});

test('sub-cent balances are ignored rather than generating dust transfers', () => {
  assert.deepEqual(computeSettlements([player('a', 0.004), player('b', -0.004)]), []);
});

test('one loser pays one winner directly', () => {
  const players = [player('a', 50), player('b', -50)];
  const settlements = computeSettlements(players);

  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].fromId, 'b');
  assert.equal(settlements[0].toId, 'a');
  assert.equal(settlements[0].amount, 50);
  assertSettles(players, settlements);
});

test('independent zero-sum pairs are settled without cross-payments', () => {
  const players = [player('a', 30), player('b', -30), player('c', 45), player('d', -45)];
  const settlements = computeSettlements(players);

  // Two disjoint pairs beat any three-transfer chain.
  assert.equal(settlements.length, 2);
  assertSettles(players, settlements);
});

test('a table with no clean pairing still settles in at most n-1 transfers', () => {
  const players = [
    player('a', 100),
    player('b', 37.5),
    player('c', -12.25),
    player('d', -55.25),
    player('e', -70),
  ];
  assertSettles(players, computeSettlements(players));
});

test('players sharing a display name are settled as separate people', () => {
  // A registered John and a typed guest John: only the id tells them apart.
  const players = [player('john_registered', 60, 'John'), player('guest_2', -60, 'John')];
  const settlements = computeSettlements(players);

  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].fromId, 'guest_2');
  assert.equal(settlements[0].toId, 'john_registered');
  assert.equal(settlements[0].from, 'John');
  assert.equal(settlements[0].to, 'John');
  assertSettles(players, settlements);
});

test('a table too large for the exact solve still settles correctly and fast', () => {
  // 24 non-zero balances: the exact O(3^n) path would be ~280 billion steps.
  const players: Player[] = [];
  for (let i = 0; i < 12; i++) {
    players.push(player(`w${i}`, 10 + i));
    players.push(player(`l${i}`, -(10 + i)));
  }

  const started = process.hrtime.bigint();
  const settlements = computeSettlements(players);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.ok(elapsedMs < 500, `greedy fallback took ${elapsedMs}ms`);
  assertSettles(players, settlements);
});
