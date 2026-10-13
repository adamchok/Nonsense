import { AuthPreviewScreen } from '@/components/auth-preview-screen';
import { Icon, type IconName } from '@/components/icon';
import { siteLogo } from '@/components/web/site-chrome';
import { BrandGlow, CopyScrim, PhoneGlow } from '@/components/auth-brand-glow';
import { CardRain } from '@/components/web/playing-cards';
import { useAppColors } from '@/lib/app-theme';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { radius, space } from '@/lib/spacing';
import { useState } from 'react';
import { Link } from 'expo-router';
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PREVIEW_ASPECT = 780 / 1688;
const PREVIEW_MIN_PANEL_WIDTH = 700;
const LARGE_PANEL_WIDTH = 1000;
const BEZEL = 6;
const PANEL_PAD_X = 48;
const IS_WEB = Platform.OS === 'web';
const SCRIM_PAD = 48;
const SCRIM_PAD_Y = 120;
const BRAND_SCRIM_PAD = 72;
const DARK_CARD_STRENGTH = 1.3;

const SIZES = {
  regular: {
    headline: 40,
    headlineLine: 46,
    body: 16,
    bodyLine: 24,
    title: 15,
    meta: 13,
    icon: 40,
    glyph: 20,
    copy: 420,
    previewMax: 560,
    previewShare: 0.62,
    gap: space.xxl,
  },
  large: {
    headline: 56,
    headlineLine: 62,
    body: 18,
    bodyLine: 28,
    title: 17,
    meta: 15,
    icon: 48,
    glyph: 24,
    copy: 500,
    previewMax: 680,
    previewShare: 0.7,
    gap: 72,
  },
} as const;

const FEATURES: readonly { icon: IconName; title: string; body: string }[] = [
  { icon: 'poker-chip', title: 'Live buy-ins', body: 'Log every buy-in and rebuy as the night goes.' },
  { icon: 'bank-transfer', title: 'Settle up fast', body: 'Cash out once and see exactly who pays whom.' },
  { icon: 'leaderboard', title: 'Know who is up', body: 'History and a leaderboard across all your games.' },
];

export function AuthBrandPanel() {
  const c = useAppColors();
  const dark = useResolvedColorScheme() === 'dark';
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const s = width >= LARGE_PANEL_WIDTH ? SIZES.large : SIZES.regular;
  const showPreview = width >= PREVIEW_MIN_PANEL_WIDTH;
  const previewHeight = Math.min(s.previewMax, height * s.previewShare);
  const previewWidth = previewHeight * PREVIEW_ASPECT;
  const panelBg = dark ? c.bg : c.card;
  const brand = (
    <>
      <Image source={siteLogo(dark)} style={styles.logo} resizeMode="contain" accessible={false} />
      <Text style={[styles.brandName, { color: c.text }]}>Nonsense</Text>
    </>
  );

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.panel,
        {
          backgroundColor: panelBg,
          borderRightColor: dark ? c.chipBorder : c.border,
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.xl,
        },
      ]}>
      <BrandGlow c={c} dark={dark} />
      {IS_WEB ? <CardRain dark={dark} strength={dark ? DARK_CARD_STRENGTH : 1} /> : null}
      <View style={styles.brandWrap}>
        <CopyScrim color={panelBg} />
        {IS_WEB ? (
          <Link href="/" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Nonsense home"
              {...({ dataSet: { plainLink: 'true' } } as object)}
              style={styles.brand}>
              {brand}
            </Pressable>
          </Link>
        ) : (
          <View style={styles.brand}>{brand}</View>
        )}
      </View>

      <View style={[styles.body, { gap: s.gap }]}>
        <View style={[styles.copy, { maxWidth: s.copy + SCRIM_PAD * 2 }]}>
          <CopyScrim color={panelBg} />
          <Text style={[styles.headline, { fontSize: s.headline, lineHeight: s.headlineLine, color: c.text }]}>
            Your home game,{'\n'}
            <Text style={{ color: c.accentText }}>sorted.</Text>
          </Text>
          <Text style={{ fontSize: s.body, lineHeight: s.bodyLine, color: c.textMuted }}>
            Track the pot, settle up in seconds and keep score with your friends.
          </Text>
          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.feature}>
                <View
                  style={[
                    styles.featureIcon,
                    { width: s.icon, height: s.icon, backgroundColor: c.accentBg, borderColor: c.accentBorder },
                  ]}>
                  <Icon name={f.icon} size={s.glyph} color={c.accentText} />
                </View>
                <View style={styles.featureText}>
                  <Text style={[styles.featureTitle, { fontSize: s.title, color: c.text }]}>{f.title}</Text>
                  <Text style={{ fontSize: s.meta, lineHeight: s.meta * 1.4, color: c.textMuted }}>{f.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {showPreview ? (
          <View
            style={[styles.stage, { width: previewWidth, height: previewHeight }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden>
            <PhoneGlow c={c} dark={dark} />
            <View
              style={[
                styles.device,
                { borderColor: dark ? c.border : c.text, backgroundColor: c.card, shadowOpacity: dark ? 0.45 : 0.18 },
              ]}>
              <AuthPreviewScreen dark={dark} />
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.logo} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    paddingHorizontal: PANEL_PAD_X,
    justifyContent: 'space-between',
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  brandWrap: { alignSelf: 'flex-start', padding: BRAND_SCRIM_PAD, margin: -BRAND_SCRIM_PAD, zIndex: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 40, height: 40 },
  brandName: { fontSize: 17, fontWeight: '700' },
  body: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  copy: {
    flexShrink: 1,
    gap: space.lg,
    zIndex: 1,
    paddingHorizontal: SCRIM_PAD,
    marginHorizontal: -SCRIM_PAD,
    paddingVertical: SCRIM_PAD_Y,
    marginVertical: -SCRIM_PAD_Y,
  },
  headline: { fontWeight: '700', letterSpacing: -0.8 },
  features: { gap: space.lg, marginTop: space.sm },
  feature: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  featureIcon: { borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  featureText: { flexShrink: 1, gap: 2 },
  featureTitle: { fontWeight: '600' },
  stage: { flexShrink: 0, zIndex: 2 },
  device: {
    flex: 1,
    borderRadius: 32,
    borderWidth: BEZEL,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
});
