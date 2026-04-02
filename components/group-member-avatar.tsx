import { StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import type { GroupMember, PlayerProfile } from '@/types';

/** Emoji shown for a group member row (live avatar for the current user when `viewerProfile` matches). */
export function groupMemberDisplayEmoji(
  member: GroupMember,
  viewerProfile?: PlayerProfile | null
): string {
  if (viewerProfile && member.id === viewerProfile.id) {
    const live = viewerProfile.avatarEmoji?.trim();
    if (live) return live;
  }
  const stored = member.avatarEmoji?.trim();
  if (stored) return stored;
  return member.isRegistered ? '🙂' : '🎭';
}

type GroupMemberAvatarProps = {
  member: GroupMember;
  viewerProfile?: PlayerProfile | null;
  /** Default: 32px circle; compact: 28px for chips. */
  size?: 'default' | 'compact';
};

export function GroupMemberAvatar({ member, viewerProfile, size = 'default' }: GroupMemberAvatarProps) {
  const c = useAppColors();
  const dim = size === 'compact' ? 28 : 32;
  const fontSize = size === 'compact' ? 14 : 16;
  const emoji = groupMemberDisplayEmoji(member, viewerProfile);

  return (
    <View
      style={[
        styles.circle,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: c.avatarBg,
        },
      ]}>
      <Text style={[styles.emoji, { color: c.text, fontSize }]}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontWeight: '700',
  },
});
