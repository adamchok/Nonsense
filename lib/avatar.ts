import { AVATAR_EMOJIS } from '@/constants/avatar';

const DEFAULT_AVATAR = '🙂';

/** Stable emoji for a guest with no profile, derived from their player id. */
export function pickGuestAvatar(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length];
}

/** The viewer's own avatar, else a friend's, else a deterministic guest avatar. */
export function getAvatarEmoji(
  playerId: string,
  self: { id: string; avatarEmoji?: string } | null | undefined,
  friendAvatarMap: ReadonlyMap<string, string | undefined>
): string {
  if (self && playerId === self.id) return self.avatarEmoji ?? DEFAULT_AVATAR;
  if (friendAvatarMap.has(playerId)) return friendAvatarMap.get(playerId) ?? DEFAULT_AVATAR;
  return pickGuestAvatar(playerId);
}
