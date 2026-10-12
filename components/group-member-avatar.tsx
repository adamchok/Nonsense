import { PlayerAvatar } from '@/components/player-avatar';
import { pickGuestAvatar } from '@/lib/avatar';
import { useAppColors } from '@/lib/app-theme';
import type { GroupMember, PlayerProfile } from '@/types';
import { StyleSheet, View } from 'react-native';

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
  return pickGuestAvatar(member.id);
}

type GroupMemberAvatarProps = {
  member: GroupMember;
  viewerProfile?: PlayerProfile | null;
  size?: 'default' | 'compact';
};

export function GroupMemberAvatar({ member, viewerProfile, size = 'default' }: GroupMemberAvatarProps) {
  const c = useAppColors();
  const dim = size === 'compact' ? 28 : 32;
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
      <PlayerAvatar value={emoji} size={dim} style={{ color: c.text }} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
