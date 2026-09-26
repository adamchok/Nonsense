import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const USAGE = `Move a guest's history onto a real account.

  node scripts/migrate-guest.mjs --owner <yourUid> --guest <guestId> (--to <uid> | --code <friendCode>) [--apply]

  --owner     Your account id. Only sessions you hosted or played in, and groups you own, are touched.
  --guest     The guest's id, e.g. "bryan" (the guest name, lowercased, spaces -> _).
  --to        The guest's new account id.
  --code      Or their friend code (looked up in refCodes).
  --key       Service-account JSON (default: ./service-account.json). Ignored with --emulator.
  --emulator  Use the local Firestore emulator (project demo-nonsense).
  --apply     Write the changes. Without it the script only prints what it would do.`;

const { values: args } = parseArgs({
  options: {
    owner: { type: 'string' },
    guest: { type: 'string' },
    to: { type: 'string' },
    code: { type: 'string' },
    key: { type: 'string', default: 'service-account.json' },
    emulator: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (args.help || !args.owner || !args.guest || (!args.to && !args.code)) {
  console.log(USAGE);
  process.exit(args.help ? 0 : 1);
}

if (args.emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  initializeApp({ projectId: 'demo-nonsense' });
} else {
  const key = JSON.parse(readFileSync(args.key, 'utf8'));
  initializeApp({ credential: cert(key), projectId: key.project_id });
}

const db = getFirestore();
const { owner, guest, apply } = args;
const log = (...a) => console.log(apply ? '[apply]' : '[dry-run]', ...a);

async function resolveTarget() {
  if (args.to) return args.to;
  const snap = await db.doc(`refCodes/${args.code.trim().toUpperCase()}`).get();
  if (!snap.exists) throw new Error(`No account with friend code ${args.code}`);
  return String(snap.get('playerId'));
}

const target = await resolveTarget();
if (target === guest) throw new Error('--to must differ from --guest');
if (target === owner) throw new Error('--to is your own account; pass the guest’s new account');

const profileSnap = await db.doc(`players/${target}`).get();
if (!profileSnap.exists) throw new Error(`players/${target} not found. Has the guest finished sign-up?`);
const targetName = String(profileSnap.get('name') ?? '').trim() || guest;
const targetAvatar = profileSnap.get('avatarEmoji') ?? null;
const guestProfile = await db.doc(`players/${guest}`).get();
if (guestProfile.exists) throw new Error(`"${guest}" is a real account id, not a guest`);

console.log(`Owner ${owner}\nGuest "${guest}" -> ${target} (${targetName})\n`);

async function moveDoc(batch, from, to, patch) {
  const snap = await from.get();
  if (!snap.exists) return false;
  const existing = await to.get();
  if (existing.exists) throw new Error(`${to.path} already exists; refusing to overwrite`);
  batch.set(to, { ...snap.data(), ...patch });
  batch.delete(from);
  return true;
}

const sessionsSnap = await db.collection('sessions').where('participantIds', 'array-contains', guest).get();
const mine = sessionsSnap.docs.filter((d) => {
  const ids = d.get('participantIds') ?? [];
  return d.get('hostId') === owner || ids.includes(owner);
});
const skipped = [];
let movedSessions = 0;

for (const session of mine) {
  const ids = session.get('participantIds') ?? [];
  if (ids.includes(target)) {
    skipped.push(`${session.id}: ${targetName} and "${guest}" both played in it`);
    continue;
  }
  const batch = db.batch();
  const ref = session.ref;
  batch.update(ref, { participantIds: ids.map((id) => (id === guest ? target : id)) });

  const moved = [];
  if (
    await moveDoc(batch, ref.collection('session_participants').doc(guest), ref.collection('session_participants').doc(target), {
      playerId: target,
      playerName: targetName,
    })
  )
    moved.push('participant');
  if (await moveDoc(batch, ref.collection('results').doc(guest), ref.collection('results').doc(target), { playerName: targetName }))
    moved.push('result');
  if (
    await moveDoc(batch, ref.collection('early_cashouts').doc(guest), ref.collection('early_cashouts').doc(target), {
      playerName: targetName,
    })
  )
    moved.push('early cash-out');

  const buyIns = await ref.collection('buy_ins').where('playerId', '==', guest).get();
  for (const b of buyIns.docs) batch.update(b.ref, { playerId: target, playerName: targetName });
  if (buyIns.size) moved.push(`${buyIns.size} buy-in(s)`);

  const date = session.get('date')?.toDate?.().toISOString().slice(0, 10) ?? '?';
  log(`session ${session.id} (${date}): ${moved.join(', ') || 'participant id only'}`);
  if (apply) await batch.commit();
  movedSessions++;
}

const groupsSnap = await db.collection('groups').where('ownerId', '==', owner).get();
let movedGroups = 0;
for (const group of groupsSnap.docs) {
  const guestRef = group.ref.collection('members').doc(guest);
  const guestMember = await guestRef.get();
  if (!guestMember.exists) continue;

  const batch = db.batch();
  const targetRef = group.ref.collection('members').doc(target);
  const alreadyMember = (await targetRef.get()).exists;
  if (alreadyMember) {
    batch.update(group.ref, { memberCount: FieldValue.increment(-1) });
  } else {
    batch.set(targetRef, { name: targetName, isRegistered: true, avatarEmoji: targetAvatar });
  }
  batch.delete(guestRef);

  const g = group.data();
  const membership = {
    name: String(g.name ?? ''),
    memberCount: Number(g.memberCount ?? 0) - (alreadyMember ? 1 : 0),
    ownerId: owner,
    role: 'member',
  };
  const createdAt = g.createdAt ?? g.groupCreatedAt;
  if (createdAt) membership.groupCreatedAt = createdAt;
  batch.set(db.doc(`players/${target}/group_memberships/${group.id}`), membership, { merge: true });

  log(`group ${group.id} (${g.name}): guest -> member${alreadyMember ? ' (already a member; guest removed)' : ''}`);
  if (apply) await batch.commit();
  movedGroups++;
}

const others = sessionsSnap.size - mine.length;
console.log(`\n${movedSessions} session(s), ${movedGroups} group(s) ${apply ? 'migrated' : 'would be migrated'}.`);
if (others) console.log(`${others} session(s) with a "${guest}" guest belong to other hosts and were left alone.`);
for (const s of skipped) console.log(`Skipped ${s}`);
if (!apply) console.log('\nRe-run with --apply to write these changes.');
