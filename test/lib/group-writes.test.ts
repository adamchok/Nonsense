import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  failedMembershipIds,
  leaveGroupInTransaction,
  membershipSyncError,
  type GroupTransaction,
} from '../../lib/group-writes.ts';

type Ref = string;

function fakeTx(docs: Record<Ref, Record<string, unknown> | undefined>) {
  const ops: [string, Ref, Record<string, unknown>?][] = [];
  const tx: GroupTransaction<Ref> = {
    get: async (ref) => ({ exists: () => docs[ref] !== undefined, data: () => docs[ref] }),
    delete: (ref) => ops.push(['delete', ref]),
    update: (ref, data) => ops.push(['update', ref, data]),
  };
  return { tx, ops };
}

const refs = { group: 'groups/g', member: 'groups/g/members/u', membership: 'players/u/group_memberships/g' };

test('leaving deletes the member, the count and the own membership in one transaction', async () => {
  const { tx, ops } = fakeTx({ [refs.group]: { ownerId: 'o', memberCount: 2 }, [refs.member]: { isRegistered: true } });

  await leaveGroupInTransaction(tx, refs, 'u');

  assert.deepEqual(ops.map(([op, ref]) => [op, ref]), [
    ['delete', refs.member],
    ['update', refs.group],
    ['delete', refs.membership],
  ]);
  assert.ok(ops[1][2] && 'memberCount' in ops[1][2]);
});

test('leaving without a member doc still removes the stale membership inside the transaction', async () => {
  const { tx, ops } = fakeTx({ [refs.group]: { ownerId: 'o', memberCount: 0 } });

  await leaveGroupInTransaction(tx, refs, 'u');

  assert.deepEqual(ops, [['delete', refs.membership]]);
});

test('the owner cannot leave and nothing is written', async () => {
  const { tx, ops } = fakeTx({ [refs.group]: { ownerId: 'u', memberCount: 1 }, [refs.member]: {} });

  await assert.rejects(leaveGroupInTransaction(tx, refs, 'u'), /owner cannot leave/);
  assert.deepEqual(ops, []);
});

test('failedMembershipIds pairs rejected outcomes with their ids', () => {
  const outcomes: PromiseSettledResult<unknown>[] = [
    { status: 'fulfilled', value: undefined },
    { status: 'rejected', reason: new Error('x') },
    { status: 'rejected', reason: new Error('y') },
  ];
  assert.deepEqual(failedMembershipIds(['o', 'a', 'b'], outcomes), ['a', 'b']);
});

test('membershipSyncError surfaces the added member or the owner, and ignores others', () => {
  assert.match(membershipSyncError(['a'], 'o', { id: 'a', name: 'Sam' })?.message ?? '', /^Sam was added/);
  assert.match(membershipSyncError(['o'], 'o')?.message ?? '', /your group list/);
  assert.match(membershipSyncError(['o'], 'o', { id: 'o', name: 'Me' })?.message ?? '', /your group list/);
  assert.equal(membershipSyncError(['b'], 'o', { id: 'a', name: 'Sam' }), null);
  assert.equal(membershipSyncError([], 'o'), null);
});
