import { FaceArt } from '@/components/face-art';
import { FACE_DISC, isFaceAvatar } from '@/lib/avatar-face';
import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

const DEFAULT_AVATAR = '🙂';

export const PlayerAvatar = memo(function PlayerAvatar({
  value,
  size,
  style,
}: {
  value: string | null | undefined;
  size: number;
  style?: StyleProp<TextStyle>;
}) {
  const avatar = value?.trim() || DEFAULT_AVATAR;
  if (isFaceAvatar(avatar)) {
    return (
      <View
        importantForAccessibility="no-hide-descendants"
        style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
        <FaceArt value={avatar} size={size} />
      </View>
    );
  }
  const fontSize = Math.round(size * 0.6);
  return (
    <Text
      importantForAccessibility="no"
      style={[styles.emoji, { fontSize, lineHeight: Math.round(fontSize * 1.2) }, style]}>
      {avatar}
    </Text>
  );
});

const styles = StyleSheet.create({
  disc: { backgroundColor: FACE_DISC, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  emoji: { textAlign: 'center', includeFontPadding: false },
});
