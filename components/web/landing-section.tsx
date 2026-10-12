import { Icon, type IconName } from '@/components/icon';
import { type AppColors } from '@/lib/app-theme';
import { space } from '@/lib/spacing';
import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

/** Hex token to rgba, so a tile can carry a soft wash of its hue. */
function alpha(hex: string, a: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A rounded tile with a two-tone icon in one brand hue (gold, blue or green). */
export function IconTile({
  name,
  hue,
  size = 40,
  style,
}: {
  name: IconName;
  hue: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: alpha(hue, 0.12),
          borderColor: alpha(hue, 0.3),
        },
        style,
      ]}>
      <Icon
        name={name}
        size={Math.round(size * 0.56)}
        color={hue}
        weight="duotone"
        duotoneOpacity={0.28}
        importantForAccessibility="no"
      />
    </View>
  );
}

/**
 * The one heading pattern every landing section uses: a small icon and label, the title, then a short intro.
 * `title` may contain inline styled Text (e.g. a gold phrase).
 */
export function SectionHeading({
  c,
  icon,
  hue,
  label,
  title,
  intro,
  isWide,
  centered = false,
}: {
  c: AppColors;
  icon: IconName;
  hue: string;
  label: string;
  title: ReactNode;
  intro?: ReactNode;
  isWide: boolean;
  centered?: boolean;
}) {
  return (
    <View style={[styles.heading, centered && styles.centered]}>
      <View style={styles.eyebrow}>
        <IconTile name={icon} hue={hue} size={32} />
        <Text style={[styles.label, { color: hue }]}>{label.toUpperCase()}</Text>
      </View>
      <Text
        role="heading"
        aria-level={2}
        style={[styles.title, isWide && styles.titleWide, centered && styles.textCenter, { color: c.text }]}>
        {title}
      </Text>
      {intro ? <Text style={[styles.intro, centered && styles.textCenter, { color: c.textMuted }]}>{intro}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heading: { gap: space.md, maxWidth: 640 },
  centered: { alignSelf: 'center', alignItems: 'center' },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 },
  titleWide: { fontSize: 40, lineHeight: 46, letterSpacing: -1.2 },
  intro: { fontSize: 18, lineHeight: 28 },
  textCenter: { textAlign: 'center' },
});
