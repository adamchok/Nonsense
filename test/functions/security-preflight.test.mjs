import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';

import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { runPreflight } from '../../scripts/security-preflight.mjs';

const PROJECT_ID = 'demo-nonsense-preflight';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

let app;
let db;

before(async () => {
  app = initializeApp({ projectId: PROJECT_ID }, 'preflight-test');
  db = getFirestore(app);
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  assert.ok(res.ok, `could not clear emulator: ${res.status}`);

  const many = Array.from({ length: 51 }, (_, i) => `p${i}`);
  await db.doc('sessions/ok').set({ hostId: 'a', status: 'active', participantIds: ['a', 'b'], playerResults: { a: { profit: 0 } }, location: 'Home' });
  await db.doc('sessions/big').set({ hostId: 'p0', status: 'finished', participantIds: many });
  await db.doc('sessions/legacyActive').set({ hostId: 'a', status: 'active' });
  await db.doc('sessions/ok/buy_ins/b1').set({ playerId: 'b', playerName: 'B', amount: 10 });
  await db.doc('sessions/orphan').set({ hostId: 'a', status: 'active', participantIds: ['a'] });
  await db.doc('sessions/orphan/buy_ins/b1').set({ playerId: 'a', playerName: 'A', amount: 10 });
  await db.doc('sessions/orphan/buy_ins/b2').set({ playerId: 'guest_x', playerName: 'X', amount: 10 });
  await db.doc('sessions/orphan/buy_ins/b3').set({ playerId: 'guest_x', playerName: 'X', amount: 5 });
  await db.doc('sessions/legacyFinished/buy_ins/b1').set({ playerId: 'nobody', playerName: 'N', amount: 10 });
  await db.doc('sessions/legacyFinished').set({ hostId: 'a', status: 'finished' });
  await db.doc('sessions/stray').set({ hostId: 'a', status: 'finished', participantIds: ['a'], playerResults: { a: {}, ghost: {} } });
  await db.doc('sessions/longLoc').set({ hostId: 'a', status: 'finished', participantIds: ['a'], location: 'x'.repeat(101) });
  await db.doc('sessions/numLoc').set({ hostId: 'a', status: 'finished', participantIds: ['a'], location: 42 });
  await db.doc('players/a').set({ name: 'A', avatarEmoji: '🦊' });
  await db.doc('players/b').set({ name: 'B', avatarEmoji: 'y'.repeat(33) });
  await db.doc('players/a/saved_locations/l1').set({ name: 'Short' });
  await db.doc('players/a/saved_locations/l2').set({ name: 'z'.repeat(101) });
  await db.doc('groups/g1').set({ name: 'Fine', ownerId: 'a', memberCount: 2 });
  await db.doc('groups/g2').set({ name: 'n'.repeat(65), ownerId: 'a', memberCount: 1 });
  await db.doc('groups/g3').set({ name: 'Neg', ownerId: 'a', memberCount: -1 });
  await db.doc('groups/g4').set({ name: 'None', ownerId: 'a' });
  await db.doc('players/a/group_memberships/g1').set({ name: 'Fine', ownerId: 'a', role: 'owner', memberCount: 2 });
  await db.doc('players/b/group_memberships/g1').set({ name: 'Fine', ownerId: 'b', role: 'member', memberCount: 2 });
  await db.doc('players/b/group_memberships/g2').set({ name: 'x', role: 'member', memberCount: 1 });
  await db.doc('players/b/group_memberships/gGone').set({ name: 'Gone', ownerId: 'a', role: 'member', memberCount: 1 });
  await db.doc('players/a/friends/b').set({ name: 'B', addedAt: new Date() });
  await db.doc('players/a/friend_requests/b').set({ name: 'B', createdAt: new Date() });
  await db.doc('players/a/friend_requests/c').set({ name: 'C', createdAt: new Date() });
});

after(async () => {
  await deleteApp(app);
});

test('preflight lists every document the new rules would reject, without writing', async () => {
  const { issues, deletedFriendTokens } = await runPreflight(db);

  assert.deepEqual(issues, {
    participantIdsOver50: ['big'],
    activeWithoutParticipantIds: ['legacyActive'],
    activeBuyInPlayerNotParticipant: ['orphan:guest_x'],
    playerResultsOutsideParticipants: ['stray'],
    locationInvalid: ['longLoc', 'numLoc'],
    playerAvatarInvalid: ['b'],
    groupNameInvalid: ['g2'],
    groupMemberCountInvalid: ['g3'],
    groupMemberCountMissing: ['g4'],
    membershipOwnerMismatch: ['players/b/group_memberships/g1', 'players/b/group_memberships/g2'],
    membershipGroupMissing: ['players/b/group_memberships/gGone'],
    savedLocationNameInvalid: ['players/a/saved_locations/l2'],
    staleFriendRequestTokens: ['players/a/friend_requests/b'],
  });
  assert.equal(deletedFriendTokens, 0);
  assert.equal((await db.doc('players/a/friend_requests/b').get()).exists, true);
});

test('preflight CLI is a dry run unless asked to clean up friend tokens', () => {
  const run = spawnSync(process.execPath, ['scripts/security-preflight.mjs', '--emulator', '--project', PROJECT_ID], {
    cwd: new URL('../..', import.meta.url),
    env: process.env,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /staleFriendRequestTokens: 1/);
  assert.match(run.stdout, /Nothing written/);
});

test('friend token cleanup deletes only tokens whose friendship already exists', async () => {
  const { deletedFriendTokens } = await runPreflight(db, { applyFriendTokenCleanup: true });

  assert.equal(deletedFriendTokens, 1);
  assert.equal((await db.doc('players/a/friend_requests/b').get()).exists, false);
  assert.equal((await db.doc('players/a/friend_requests/c').get()).exists, true);
  assert.equal((await db.doc('players/a/friends/b').get()).exists, true);
  const again = await runPreflight(db);
  assert.equal(again.issues.staleFriendRequestTokens, undefined);
});

test('preflight refuses --emulator with a non-demo project and needs a project', () => {
  const cwd = new URL('../..', import.meta.url);
  const refused = spawnSync(process.execPath, ['scripts/security-preflight.mjs', '--emulator', '--project', 'nonsense-4a9d9'], { cwd, env: process.env, encoding: 'utf8', timeout: 20000 });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /demo- project/);
  const env = { ...process.env };
  delete env.FIRESTORE_EMULATOR_HOST;
  const usage = spawnSync(process.execPath, ['scripts/security-preflight.mjs'], { cwd, env, encoding: 'utf8', timeout: 20000 });
  assert.equal(usage.status, 1);
  assert.match(usage.stdout, /--project <id> \| --emulator/);
});
