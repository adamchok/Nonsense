import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const USAGE = `Read-only scan for documents the tightened Firestore rules would reject on their next client update.

  node scripts/security-preflight.mjs (--project <id> | --emulator) [--apply-friend-token-cleanup]

  --project                     Firebase project id (Application Default Credentials). Required unless --emulator.
  --emulator                    Use the local Firestore emulator (project --project, default demo-nonsense; must start with demo-).
  --apply-friend-token-cleanup  Delete players/X/friend_requests/Y where players/X/friends/Y already exists
                                (leftover accept tokens). Without it nothing is written.`;

const MAX_SESSION_PLAYERS = 50;
const MAX_LOCATION = 100;
const MAX_GROUP_NAME = 64;
const MAX_AVATAR = 32;
const GET_ALL_CHUNK = 300;
const BATCH_LIMIT = 450;

const tooLong = (v, max) => v != null && (typeof v !== 'string' || v.length > max);

function sessionIssues(doc) {
  const d = doc.data();
  const out = [];
  const ids = d.participantIds;
  if (ids === undefined) {
    if (d.status === 'active') out.push('activeWithoutParticipantIds');
  } else if (!Array.isArray(ids)) {
    out.push('participantIdsNotList');
  } else if (ids.length > MAX_SESSION_PLAYERS) {
    out.push('participantIdsOver50');
  }
  const results = d.playerResults;
  if (results != null && typeof results === 'object' && !Array.isArray(results) && Array.isArray(ids)) {
    if (Object.keys(results).some((k) => !ids.includes(k))) out.push('playerResultsOutsideParticipants');
  }
  if (tooLong(d.location, MAX_LOCATION)) out.push('locationInvalid');
  return out;
}

function groupIssues(doc) {
  const d = doc.data();
  const out = [];
  if (typeof d.name !== 'string' || d.name.length === 0 || d.name.length > MAX_GROUP_NAME) out.push('groupNameInvalid');
  if (d.memberCount === undefined) out.push('groupMemberCountMissing');
  else if (!Number.isInteger(d.memberCount) || d.memberCount < 0) out.push('groupMemberCountInvalid');
  return out;
}

async function staleFriendTokens(db) {
  const tokens = (await db.collectionGroup('friend_requests').get()).docs.filter((d) => d.ref.parent.parent?.parent.id === 'players');
  const stale = [];
  for (let i = 0; i < tokens.length; i += GET_ALL_CHUNK) {
    const chunk = tokens.slice(i, i + GET_ALL_CHUNK);
    const friends = await db.getAll(...chunk.map((t) => t.ref.parent.parent.collection('friends').doc(t.id)));
    friends.forEach((f, j) => {
      if (f.exists) stale.push(chunk[j].ref);
    });
  }
  return stale;
}

async function staleMemberships(db) {
  const docs = (await db.collectionGroup('group_memberships').get()).docs.filter((d) => d.ref.parent.parent?.parent.id === 'players');
  const out = [];
  for (let i = 0; i < docs.length; i += GET_ALL_CHUNK) {
    const chunk = docs.slice(i, i + GET_ALL_CHUNK);
    const groups = await db.getAll(...chunk.map((m) => db.doc(`groups/${m.id}`)));
    groups.forEach((g, j) => {
      const ownerId = chunk[j].get('ownerId');
      if (!g.exists) out.push(['membershipGroupMissing', chunk[j].ref.path]);
      else if (typeof ownerId !== 'string' || ownerId !== g.get('ownerId')) out.push(['membershipOwnerMismatch', chunk[j].ref.path]);
    });
  }
  return out;
}

async function buyInsOutsideParticipants(db, sessions) {
  const active = new Map(
    sessions.docs
      .filter((s) => s.get('status') === 'active' && Array.isArray(s.get('participantIds')))
      .map((s) => [s.id, new Set(s.get('participantIds'))])
  );
  if (!active.size) return [];
  const buyIns = await db.collectionGroup('buy_ins').select('playerId').get();
  const out = new Set();
  for (const b of buyIns.docs) {
    const session = b.ref.parent.parent;
    if (session?.parent.id !== 'sessions') continue;
    const participants = active.get(session.id);
    const playerId = b.get('playerId');
    if (participants && !participants.has(playerId)) out.add(`${session.id}:${playerId}`);
  }
  return [...out].sort();
}

async function deleteRefs(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function runPreflight(db, { applyFriendTokenCleanup = false } = {}) {
  const issues = {};
  const add = (key, id) => (issues[key] ??= []).push(id);
  const [sessions, players, groups, locations] = await Promise.all([
    db.collection('sessions').get(),
    db.collection('players').get(),
    db.collection('groups').get(),
    db.collectionGroup('saved_locations').get(),
  ]);
  sessions.docs.forEach((s) => sessionIssues(s).forEach((k) => add(k, s.id)));
  players.docs.forEach((p) => {
    if (tooLong(p.get('avatarEmoji'), MAX_AVATAR)) add('playerAvatarInvalid', p.id);
  });
  groups.docs.forEach((g) => groupIssues(g).forEach((k) => add(k, g.id)));
  locations.docs.forEach((l) => {
    if (tooLong(l.get('name'), MAX_LOCATION)) add('savedLocationNameInvalid', l.ref.path);
  });
  (await buyInsOutsideParticipants(db, sessions)).forEach((id) => add('activeBuyInPlayerNotParticipant', id));
  (await staleMemberships(db)).forEach(([key, path]) => add(key, path));
  const stale = await staleFriendTokens(db);
  stale.forEach((ref) => add('staleFriendRequestTokens', ref.path));
  if (applyFriendTokenCleanup && stale.length) await deleteRefs(db, stale);
  return { issues, deletedFriendTokens: applyFriendTokenCleanup ? stale.length : 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: args } = parseArgs({
    options: {
      project: { type: 'string' },
      emulator: { type: 'boolean', default: false },
      'apply-friend-token-cleanup': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (args.help || (!args.emulator && !args.project)) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  const projectId = args.project ?? 'demo-nonsense';
  if (args.emulator) {
    if (!projectId.startsWith('demo-')) {
      console.error('--emulator only runs against a demo- project id.');
      process.exit(1);
    }
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    initializeApp({ projectId });
  } else {
    initializeApp({ credential: applicationDefault(), projectId });
  }
  const apply = args['apply-friend-token-cleanup'];
  const { issues, deletedFriendTokens } = await runPreflight(getFirestore(), { applyFriendTokenCleanup: apply });
  console.log(`Project ${projectId}${process.env.FIRESTORE_EMULATOR_HOST ? ` (emulator ${process.env.FIRESTORE_EMULATOR_HOST})` : ''}`);
  const keys = Object.keys(issues);
  if (!keys.length) console.log('No documents found that the new rules would reject.');
  for (const key of keys) console.log(`\n${key}: ${issues[key].length}\n  ${issues[key].join('\n  ')}`);
  if (apply) console.log(`\nDeleted ${deletedFriendTokens} stale friend request token(s).`);
  else if (issues.staleFriendRequestTokens) console.log('\nNothing written. Re-run with --apply-friend-token-cleanup to delete the stale tokens.');
  process.exit(0);
}
