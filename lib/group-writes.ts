import { increment } from 'firebase/firestore';

import { canDecrementMemberCount, isPlainObject, str } from './firestore-coerce.ts';

type SnapshotLike = { exists(): boolean; data(): unknown };

export type GroupTransaction<Ref> = {
  get(ref: Ref): Promise<SnapshotLike>;
  delete(ref: Ref): unknown;
  update(ref: Ref, data: Record<string, unknown>): unknown;
};

export type LeaveGroupRefs<Ref> = { group: Ref; member: Ref; membership: Ref };

export async function leaveGroupInTransaction<Ref>(
  tx: GroupTransaction<Ref>,
  refs: LeaveGroupRefs<Ref>,
  uid: string
): Promise<void> {
  const gSnap = await tx.get(refs.group);
  if (!gSnap.exists()) throw new Error('Group not found');
  const data = gSnap.data();
  const group = isPlainObject(data) ? data : {};
  if (str(group.ownerId) === uid) {
    throw new Error('The group owner cannot leave. Delete the group instead.');
  }
  const existing = await tx.get(refs.member);
  if (existing.exists()) {
    tx.delete(refs.member);
    if (canDecrementMemberCount(group.memberCount)) {
      tx.update(refs.group, { memberCount: increment(-1) });
    }
  }
  tx.delete(refs.membership);
}

export function failedMembershipIds(
  ids: readonly string[],
  outcomes: readonly PromiseSettledResult<unknown>[]
): string[] {
  return ids.filter((_, i) => outcomes[i]?.status === 'rejected');
}

export function membershipSyncError(
  failedIds: readonly string[],
  ownerId: string,
  required?: { id: string; name: string }
): Error | null {
  if (required && required.id !== ownerId && failedIds.includes(required.id)) {
    return new Error(`${required.name} was added, but the group may not show up for them yet. Add them again to retry.`);
  }
  if (failedIds.includes(ownerId)) {
    return new Error("The group was updated, but your group list couldn't refresh. Try again.");
  }
  return null;
}
