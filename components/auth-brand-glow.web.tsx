import { withAlpha } from '@/components/web/landing-showcase';
import type { AppColors } from '@/lib/app-theme';
import { pointer } from '@/lib/ui';
import { StyleSheet, View, type ViewStyle } from 'react-native';

const SCRIM_INSET = 40;
const SCRIM_BLUR = 36;
const HALO_SPREAD = 14;
const HALO_BLUR = 40;
const HALO_ALPHA_LIGHT = 0.45;
const HALO_ALPHA_DARK = 0.35;

function webStyle(style: Record<string, string>): ViewStyle {
  return style as unknown as ViewStyle;
}

export function CopyScrim({ color }: { color: string }) {
  return (
    <View
      style={[styles.scrim, pointer.none, { backgroundColor: color }, webStyle({ filter: `blur(${SCRIM_BLUR}px)` })]}
    />
  );
}

export function PhoneGlow({ c, dark }: { c: AppColors; dark: boolean }) {
  return (
    <View
      style={[
        styles.halo,
        pointer.none,
        { backgroundColor: withAlpha(c.accent, dark ? HALO_ALPHA_DARK : HALO_ALPHA_LIGHT) },
        webStyle({ filter: `blur(${HALO_BLUR}px)` }),
      ]}
    />
  );
}

export function BrandGlow({ c, dark }: { c: AppColors; dark: boolean }) {
  const glow = `radial-gradient(55% 50% at 10% 92%, ${withAlpha(c.borderBlue, dark ? 0.14 : 0.14)} 0%, ${withAlpha(c.borderBlue, 0)} 100%)`;
  return <View style={[StyleSheet.absoluteFill, pointer.none, webStyle({ backgroundImage: glow })]} />;
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: SCRIM_INSET,
    left: SCRIM_INSET,
    right: SCRIM_INSET,
    bottom: SCRIM_INSET,
    borderRadius: SCRIM_INSET,
  },
  halo: {
    position: 'absolute',
    top: -HALO_SPREAD,
    left: -HALO_SPREAD,
    right: -HALO_SPREAD,
    bottom: -HALO_SPREAD,
    borderRadius: 32 + HALO_SPREAD,
  },
});
