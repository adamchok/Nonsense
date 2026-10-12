import { FACE_DISC, faceSvg, isFaceAvatar } from '@/lib/avatar-face';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

const DEFAULT_AVATAR = '🙂';

/** One avatar renderer for the whole app: illustrated face (`nf:<seed>`) or a legacy emoji. */
export function PlayerAvatar({
  value,
  size,
  style,
}: {
  value: string | null | undefined;
  /** Face diameter in px; legacy emoji render at ~60% of it so rows keep their rhythm. */
  size: number;
  style?: StyleProp<TextStyle>;
}) {
  const avatar = value?.trim() || DEFAULT_AVATAR;
  if (isFaceAvatar(avatar)) {
    return (
      <View
        importantForAccessibility="no-hide-descendants"
        style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
        <SvgXml xml={faceSvg(avatar)} width={size} height={size} />
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
}

const styles = StyleSheet.create({
  disc: { backgroundColor: FACE_DISC, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  emoji: { textAlign: 'center', includeFontPadding: false },
});
