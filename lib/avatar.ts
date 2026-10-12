import { faceValue } from '@/lib/avatar-face';

export function pickGuestAvatar(seed: string): string {
  return faceValue(seed);
}

export function getAvatarEmoji(
  playerId: string,
  self: { id: string; avatarEmoji?: string } | null | undefined,
  friendAvatarMap: ReadonlyMap<string, string | undefined>
): string {
  if (self && playerId === self.id) return self.avatarEmoji ?? pickGuestAvatar(playerId);
  if (friendAvatarMap.has(playerId)) return friendAvatarMap.get(playerId) ?? pickGuestAvatar(playerId);
  return pickGuestAvatar(playerId);
}
