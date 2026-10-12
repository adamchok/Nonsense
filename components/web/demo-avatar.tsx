import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

// Illustrated demo players: "Notionists" by Zoish, CC0 1.0 (via DiceBear). Black line art, so they always
// sit on a light disc, which keeps them readable on the dark theme too.
const FACES = {
  Alex: require('@/assets/images/avatars/alex.svg'),
  Jordan: require('@/assets/images/avatars/jordan.svg'),
  Priya: require('@/assets/images/avatars/priya.svg'),
  Sam: require('@/assets/images/avatars/sam.svg'),
  Chris: require('@/assets/images/avatars/chris.svg'),
} as const;

export type DemoPlayer = keyof typeof FACES;

const DISC = '#fbf1da';

export function DemoAvatar({
  name,
  size,
  style,
}: {
  name: DemoPlayer;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Image source={FACES[name]} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { backgroundColor: DISC, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
