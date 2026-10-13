import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sessionViewFromData } from '../../lib/session-view.ts';

const poison = { toString: 1 };

test('sessionViewFromData does not throw on map-valued hostId or location', () => {
  const view = sessionViewFromData({
    hostId: poison,
    location: poison,
    status: 'active',
    participantIds: ['a', 7, 'b'],
  });
  assert.equal(view.hostId, undefined);
  assert.equal(view.location, undefined);
  assert.deepEqual(view.participantIds, ['a', 'b']);
});

test('sessionViewFromData ignores array locations and non-string host ids', () => {
  const view = sessionViewFromData({ hostId: 42, location: ['x'], status: 'finished' });
  assert.equal(view.hostId, undefined);
  assert.equal(view.location, undefined);
  assert.equal(view.status, 'finished');
  assert.deepEqual(view.participantIds, []);
});

test('sessionViewFromData maps a normal chip session', () => {
  const view = sessionViewFromData({
    hostId: 'host',
    location: 'Home',
    smallBlind: 1,
    bigBlind: 2,
    amountUnit: 'chips',
    dollarsPerChip: 0.5,
    status: 'active',
    participantIds: ['host'],
    groupId: 'g1',
  });
  assert.deepEqual(view, {
    hostId: 'host',
    groupId: 'g1',
    location: 'Home',
    smallBlind: 1,
    bigBlind: 2,
    amountUnit: 'chips',
    dollarsPerChip: 0.5,
    date: undefined,
    status: 'active',
    participantIds: ['host'],
  });
});

test('sessionViewFromData drops invalid blinds and chip values', () => {
  const view = sessionViewFromData({ smallBlind: poison, bigBlind: '2', amountUnit: 'chips', dollarsPerChip: -1 });
  assert.equal(view.smallBlind, undefined);
  assert.equal(view.bigBlind, undefined);
  assert.equal(view.dollarsPerChip, undefined);
});
