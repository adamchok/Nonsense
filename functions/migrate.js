import { FieldValue } from 'firebase-admin/firestore';

const GUEST_LINKS = 'guest_links';

function nonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function readLink(data) {
  const link = {
    ownerId: data.ownerId,
    guestId: data.guestId,
    targetId: data.targetId,
    targetName: typeof data.targetName === 'string' && data.targetName.trim() ? data.targetName.trim() : null,
    status: data.status,
    sessions: data.sessions,
  };
  if (![link.ownerId, link.guestId, link.targetId].every(nonEmptyString)) {
    throw new Error('Guest link is missing owner, guest or target ids.');
  }
  if (new Set([link.ownerId, link.guestId, link.targetId]).size !== 3) {
    throw new Error('Guest link owner, guest and target must all differ.');
  }
  if (!link.targetName) throw new Error('Guest link has no target name.');
  if (!link.sessions || typeof link.sessions !== 'object' || Array.isArray(link.sessions)) {
    throw new Error('Guest link has no frozen sessions map.');
  }
  return link;
}

function frozenProfit(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function liveProfit(resultSnap) {
  if (!resultSnap.exists) return 0;
  const profit = resultSnap.get('profit');
  return typeof profit === 'number' && Number.isFinite(profit) ? profit : 0;
}

function sessionMigratable(session, link) {
  if (!session.exists) return false;
  const ids = session.get('participantIds');
  return (
    session.get('hostId') === link.ownerId &&
    session.get('status') === 'finished' &&
    Array.isArray(ids) &&
    ids.includes(link.guestId) &&
    !ids.includes(link.targetId)
  );
}

function stageMove(tx, from, to, patch) {
  if (!from.exists) return;
  if (!to.exists) tx.set(to.ref, { ...from.data(), ...patch });
  tx.delete(from.ref);
}

async function migrateSession(db, sessionId, expectedProfit, link) {
  const sessionRef = db.collection('sessions').doc(sessionId);
  return db.runTransaction(async (tx) => {
    const session = await tx.get(sessionRef);
    if (!sessionMigratable(session, link)) return false;
    const sub = (name, id) => sessionRef.collection(name).doc(id);
    const [result, targetResult, cashOut, targetCashOut, participant, targetParticipant, buyIns] = await Promise.all([
      tx.get(sub('results', link.guestId)),
      tx.get(sub('results', link.targetId)),
      tx.get(sub('early_cashouts', link.guestId)),
      tx.get(sub('early_cashouts', link.targetId)),
      tx.get(sub('session_participants', link.guestId)),
      tx.get(sub('session_participants', link.targetId)),
      tx.get(sessionRef.collection('buy_ins').where('playerId', '==', link.guestId)),
    ]);
    if (expectedProfit === null || liveProfit(result) !== expectedProfit) return false;

    const moved = { playerName: link.targetName, migratedFrom: link.guestId };
    stageMove(tx, result, targetResult, moved);
    stageMove(tx, cashOut, targetCashOut, moved);
    stageMove(tx, participant, targetParticipant, { playerId: link.targetId, playerName: link.targetName });
    for (const b of buyIns.docs) {
      tx.update(b.ref, { playerId: link.targetId, playerName: link.targetName });
    }
    const ids = session.get('participantIds');
    tx.update(sessionRef, { participantIds: ids.map((id) => (id === link.guestId ? link.targetId : id)) });
    return true;
  });
}

function membershipPayload(group, memberCount) {
  const createdAt = group.createdAt ?? group.groupCreatedAt;
  return {
    name: String(group.name ?? ''),
    memberCount,
    ownerId: String(group.ownerId ?? ''),
    ...(createdAt !== undefined && createdAt !== null ? { groupCreatedAt: createdAt } : {}),
  };
}

async function migrateGroup(db, groupRef, link, avatarEmoji) {
  return db.runTransaction(async (tx) => {
    const group = await tx.get(groupRef);
    if (!group.exists || group.get('ownerId') !== link.ownerId) return false;
    const members = await tx.get(groupRef.collection('members'));
    const guest = members.docs.find((d) => d.id === link.guestId);
    if (!guest) return false;

    const alreadyMember = members.docs.some((d) => d.id === link.targetId);
    const current = Number(group.get('memberCount') ?? 0);
    const memberCount = Math.max(0, alreadyMember ? current - 1 : current);
    if (alreadyMember) {
      tx.update(groupRef, { memberCount });
    } else {
      tx.set(groupRef.collection('members').doc(link.targetId), {
        name: link.targetName,
        isRegistered: true,
        avatarEmoji,
      });
    }
    tx.delete(guest.ref);

    const registered = members.docs.filter((d) => d.id !== link.guestId && Boolean(d.get('isRegistered')));
    const ids = new Set([link.ownerId, link.targetId, ...registered.map((d) => d.id)]);
    const base = membershipPayload(group.data(), memberCount);
    for (const pid of ids) {
      tx.set(
        db.collection('players').doc(pid).collection('group_memberships').doc(groupRef.id),
        { ...base, role: pid === link.ownerId ? 'owner' : 'member' },
        { merge: true }
      );
    }
    return true;
  });
}

async function targetAvatar(db, targetId) {
  const profile = await db.collection('players').doc(targetId).get();
  const raw = profile.exists ? profile.get('avatarEmoji') : null;
  return typeof raw === 'string' && raw ? raw : null;
}

export async function migrateGuestLink(db, linkId) {
  const linkRef = db.collection(GUEST_LINKS).doc(linkId);
  const snap = await linkRef.get();
  if (!snap.exists) return { found: false, sessions: 0, skipped: 0, groups: 0 };
  const data = snap.data();
  if (data.status !== 'accepted') throw new Error(`Guest link ${linkId} is ${String(data.status)}, not accepted.`);
  const link = readLink(data);

  let sessions = 0;
  let skipped = 0;
  for (const [sessionId, profit] of Object.entries(link.sessions)) {
    if (await migrateSession(db, sessionId, frozenProfit(profit), link)) sessions += 1;
    else skipped += 1;
  }

  const avatarEmoji = await targetAvatar(db, link.targetId);
  const groupsSnap = await db.collection('groups').where('ownerId', '==', link.ownerId).get();
  let groups = 0;
  for (const g of groupsSnap.docs) {
    if (await migrateGroup(db, g.ref, link, avatarEmoji)) groups += 1;
  }

  await linkRef.delete();
  return { found: true, sessions, skipped, groups };
}

export async function markGuestLinkFailed(db, linkId) {
  const linkRef = db.collection(GUEST_LINKS).doc(linkId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(linkRef);
    if (!snap.exists) return;
    tx.update(linkRef, { status: 'failed', failedAt: FieldValue.serverTimestamp() });
  });
}

export async function runGuestLinkMigration(db, linkId, logger) {
  try {
    const result = await migrateGuestLink(db, linkId);
    logger.info('Guest link migrated', { linkId, ...result });
    return result;
  } catch (err) {
    logger.error('Guest link migration failed', { linkId, error: err instanceof Error ? err.stack : String(err) });
    try {
      await markGuestLinkFailed(db, linkId);
    } catch (markErr) {
      logger.error('Could not mark guest link as failed', {
        linkId,
        error: markErr instanceof Error ? markErr.stack : String(markErr),
      });
    }
    return null;
  }
}
