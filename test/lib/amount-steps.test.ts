import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baseBuyIn, buyInQuickAmounts, cashOutSteps, niceRound } from '../../lib/amount-steps.ts';

test('niceRound snaps to amounts people actually use and keeps nice values', () => {
  assert.equal(niceRound(37.5), 40);
  assert.equal(niceRound(47.5), 50);
  assert.equal(niceRound(133), 125);
  assert.equal(niceRound(2.4), 2.5);
  for (const v of [2, 25, 75, 150, 600, 1250]) assert.equal(niceRound(v), v);
  assert.equal(niceRound(0), 0);
});

test('base buy-in prefers what people bought in for, then 100 big blinds', () => {
  assert.equal(baseBuyIn(150, 2), 150);
  assert.equal(baseBuyIn(null, 2), 200);
  assert.equal(baseBuyIn(null, 50), 5000);
  assert.equal(baseBuyIn(null, null), 100);
});

test('buy-in picks scale with the game, include the last amount, and sort ascending', () => {
  assert.deepEqual(buyInQuickAmounts({ bigBlind: 2 }), [100, 200, 400, 600]);
  assert.deepEqual(buyInQuickAmounts({ bigBlind: 0.5 }), [25, 50, 100, 150]);
  assert.deepEqual(buyInQuickAmounts({ lastAmount: 80, commonAmount: 200, bigBlind: 2 }), [80, 100, 200, 400, 600]);
  assert.deepEqual(buyInQuickAmounts({ lastAmount: 200, commonAmount: 200 }), [100, 200, 400, 600]);
  assert.deepEqual(buyInQuickAmounts({ lastAmount: 250, bigBlind: 2 }), [100, 200, 250, 400, 600]);
});

test('cash-out steps are one big blind, five big blinds and a quarter buy-in', () => {
  assert.deepEqual(cashOutSteps(2, 200), [2, 10, 50]);
  assert.deepEqual(cashOutSteps(1, 100), [1, 5, 25]);
  assert.deepEqual(cashOutSteps(50, 5000), [50, 250, 1250]);
  assert.deepEqual(cashOutSteps(null, 200), [10, 20, 50]);
});

test('cash-out steps fall back to fixed values when they would collide', () => {
  assert.deepEqual(cashOutSteps(10, 40), [5, 10, 25]);
});
