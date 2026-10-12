import { Icon, type IconName } from '@/components/icon';
import { CONTACT_EMAIL, SiteFooter, SiteNav, SkipLink, chromeStyles, siteLogo } from '@/components/web/site-chrome';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useHydrated } from '@/hooks/use-hydrated';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { radius, space } from '@/lib/spacing';
import { useResolvedColorScheme } from '@/lib/theme-context';
import * as Clipboard from 'expo-clipboard';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const WIDE_BREAKPOINT = 1024;
const COPIED_MS = 2000;
const COMPACT_EMAIL_BREAKPOINT = 420;
const IS_WEB = Platform.OS === 'web';

const MAILTO = `mailto:${CONTACT_EMAIL}`;

function linkProps(href: string): object {
  return IS_WEB ? { href } : { onPress: () => Linking.openURL(href).catch(() => {}) };
}

const TOPICS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'bug',
    title: 'Report a bug',
    body: 'What you tapped and what went wrong. Screenshots help.',
  },
  {
    icon: 'lightbulb',
    title: 'Suggest a feature',
    body: 'Something your table keeps wishing for.',
  },
  {
    icon: 'person-remove',
    title: 'Delete your account',
    body: 'Use Profile in the app, or email us from your account’s address.',
  },
];

function CopyButton({ c }: { c: AppColors }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <Pressable
      role="button"
      aria-label={copied ? 'Email address copied' : 'Copy email address'}
      onPress={() =>
        Clipboard.setStringAsync(CONTACT_EMAIL)
          .then(() => setCopied(true))
          .catch(() => {})
      }
      hitSlop={6}
      style={styles.copyBtn}
      {...({ dataSet: { hoverDot: 'true' } } as object)}>
      <View style={styles.copyDot}>
        <Icon
          name={copied ? 'check' : 'content-copy'}
          size={18}
          color={copied ? c.profit : c.textMuted}
          importantForAccessibility="no"
        />
      </View>
    </Pressable>
  );
}

function EmailCard({ c, isWide, isCompact }: { c: AppColors; isWide: boolean; isCompact: boolean }) {
  return (
    <View
      style={[styles.emailCard, isCompact && styles.emailCardCompact, { backgroundColor: c.card, borderColor: c.accentBorder }]}>
      {isCompact ? null : (
        <View style={[styles.ring, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
          <Icon name="mail" size={22} color={c.accentText} importantForAccessibility="no" />
        </View>
      )}
      <Text
        role="link"
        aria-label={`Email ${CONTACT_EMAIL}`}
        {...({ ...linkProps(MAILTO), dataSet: { textLink: 'true' } } as object)}
        style={[styles.address, isWide && styles.addressWide, isCompact && styles.addressCompact, { color: c.text }]}>
        {CONTACT_EMAIL}
      </Text>
      <CopyButton c={c} />
    </View>
  );
}

function TopicRow({ topic, c, isFirst }: { topic: (typeof TOPICS)[number]; c: AppColors; isFirst: boolean }) {
  return (
    <View style={[styles.topicRow, !isFirst && styles.topicDivider, { borderTopColor: c.border }]}>
      <View style={[styles.topicIcon, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
        <Icon name={topic.icon} size={18} color={c.text} importantForAccessibility="no" />
      </View>
      <View style={styles.topicText}>
        <Text role="heading" aria-level={2} style={[styles.topicTitle, { color: c.text }]}>
          {topic.title}
        </Text>
        <Text style={[styles.topicBody, { color: c.textMuted }]}>{topic.body}</Text>
      </View>
    </View>
  );
}

export function ContactPage() {
  const c = useAppColors();
  const dark = useResolvedColorScheme() === 'dark';
  const { gutter, width } = useBreakpoint();
  const hydrated = useHydrated();
  const isWide = hydrated && width >= WIDE_BREAKPOINT;
  const container = [chromeStyles.container, { paddingHorizontal: gutter }];
  const glow = IS_WEB
    ? { backgroundImage: dark
      ? `radial-gradient(closest-side at 30% 0%, ${c.accentBg} 0%, ${c.bg} 100%)`
      : `radial-gradient(closest-side at 30% 0%, ${c.accent}40 0%, ${c.accent}00 100%)` }
    : {};

  return (
    <ScrollView
      key={hydrated ? 'client' : 'static'}
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ flexGrow: 1 }}>
      <Head>
        <title>Contact · Nonsense</title>
        <meta name="description" content="Get in touch with Nonsense: questions, bug reports, feature ideas and account deletion." />
      </Head>
      <SkipLink c={c} />
      <View style={[styles.top, glow]}>
        <SiteNav c={c} logo={siteLogo(dark)} container={container} />
        <View style={[container, styles.header]}>
          <Text role="heading" aria-level={1} style={[styles.h1, isWide && styles.h1Wide, { color: c.text }]}>
            Get in touch
          </Text>
        </View>
      </View>

      <View role="main" nativeID="content" {...({ tabIndex: -1 } as object)} style={[container, styles.main]}>
        <EmailCard c={c} isWide={isWide} isCompact={hydrated && width < COMPACT_EMAIL_BREAKPOINT} />
        <View style={[styles.topics, { backgroundColor: c.card, borderColor: c.border }]}>
          {TOPICS.map((t, i) => (
            <TopicRow key={t.title} topic={t} c={c} isFirst={i === 0} />
          ))}
        </View>
      </View>

      <SiteFooter c={c} isWide={isWide} logo={siteLogo(dark)} rule={c.border} container={container} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { paddingBottom: space.xl },
  header: { gap: space.md, paddingTop: space.xxl, paddingBottom: space.lg },
  h1: { fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1 },
  h1Wide: { fontSize: 52, lineHeight: 58, letterSpacing: -1.6 },
  main: { gap: space.xl, paddingBottom: space.xxl },
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
  },
  emailCardCompact: { gap: space.xs, paddingHorizontal: space.lg },
  ring: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  address: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, flexShrink: 1 },
  addressWide: { fontSize: 26, lineHeight: 34, letterSpacing: -0.5 },
  addressCompact: { fontSize: 17, lineHeight: 24 },
  copyBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  copyDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  topics: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  topicDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  topicIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  topicText: { flex: 1, minWidth: 0, gap: 2 },
  topicTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  topicBody: { fontSize: 14, lineHeight: 20 },
});
