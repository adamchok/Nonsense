import { FieldValue } from 'firebase-admin/firestore';

/** Shown in other players' history in place of the deleted player's name. */
export const DELETED_PLAYER_NAME = 'Deleted player';

const BATCH_LIMIT = 400;

/** Deletion is refused while the user hosts a live session: nobody else could finish or settle it. */
export class HostingLiveSessionError extends Error {
  constructor() {
    super('You are hosting a live session. Finish or delete it before deleting your account.');
    this.name = 'HostingLiveSessionError';
  }
}

async function commitInBatches(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

const deleteOp = (ref) => (batch) => batch.delete(ref);

/** Registered players other than `uid` among the session's participants (guest ids have no players doc). */
async function otherRegisteredPlayers(db, session, uid) {
  const ids = (session.get('participantIds') ?? []).filter((id) => typeof id === 'string' && id && id !== uid);
  if (!ids.length) return [];
  const snaps = await db.getAll(...ids.map((id) => db.collection('players').doc(id)));
  return snaps.filter((s) => s.exists).map((s) => s.id);
}

/** Replaces the player's name everywhere in one session; amounts stay so other players' history stays accurate. */
async function anonymiseInSession(db, sessionRef, uid) {
  const named = ['results', 'early_cashouts', 'session_participants'].map((sub) => sessionRef.collection(sub).doc(uid));
  const [buyIns, ...snaps] = await Promise.all([
    sessionRef.collection('buy_ins').where('playerId', '==', uid).get(),
    ...named.map((ref) => ref.get()),
  ]);
  const ops = [
    ...snaps.filter((s) => s.exists).map((s) => (batch) => batch.update(s.ref, { playerName: DELETED_PLAYER_NAME })),
    ...buyIns.docs.map((d) => (batch) => batch.update(d.ref, { playerName: DELETED_PLAYER_NAME })),
  ];
  await commitInBatches(db, ops);
}

async function removeFromSessions(db, uid) {
  const sessions = db.collection('sessions');
  const [hosted, joined] = await Promise.all([
    sessions.where('hostId', '==', uid).get(),
    sessions.where('participantIds', 'array-contains', uid).get(),
  ]);
  if (hosted.docs.some((d) => d.get('status') === 'active')) throw new HostingLiveSessionError();

  for (const session of hosted.docs) {
    // Only the host and their guests: nobody else relies on it, so it goes entirely.
    if ((await otherRegisteredPlayers(db, session, uid)).length === 0) {
      await db.recursiveDelete(session.ref);
    } else {
      await anonymiseInSession(db, session.ref, uid);
    }
  }
  for (const session of joined.docs) {
    if (session.get('hostId') !== uid) await anonymiseInSession(db, session.ref, uid);
  }
}

async function removeFromGroups(db, uid) {
  const owned = await db.collection('groups').where('ownerId', '==', uid).get();
  for (const group of owned.docs) {
    const members = await group.ref.collection('members').get();
    const registered = members.docs.filter((m) => Boolean(m.get('isRegistered'))).map((m) => m.id);
    const memberships = [...new Set([uid, ...registered])].map((pid) =>
      db.collection('players').doc(pid).collection('group_memberships').doc(group.id)
    );
    await commitInBatches(db, memberships.map(deleteOp));
    await db.recursiveDelete(group.ref);
  }

  const memberships = await db.collection('players').doc(uid).collection('group_memberships').get();
  const ownedIds = new Set(owned.docs.map((g) => g.id));
  for (const m of memberships.docs) {
    if (ownedIds.has(m.id)) continue;
    const groupRef = db.collection('groups').doc(m.id);
    const memberRef = groupRef.collection('members').doc(uid);
    await db.runTransaction(async (tx) => {
      const [group, member] = await Promise.all([tx.get(groupRef), tx.get(memberRef)]);
      if (!member.exists) return;
      tx.delete(memberRef);
      if (group.exists) tx.update(groupRef, { memberCount: FieldValue.increment(-1) });
    });
  }
}

/** Mirror docs other players hold about this user: friendships and pending requests in both directions. */
async function removeFromFriends(db, uid) {
  const me = db.collection('players').doc(uid);
  const player = (id) => db.collection('players').doc(id);
  const [friends, requestsIn, requestsOut] = await Promise.all([
    me.collection('friends').get(),
    me.collection('friend_requests').get(),
    me.collection('friend_requests_sent').get(),
  ]);
  const refs = [
    ...friends.docs.map((d) => player(d.id).collection('friends').doc(uid)),
    ...requestsIn.docs.map((d) => player(d.id).collection('friend_requests_sent').doc(uid)),
    ...requestsOut.docs.map((d) => player(d.id).collection('friend_requests').doc(uid)),
  ];
  await commitInBatches(db, refs.map(deleteOp));
}

async function removeGuestLinksAndRefCode(db, uid, profile) {
  const links = db.collection('guest_links');
  const [owned, targeted] = await Promise.all([
    links.where('ownerId', '==', uid).get(),
    links.where('targetId', '==', uid).get(),
  ]);
  const refs = [...owned.docs, ...targeted.docs].map((d) => d.ref);

  const code = profile.exists ? profile.get('refCode') : null;
  if (typeof code === 'string' && code) {
    const refCode = await db.collection('refCodes').doc(code).get();
    if (refCode.exists && refCode.get('playerId') === uid) refs.push(refCode.ref);
  }
  await commitInBatches(db, refs.map(deleteOp));
}

/**
 * Removes a player's personal data. Sessions other registered players took part in keep their amounts
 * with the name replaced by DELETED_PLAYER_NAME; everything else about the player is deleted.
 * Safe to run again after a partial failure. The Auth user is deleted separately by the caller.
 */
export async function deleteAccountData(db, uid) {
  if (typeof uid !== 'string' || !uid) throw new Error('A user id is required.');
  const playerRef = db.collection('players').doc(uid);
  const profile = await playerRef.get();

  // Sessions first: it is the only step that can refuse, so nothing is half-deleted when it does.
  await removeFromSessions(db, uid);
  await removeFromFriends(db, uid);
  await removeFromGroups(db, uid);
  await removeGuestLinksAndRefCode(db, uid, profile);
  await db.recursiveDelete(playerRef);
}
