import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SESSION_PLAYERS,
  canDecrementMemberCount,
  clipText,
  finiteNum,
  groupFromMembershipData,
  isOversizedSession,
  mapDocsSafely,
  numOrZero,
  optStr,
  sessionAmountMetaFromDocData,
  sessionPlayerIds,
  sessionBlindsFromDocData,
  sessionSummaryFromDocData,
  storedPlayerResult,
  storedProfitEntries,
  str,
  tryMap,
} from '../../lib/firestore-coerce.ts';

const poison = { toString: 1 };

function quietly<T>(run: () => T): T {
  const original = console.warn;
  console.warn = () => {};
  try {
    return run();
  } finally {
    console.warn = original;
  }
}

test('str returns strings and blanks every other type', () => {
  assert.equal(str('Bob'), 'Bob');
  assert.equal(str(poison), '');
  assert.equal(str(null), '');
  assert.equal(str(undefined), '');
  assert.equal(str(42), '');
  assert.equal(str(['a']), '');
});

test('optStr keeps non-empty strings only', () => {
  assert.equal(optStr('KL'), 'KL');
  assert.equal(optStr(''), undefined);
  assert.equal(optStr(poison), undefined);
  assert.equal(optStr(7), undefined);
});

test('finiteNum accepts finite numbers and numeric strings only', () => {
  assert.equal(finiteNum(3), 3);
  assert.equal(finiteNum('2.5'), 2.5);
  assert.equal(finiteNum(Number.NaN), undefined);
  assert.equal(finiteNum(Infinity), undefined);
  assert.equal(finiteNum(''), undefined);
  assert.equal(finiteNum(poison), undefined);
  assert.equal(finiteNum(null), undefined);
});

test('numOrZero does not throw on null, arrays, primitives or map values', () => {
  quietly(() => {
    assert.equal(numOrZero({ profit: 12 }, 'profit', 'ctx'), 12);
    assert.equal(numOrZero(null, 'profit', 'ctx'), 0);
    assert.equal(numOrZero(undefined, 'profit', 'ctx'), 0);
    assert.equal(numOrZero('x', 'profit', 'ctx'), 0);
    assert.equal(numOrZero([1], 'profit', 'ctx'), 0);
    assert.equal(numOrZero({ profit: poison }, 'profit', 'ctx'), 0);
    assert.equal(numOrZero({ profit: '5' }, 'profit', 'ctx'), 0);
  });
});

test('storedProfitEntries skips null and non-object playerResults entries', () => {
  const data = {
    playerResults: { ghost: null, arr: [1], text: 'x', bob: { profit: 10 }, eve: { profit: poison } },
  };
  const entries = quietly(() => storedProfitEntries('s1', data));
  assert.deepEqual(entries, [
    ['bob', 10],
    ['eve', 0],
  ]);
});

test('storedProfitEntries returns null when playerResults is missing or not a map', () => {
  assert.equal(storedProfitEntries('s1', {}), null);
  assert.equal(storedProfitEntries('s1', { playerResults: null }), null);
  assert.equal(storedProfitEntries('s1', { playerResults: [1, 2] }), null);
});

test('storedPlayerResult separates missing map, malformed entry and valid entry', () => {
  assert.equal(storedPlayerResult({}, 'v'), undefined);
  assert.equal(storedPlayerResult({ playerResults: { v: null } }, 'v'), null);
  assert.equal(storedPlayerResult({ playerResults: { other: { profit: 1 } } }, 'v'), null);
  assert.deepEqual(storedPlayerResult({ playerResults: { v: { profit: 1 } } }, 'v'), { profit: 1 });
});

test('sessionSummaryFromDocData survives map-valued strings and numbers', () => {
  const summary = sessionSummaryFromDocData({
    hostId: poison,
    location: poison,
    smallBlind: poison,
    bigBlind: 2,
    amountUnit: 'chips',
    dollarsPerChip: poison,
  });
  assert.deepEqual(summary, { hostId: '', location: undefined, amountUnit: 'chips' });
});

test('sessionSummaryFromDocData keeps valid legacy values', () => {
  const summary = sessionSummaryFromDocData({
    hostId: 'h1',
    location: 'Home',
    smallBlind: '1',
    bigBlind: 2,
    amountUnit: 'chips',
    dollarsPerChip: 0.5,
  });
  assert.deepEqual(summary, {
    hostId: 'h1',
    location: 'Home',
    smallBlind: 1,
    bigBlind: 2,
    amountUnit: 'chips',
    dollarsPerChip: 0.5,
  });
});

test('blinds and amount meta reject invalid input without throwing', () => {
  assert.deepEqual(sessionBlindsFromDocData({}), {});
  assert.deepEqual(sessionBlindsFromDocData({ smallBlind: 2, bigBlind: 1 }), {});
  assert.deepEqual(sessionAmountMetaFromDocData({ amountUnit: poison }), { amountUnit: 'cash' });
  assert.deepEqual(sessionAmountMetaFromDocData({ amountUnit: 'chips', dollarsPerChip: -1 }), {
    amountUnit: 'chips',
    dollarsPerChip: undefined,
  });
});

test('groupFromMembershipData coerces attacker-typed membership fields', () => {
  assert.deepEqual(
    groupFromMembershipData('g1', { name: poison, memberCount: poison, ownerId: ['x'], role: poison }),
    { id: 'g1', name: '', memberCount: 0, ownerId: '', myRole: 'member' }
  );
  assert.deepEqual(groupFromMembershipData('g2', {}), {
    id: 'g2',
    name: '',
    memberCount: 0,
    ownerId: '',
    myRole: 'member',
  });
  assert.deepEqual(
    groupFromMembershipData('g3', { name: 'Friday', memberCount: 4, ownerId: 'o', role: 'owner' }),
    { id: 'g3', name: 'Friday', memberCount: 4, ownerId: 'o', myRole: 'owner' }
  );
});

test('isOversizedSession flags participant lists and result maps above the cap', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  const results = (n: number) => Object.fromEntries(ids(n).map((id) => [id, { profit: 0 }]));
  assert.equal(isOversizedSession({ participantIds: ids(MAX_SESSION_PLAYERS) }), false);
  assert.equal(isOversizedSession({ participantIds: ids(MAX_SESSION_PLAYERS + 1) }), true);
  assert.equal(isOversizedSession({ playerResults: results(MAX_SESSION_PLAYERS) }), false);
  assert.equal(isOversizedSession({ playerResults: results(MAX_SESSION_PLAYERS + 1) }), true);
  assert.equal(isOversizedSession({ participantIds: poison, playerResults: null }), false);
});

test('mapDocsSafely drops a document whose mapper throws and keeps the rest', () => {
  const docs = [{ id: 'a' }, { id: 'bad' }, { id: 'c' }];
  const out = quietly(() =>
    mapDocsSafely(docs, 'col', (d) => {
      if (d.id === 'bad') throw new TypeError('Cannot convert object to primitive value');
      return d.id;
    })
  );
  assert.deepEqual(out, ['a', 'c']);
});

test('tryMap returns undefined instead of throwing', () => {
  assert.equal(quietly(() => tryMap('ctx', () => String(poison))), undefined);
  assert.equal(tryMap('ctx', () => 5), 5);
});

test('numOrZero warning truncates a huge string value', () => {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    assert.equal(numOrZero({ profit: 'x'.repeat(1_000_000) }, 'profit', 'ctx'), 0);
  } finally {
    console.warn = original;
  }
  assert.equal(lines.length, 1);
  assert.ok(lines[0].length < 300, `warning was ${lines[0].length} chars`);
  assert.match(lines[0], /1000000 chars/);
});

test('clipText keeps short text and never leaves half a surrogate pair', () => {
  assert.equal(clipText('Home', 100), 'Home');
  assert.equal(clipText('a'.repeat(150), 100), 'a'.repeat(100));
  const clipped = clipText(`${'a'.repeat(99)}😀b`, 100);
  assert.equal(clipped, 'a'.repeat(99));
  assert.ok(clipped.length <= 100);
});

test('sessionPlayerIds puts the host first and keeps first-seen order without duplicates', () => {
  assert.deepEqual(sessionPlayerIds('host', ['bob', 'host', 'amy', 'bob']), ['host', 'bob', 'amy']);
  const many = Array.from({ length: MAX_SESSION_PLAYERS }, (_, i) => `p${i}`);
  assert.equal(sessionPlayerIds('host', many).length, MAX_SESSION_PLAYERS + 1);
});

test('canDecrementMemberCount only allows a positive numeric count', () => {
  assert.equal(canDecrementMemberCount(3), true);
  assert.equal(canDecrementMemberCount(1), true);
  assert.equal(canDecrementMemberCount(0), false);
  assert.equal(canDecrementMemberCount(-2), false);
  assert.equal(canDecrementMemberCount(undefined), false);
  assert.equal(canDecrementMemberCount('3'), false);
  assert.equal(canDecrementMemberCount(Number.NaN), false);
});
