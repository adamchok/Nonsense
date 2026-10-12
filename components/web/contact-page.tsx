import { Icon, type IconName } from '@/components/icon';
import { CONTACT_EMAIL, SiteFooter, SiteNav, SkipLink, TextLink, chromeStyles, siteLogo } from '@/components/web/site-chrome';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useHydrated } from '@/hooks/use-hydrated';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { radius, space } from '@/lib/spacing';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { text } from '@/lib/ui';
import * as Clipboard from 'expo-clipboard';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const WIDE_BREAKPOINT = 1024;
const COPIED_MS = 2000;
const IS_WEB = Platform.OS === 'web';

function mailto(subject?: string): string {
  return subject ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}` : `mailto:${CONTACT_EMAIL}`;
}

/** Web gets a real <a href>; native opens the mail app. */
function linkProps(href: string): object {
  return IS_WEB ? { href } : { onPress: () => Linking.openURL(href).catch(() => {}) };
}

const TOPICS: { icon: IconName; title: string; body: string; subject: string }[] = [
  {
    icon: 'bug',
    title: 'Report a bug',
    body: 'Tell us what you tapped, what you expected and what happened instead. A screenshot helps.',
    subject: 'Bug report',
  },
  {
    icon: 'lightbulb',
    title: 'Suggest a feature',
    body: 'Something your table keeps wishing for? Every idea gets read.',
    subject: 'Feature idea',
  },
  {
    icon: 'person-remove',
    title: 'Delete your account',
    body: 'Email us from the address on your account and we will delete it within 30 days.',
    subject: 'Delete my account',
  },
];

function CopyButton({ c, dark }: { c: AppColors; dark: boolean }) {
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
      style={[
        styles.button,
        { borderWidth: 1, borderColor: dark ? c.border : c.inputBorder, backgroundColor: dark ? c.bg : c.card },
      ]}>
      <Icon name={copied ? 'check' : 'content-copy'} size={16} color={copied ? c.profit : c.text} importantForAccessibility="no" />
      <Text style={[text.button, { color: c.text }]} aria-live="polite">
        {copied ? 'Copied' : 'Copy address'}
      </Text>
    </Pressable>
  );
}

function EmailCard({ c, dark, isWide }: { c: AppColors; dark: boolean; isWide: boolean }) {
  return (
    <View style={[styles.emailCard, isWide && styles.emailCardWide, { backgroundColor: c.card, borderColor: c.accentBorder }]}>
      <View style={styles.emailMain}>
        <View style={[styles.ring, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
          <Icon name="mail" size={22} color={c.accentText} importantForAccessibility="no" />
        </View>
        <View style={styles.emailText}>
          <Text
            role="link"
            aria-label={`Email ${CONTACT_EMAIL}`}
            {...({ ...linkProps(mailto()), dataSet: { textLink: 'true' } } as object)}
            style={[styles.address, isWide && styles.addressWide, { color: c.text }]}>
            {CONTACT_EMAIL}
          </Text>
          <Text style={[text.body, { color: c.textMuted }]}>A real person reads every message.</Text>
        </View>
      </View>
      <View style={[styles.actions, isWide && styles.actionsWide]}>
        <Pressable role="link" {...(linkProps(mailto()) as object)} style={[styles.button, { backgroundColor: c.accent }]}>
          <Icon name="mail" size={16} color={c.onAccent} importantForAccessibility="no" />
          <Text style={[text.button, { color: c.onAccent }]}>Write an email</Text>
        </Pressable>
        <CopyButton c={c} dark={dark} />
      </View>
    </View>
  );
}

function TopicCard({ topic, c }: { topic: (typeof TOPICS)[number]; c: AppColors }) {
  return (
    <View style={[styles.topic, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.topicIcon, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
        <Icon name={topic.icon} size={20} color={c.text} importantForAccessibility="no" />
      </View>
      <Text role="heading" aria-level={2} style={[styles.topicTitle, { color: c.text }]}>
        {topic.title}
      </Text>
      <Text style={[text.body, styles.topicBody, { color: c.textMuted }]}>{topic.body}</Text>
      <TextLink label="Email about this →" href={mailto(topic.subject)} color={c.accentText} style={styles.topicLink} />
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
          <Text style={[styles.lede, { color: c.textMuted }]}>
            Nonsense is made by one developer for home games. Email is the quickest way to reach us.
          </Text>
        </View>
      </View>

      <View role="main" nativeID="content" {...({ tabIndex: -1 } as object)} style={[container, styles.main]}>
        <EmailCard c={c} dark={dark} isWide={isWide} />
        <View style={[styles.topics, isWide && styles.topicsWide]}>
          {TOPICS.map((t) => (
            <TopicCard key={t.title} topic={t} c={c} />
          ))}
        </View>
        <Text style={[text.body, { color: c.textMuted }]}>
          Looking for a quick answer? Try the <TextLink label="FAQ" href="/#faq" color={c.accentText} />. How we handle
          your data is in the <TextLink label="Privacy Policy" href="/privacy" color={c.accentText} />.
        </Text>
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
  lede: { fontSize: 19, lineHeight: 30, maxWidth: 640 },
  main: { gap: space.xl, paddingBottom: space.xxl },
  emailCard: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.lg },
  emailCardWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
  },
  emailMain: { flexDirection: 'row', alignItems: 'center', gap: space.xl, flexShrink: 1 },
  emailText: { gap: 2, flexShrink: 1 },
  ring: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  address: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  addressWide: { fontSize: 26, lineHeight: 34, letterSpacing: -0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  actionsWide: { flexShrink: 0 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
  },
  topics: { gap: space.lg },
  topicsWide: { flexDirection: 'row' },
  topic: { flex: 1, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.md, gap: space.sm },
  topicIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  topicTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  topicBody: { flexGrow: 1 },
  topicLink: { fontSize: 15, lineHeight: 44, fontWeight: '600' },
});
