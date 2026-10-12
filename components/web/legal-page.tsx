import { SiteFooter, SiteNav, SkipLink, chromeStyles, siteLogo } from '@/components/web/site-chrome';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useHydrated } from '@/hooks/use-hydrated';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { type Block, type Inline, type LegalDoc } from '@/lib/legal-content';
import { radius, space } from '@/lib/spacing';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { text } from '@/lib/ui';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { Fragment } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

const WIDE_BREAKPOINT = 1024;
const IS_WEB = Platform.OS === 'web';

function webStyle(style: Record<string, string | number>): object {
  return IS_WEB ? style : {};
}

function linkProps(href: string): object {
  if (IS_WEB) return { href, dataSet: { textLink: 'true' } };
  return {
    onPress: () => {
      if (href.startsWith('/')) router.push(href as never);
      else Linking.openURL(href).catch(() => {});
    },
  };
}

function Rich({ parts, c }: { parts: Inline[]; c: AppColors }) {
  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === 'string') return <Fragment key={i}>{part}</Fragment>;
        if ('bold' in part)
          return (
            <Text key={i} style={[styles.bold, { color: c.text }]}>
              {part.bold}
            </Text>
          );
        return (
          <Text key={i} role="link" {...linkProps(part.href)} style={[styles.link, { color: c.accentText }]}>
            {part.link}
          </Text>
        );
      })}
    </>
  );
}

function BlockView({ block, c }: { block: Block; c: AppColors }) {
  if (block.type === 'p') {
    return (
      <Text style={[styles.body, { color: c.textSecondary }]}>
        <Rich parts={block.parts} c={c} />
      </Text>
    );
  }
  return (
    <View role="list" style={styles.list}>
      {block.items.map((item, i) => (
        <View key={i} role="listitem" style={styles.listItem}>
          <View style={[styles.bullet, { backgroundColor: c.accent }]} />
          <Text style={[styles.body, styles.listText, { color: c.textSecondary }]}>
            <Rich parts={item} c={c} />
          </Text>
        </View>
      ))}
    </View>
  );
}

function Contents({ doc, c, isWide }: { doc: LegalDoc; c: AppColors; isWide: boolean }) {
  return (
    <View
      role="navigation"
      aria-label="On this page"
      style={[
        styles.toc,
        isWide && styles.tocWide,
        { backgroundColor: c.card, borderColor: c.border },
        isWide && webStyle({ position: 'sticky', top: 24 }),
      ]}>
      <Text style={[text.label, styles.tocTitle, { color: c.textMuted }]}>On this page</Text>
      {doc.sections.map((s, i) => (
        <Text key={s.id} role="link" {...linkProps(`#${s.id}`)} style={[styles.tocLink, { color: c.textSecondary }]}>
          <Text style={[styles.tocNumber, { color: c.accentText }]}>{String(i + 1).padStart(2, '0')}</Text>
          {'  '}
          {s.title}
        </Text>
      ))}
    </View>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const c = useAppColors();
  const dark = useResolvedColorScheme() === 'dark';
  const { gutter, width } = useBreakpoint();
  const hydrated = useHydrated();
  const isWide = hydrated && width >= WIDE_BREAKPOINT;
  const container = [chromeStyles.container, { paddingHorizontal: gutter }];
  const glow = webStyle({
    backgroundImage: dark
      ? `radial-gradient(closest-side at 30% 0%, ${c.accentBg} 0%, ${c.bg} 100%)`
      : `radial-gradient(closest-side at 30% 0%, ${c.accent}40 0%, ${c.accent}00 100%)`,
  });

  return (
    <ScrollView
      key={hydrated ? 'client' : 'static'}
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ flexGrow: 1 }}>
      <Head>
        <title>{doc.metaTitle}</title>
        <meta name="description" content={doc.description} />
      </Head>
      <SkipLink c={c} />
      <View style={[styles.top, glow]}>
        <SiteNav c={c} logo={siteLogo(dark)} container={container} />
        <View style={[container, styles.header]}>
          <Text role="heading" aria-level={1} style={[styles.h1, isWide && styles.h1Wide, { color: c.text }]}>
            {doc.title}
          </Text>
          <Text style={[text.label, { color: c.textMuted }]}>{doc.effective}</Text>
        </View>
      </View>

      <View
        role="main"
        nativeID="content"
        {...({ tabIndex: -1 } as object)}
        style={[container, styles.layout, isWide && styles.layoutWide]}>
        <Contents doc={doc} c={c} isWide={isWide} />
        <View style={styles.article}>
          <Text style={[styles.lede, { color: c.text }]}>
            <Rich parts={doc.intro} c={c} />
          </Text>
          {doc.sections.map((s) => (
            <View key={s.id} nativeID={s.id} style={[styles.section, webStyle({ scrollMarginTop: 24 })]}>
              <Text role="heading" aria-level={2} style={[styles.h2, { color: c.text }]}>
                {s.title}
              </Text>
              {s.blocks.map((b, i) => (
                <BlockView key={i} block={b} c={c} />
              ))}
            </View>
          ))}
        </View>
      </View>

      <SiteFooter c={c} isWide={isWide} logo={siteLogo(dark)} rule={c.border} container={container} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { paddingBottom: space.xl },
  header: { gap: space.sm, paddingTop: space.xxl, paddingBottom: space.lg },
  h1: { fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1 },
  h1Wide: { fontSize: 52, lineHeight: 58, letterSpacing: -1.6 },
  layout: { gap: space.xl, paddingBottom: space.xxl },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xxl * 2 },
  toc: { borderWidth: 1, borderRadius: radius.md, padding: space.lg },
  tocWide: { width: 280, flexShrink: 0 },
  tocTitle: { marginBottom: space.xs },
  tocLink: { fontSize: 15, lineHeight: 22, paddingVertical: 11 },
  tocNumber: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  article: { flex: 1, maxWidth: 720, gap: space.xl },
  lede: { fontSize: 19, lineHeight: 30 },
  section: { gap: space.md },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 },
  body: { fontSize: 17, lineHeight: 28 },
  bold: { fontWeight: '700' },
  link: { textDecorationLine: 'underline' },
  list: { gap: space.sm },
  listItem: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 11 },
  listText: { flex: 1 },
});
