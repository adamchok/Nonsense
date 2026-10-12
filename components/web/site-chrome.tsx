import { Icon } from '@/components/icon';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { type AppColors } from '@/lib/app-theme';
import { radius, space } from '@/lib/spacing';
import { useResolvedColorScheme, useThemePreference } from '@/lib/theme-context';
import { text } from '@/lib/ui';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export const SIGN_IN_HREF = '/(auth)/sign-in';
export const CONTACT_EMAIL = 'support@adamchok.com';
export const SITE_MAX_WIDTH = 1280;

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'FAQ', href: '/#faq' },
      { label: 'Sign in', href: '/sign-in' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
  {
    title: 'Support',
    links: [{ label: 'Contact', href: '/contact' }],
  },
];

function noop() {}

function useControlSurface(c: AppColors) {
  const dark = useResolvedColorScheme() === 'dark';
  return dark ? { borderColor: c.border, backgroundColor: c.bg } : { borderColor: c.inputBorder, backgroundColor: c.card };
}

export function siteLogo(dark: boolean): ImageSourcePropType {
  return dark ? require('@/assets/images/logo-mark.png') : require('@/assets/images/logo-mark-light.png');
}

export function ThemeToggle({ c }: { c: AppColors }) {
  const { resolvedColorScheme, setPreference } = useThemePreference();
  const next = resolvedColorScheme === 'dark' ? 'light' : 'dark';
  const surface = useControlSurface(c);
  return (
    <Pressable
      role="button"
      aria-label={`Switch to ${next} theme`}
      onPress={() => setPreference(next).catch(noop)}
      style={[styles.iconButton, surface]}>
      <Icon name={next === 'light' ? 'wb-sunny' : 'nights-stay'} size={20} color={c.text} importantForAccessibility="no" />
    </Pressable>
  );
}

/** Below this width the top nav uses a smaller logo, wordmark and button padding. */
const COMPACT_NAV_WIDTH = 400;

export function SiteNav({
  c,
  logo,
  container,
}: {
  c: AppColors;
  logo: ImageSourcePropType;
  container: StyleProp<ViewStyle>;
}) {
  const surface = useControlSurface(c);
  // Small phones: shrink the brand and buttons so they fit on one row without crowding.
  const isCompact = useBreakpoint().width < COMPACT_NAV_WIDTH;
  return (
    <View role="navigation" aria-label="Primary" style={[container, styles.nav]}>
      <Link href="/" asChild>
        <Pressable
          role="link"
          aria-label="Nonsense home"
          {...({ dataSet: { plainLink: 'true' } } as object)}
          style={StyleSheet.flatten([styles.brand, styles.brandLink, isCompact && styles.brandCompact])}>
          <Image
            source={logo}
            style={[styles.brandLogo, isCompact && styles.brandLogoCompact]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={[styles.navWordmark, isCompact && styles.navWordmarkCompact, { color: c.text }]}>Nonsense</Text>
        </Pressable>
      </Link>
      <View style={[styles.navActions, isCompact && styles.navActionsCompact]}>
        <ThemeToggle c={c} />
        <Link href={SIGN_IN_HREF} asChild>
          <Pressable
            role="link"
            style={StyleSheet.flatten([styles.navLink, isCompact && styles.navLinkCompact, surface])}>
            <Text style={[text.button, { color: c.text }]}>Sign in</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

export function SkipLink({ c, target = '#content' }: { c: AppColors; target?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      role="link"
      {...({ href: target } as object)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.skip,
        focused ? [styles.skipShown, { backgroundColor: c.card, borderColor: c.accentBorder }] : styles.skipHidden,
      ]}>
      <Text style={[text.label, { color: c.text }]}>Skip to content</Text>
    </Pressable>
  );
}

export function TextLink({
  label,
  href,
  color,
  style,
}: {
  label: string;
  href: string;
  color: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text role="link" {...({ href, dataSet: { textLink: 'true' } } as object)} style={[style, { color }]}>
      {label}
    </Text>
  );
}

export function SiteFooter({
  c,
  isWide,
  logo,
  rule,
  container,
  cta = true,
}: {
  c: AppColors;
  isWide: boolean;
  logo: ImageSourcePropType;
  rule: string;
  container: StyleProp<ViewStyle>;
  /** Off where the page already ends on a sign-up call to action (the landing closer). */
  cta?: boolean;
}) {
  return (
    <View role="contentinfo" style={styles.footer}>
      {/* Full-width band with its own surface and rule; the content stays in the page column. */}
      <View style={[styles.footerBand, { backgroundColor: c.card, borderTopColor: rule }]}>
        <View style={[container, styles.footerInner]}>
          <View style={[styles.footerTop, isWide ? styles.footerTopWide : styles.footerTopStacked]}>
            <View style={styles.footerBrand}>
              <View style={styles.footerBrandRow}>
                <Image source={logo} style={styles.footerLogo} resizeMode="contain" accessibilityIgnoresInvertColors />
                <Text style={[styles.footerWordmark, { color: c.text }]}>Nonsense</Text>
              </View>
              <Text style={[styles.footerTagline, { color: c.textMuted }]}>
                A free session tracker for home poker. It records the game and never handles money.
              </Text>
              {cta ? (
                <Link href={SIGN_IN_HREF} asChild>
                  <Pressable role="link" style={StyleSheet.flatten([styles.footerCta, { backgroundColor: c.accent }])}>
                    <Text style={[text.button, { color: c.onAccent }]}>Get started free</Text>
                    <Icon name="arrow-right" size={16} color={c.onAccent} importantForAccessibility="no" />
                  </Pressable>
                </Link>
              ) : null}
            </View>
            <View role="navigation" aria-label="Footer" style={[styles.footerColumns, isWide && styles.footerColumnsWide]}>
              {FOOTER_COLUMNS.map((col) => (
                <View key={col.title} style={styles.footerColumn}>
                  <Text role="heading" aria-level={2} style={[styles.footerHeading, { color: c.text }]}>
                    {col.title}
                  </Text>
                  {col.links.map((l) => (
                    <TextLink key={l.label} label={l.label} href={l.href} color={c.textMuted} style={styles.footerLink} />
                  ))}
                </View>
              ))}
            </View>
          </View>
          <View style={[styles.footerBottom, { borderTopColor: rule }]}>
            <Text style={[styles.footerText, { color: c.textMuted }]}>© 2026 Nonsense. Made for home games.</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const chromeStyles = StyleSheet.create({
  container: { width: '100%', maxWidth: SITE_MAX_WIDTH, alignSelf: 'center' },
});

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  brandLink: { borderRadius: radius.sm, paddingHorizontal: 4, marginHorizontal: -4 },
  brandLogo: { width: 40, height: 40 },
  brandCompact: { gap: 8 },
  brandLogoCompact: { width: 32, height: 32 },
  navWordmark: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4 },
  navWordmarkCompact: { fontSize: 19, lineHeight: 24 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navActionsCompact: { gap: 6 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1 },
  navLinkCompact: { paddingHorizontal: 14 },
  // marginTop auto pins the footer to the bottom of short pages (the ScrollView content uses flexGrow: 1).
  footer: { marginTop: 'auto', paddingTop: space.xl },
  footerBand: { borderTopWidth: StyleSheet.hairlineWidth },
  footerInner: { gap: space.xl, paddingTop: space.xxl },
  footerTop: { gap: space.xxl },
  footerTopWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  // Stacked: more room between the call to action and the link columns below it.
  footerTopStacked: { rowGap: space.xxl + space.lg },
  footerBrand: { gap: space.md, maxWidth: 340, alignItems: 'flex-start' },
  footerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerLogo: { width: 36, height: 36 },
  footerWordmark: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.4 },
  footerTagline: { fontSize: 15, lineHeight: 22 },
  footerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    marginTop: space.xs,
  },
  footerText: { fontSize: 14, lineHeight: 20 },
  footerColumns: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xxl, rowGap: space.xl },
  footerColumnsWide: { columnGap: space.xxl * 2.5 },
  footerColumn: { minWidth: 120 },
  footerHeading: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginBottom: space.xs },
  footerBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Even space above and below the copyright line.
    paddingVertical: space.xl,
  },
  // 34px rows: tighter than the 44px touch ideal, still above the WCAG 2.2 24px minimum target.
  footerLink: { fontSize: 14, lineHeight: 34 },
  skip: {
    position: 'absolute',
    zIndex: 10,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  skipHidden: { left: -10000, top: 0, width: 1, height: 1, minHeight: 1, overflow: 'hidden', opacity: 0 },
  skipShown: { left: 16, top: 12 },
});
