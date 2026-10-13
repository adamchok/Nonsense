import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { logger as defaultLogger } from 'firebase-functions';

export const DELETED_PLAYER_NAME = 'Deleted player';
export const DELETION_FAILURES = 'deletion_failures';

const BATCH_LIMIT = 400;
const SESSION_PAGE_SIZE = 50;
const SESSION_CONCURRENCY = 10;

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

async function otherRegisteredPlayers(db, session, uid) {
  const ids = (session.get('participantIds') ?? []).filter((id) => typeof id === 'string' && id && id !== uid);
  if (!ids.length) return [];
  const snaps = await db.getAll(...ids.map((id) => db.collection('players').doc(id)));
  return snaps.filter((s) => s.exists).map((s) => s.id);
}

function hasPlayerResult(session, uid) {
  const map = session.get('playerResults');
  return Boolean(map && typeof map === 'object' && !Array.isArray(map) && map[uid]);
}

const uidKeyedDocs = (sessionRef, uid) =>
  ['results', 'early_cashouts', 'session_participants'].map((sub) => sessionRef.collection(sub).doc(uid));

const userBuyIns = (sessionRef, uid) => sessionRef.collection('buy_ins').where('playerId', '==', uid).get();

async function anonymiseInSession(db, session, uid) {
  const sessionRef = session.ref;
  const named = uidKeyedDocs(sessionRef, uid);
  const [buyIns, ...snaps] = await Promise.all([userBuyIns(sessionRef, uid), ...named.map((ref) => ref.get())]);
  const ops = [
    ...snaps.filter((s) => s.exists).map((s) => (batch) => batch.update(s.ref, { playerName: DELETED_PLAYER_NAME })),
    ...buyIns.docs.map((d) => (batch) => batch.update(d.ref, { playerName: DELETED_PLAYER_NAME })),
  ];
  if (hasPlayerResult(session, uid)) {
    ops.push((batch) => batch.update(sessionRef, new FieldPath('playerResults', uid, 'playerName'), DELETED_PLAYER_NAME));
  }
  await commitInBatches(db, ops);
}

async function detachFromSession(db, session, uid) {
  const sessionRef = session.ref;
  const buyIns = await userBuyIns(sessionRef, uid);
  await commitInBatches(db, [...uidKeyedDocs(sessionRef, uid), ...buyIns.docs.map((d) => d.ref)].map(deleteOp));
  await sessionRef.update(
    new FieldPath('playerResults', uid),
    FieldValue.delete(),
    'participantIds',
    FieldValue.arrayRemove(uid)
  );
}

const errorFields = (err) => ({ code: err?.code ?? null, message: err instanceof Error ? err.message : String(err) });

async function recordDeletionFailure(db, session, uid, err, log) {
  try {
    await db.collection(DELETION_FAILURES).add({
      uid,
      sessionId: session.id,
      at: FieldValue.serverTimestamp(),
      code: err?.code ?? null,
    });
  } catch (recordErr) {
    log.error('Could not record deletion failure', { sessionId: session.id, uid, ...errorFields(recordErr) });
  }
}

async function anonymiseInSessionSafely(db, session, uid, log) {
  try {
    await anonymiseInSession(db, session, uid);
    return;
  } catch (err) {
    log.error('Session anonymisation failed, detaching user', { sessionId: session.id, uid, ...errorFields(err) });
  }
  try {
    await detachFromSession(db, session, uid);
  } catch (err) {
    log.error('Session detach failed, skipping session', { sessionId: session.id, uid, ...errorFields(err) });
    await recordDeletionFailure(db, session, uid, err, log);
  }
}

async function forEachPage(query, handle) {
  let last = null;
  for (;;) {
    const page = await (last ? query.startAfter(last) : query).limit(SESSION_PAGE_SIZE).get();
    for (let i = 0; i < page.docs.length; i += SESSION_CONCURRENCY) {
      await Promise.all(page.docs.slice(i, i + SESSION_CONCURRENCY).map(handle));
    }
    if (page.size < SESSION_PAGE_SIZE) return;
    last = page.docs[page.docs.length - 1];
  }
}

async function removeHostedSession(db, session, uid, log) {
  if ((await otherRegisteredPlayers(db, session, uid)).length === 0) {
    await db.recursiveDelete(session.ref);
  } else {
    await anonymiseInSessionSafely(db, session, uid, log);
  }
}

async function assertNotHostingLiveSession(db, uid) {
  const sessions = db.collection('sessions');
  const live = await sessions.where('hostId', '==', uid).where('status', '==', 'active').limit(1).get();
  if (!live.empty) throw new HostingLiveSessionError();
}

async function removeFromSessions(db, uid, log) {
  const sessions = db.collection('sessions');
  const ownResult = new FieldPath('playerResults', uid);

  await forEachPage(sessions.where('hostId', '==', uid).select('participantIds', ownResult), (session) =>
    removeHostedSession(db, session, uid, log)
  );
  await forEachPage(sessions.where('participantIds', 'array-contains', uid).select('hostId', ownResult), (session) =>
    session.get('hostId') === uid ? null : anonymiseInSessionSafely(db, session, uid, log)
  );
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
      const count = group.exists ? group.get('memberCount') : null;
      if (typeof count === 'number' && count > 0) tx.update(groupRef, { memberCount: FieldValue.increment(-1) });
    });
  }
}

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

async function removeGuestLinksAndRefCode(db, uid) {
  const links = db.collection('guest_links');
  const [owned, targeted, ownCodes] = await Promise.all([
    links.where('ownerId', '==', uid).get(),
    links.where('targetId', '==', uid).get(),
    db.collection('refCodes').where('playerId', '==', uid).get(),
  ]);
  const refs = [...owned.docs, ...targeted.docs, ...ownCodes.docs].map((d) => d.ref);
  await commitInBatches(db, refs.map(deleteOp));
}

export async function deleteAccountData(db, uid, log = defaultLogger) {
  if (typeof uid !== 'string' || !uid) throw new Error('A user id is required.');
  await assertNotHostingLiveSession(db, uid);
  await removeGuestLinksAndRefCode(db, uid);
  await removeFromSessions(db, uid, log);
  await removeFromFriends(db, uid);
  await removeFromGroups(db, uid);
  await db.recursiveDelete(db.collection('players').doc(uid));
}
