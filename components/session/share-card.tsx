import { Icon, type IconName } from '@/components/icon';
import { PlayerAvatar } from '@/components/player-avatar';
import { formatSessionDay, formatSessionTime } from '@/components/session/session-title';
import { useAppColors } from '@/lib/app-theme';
import { formatCurrency, formatSignedCurrency } from '@/lib/currency-format';
import { medalColor } from '@/lib/medal-colors';
import type { Settlement } from '@/lib/settlement';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { text } from '@/lib/ui';
import type { SessionResult } from '@/types';
import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export const SHARE_CARD_WIDTH = 420;

type Props = {
  date?: Date;
  finishedAt?: Date;
  location?: string;
  hostId?: string;
  blinds?: string | null;
  duration?: string | null;
  results: SessionResult[];
  settlements: Settlement[];
  avatarFor: (playerId: string) => string;
};

export const ShareCard = forwardRef<View, Props>(function ShareCard(
  { date, finishedAt, location, hostId, blinds, duration, results, settlements, avatarFor },
  ref,
) {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const isDark = scheme === 'dark';
  const timeRange = date
    ? `${formatSessionTime(date)}${finishedAt ? ` – ${formatSessionTime(finishedAt)}` : ''}`
    : null;

  const metaPart = (icon: IconName, label: string) => (
    <View key={icon} style={styles.inlineTight}>
      <Icon name={icon} size={14} color={c.textMuted} />
      <Text style={[text.label, { color: c.textMuted }]}>{label}</Text>
    </View>
  );

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: c.bg }]}>
      <View style={styles.brand}>
        <Image
          source={isDark ? require('@/assets/images/logo-mark.png') : require('@/assets/images/logo-mark-light.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.brandName, { color: c.text }]}>Nonsense</Text>
      </View>

      {date ? (
        <View style={styles.heading}>
          <View style={styles.inline}>
            <Icon name="calendar" size={20} color={c.textMuted} />
            <Text style={[text.display, { color: c.text }]}>{formatSessionDay(date, undefined, true)}</Text>
          </View>
          <View style={styles.metaGrid}>
            <View style={styles.metaCol}>
              {timeRange ? metaPart('clock-outline', timeRange) : null}
              {location?.trim() ? metaPart('place', location.trim()) : null}
            </View>
            <View style={styles.metaCol}>
              {duration ? metaPart('timer', duration) : null}
              {blinds ? metaPart('payments', blinds) : null}
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionTitle}>
          <Icon name="trophy-outline" size={18} color={c.accentText} />
          <Text style={[text.heading, { color: c.text }]}>Standings</Text>
        </View>
        {results.map((r, i) => {
          const medal = medalColor(i, c, isDark);
          return (
            <View
              key={r.playerId}
              style={[styles.resultRow, { backgroundColor: c.card, borderColor: i === 0 ? c.accentBorder : c.border }]}>
              <View style={[styles.rankBar, { backgroundColor: medal ?? 'transparent' }]} />
              <View style={styles.resultBody}>
                {i === 0 && medal ? (
                  <View style={[styles.medal, { backgroundColor: `${medal}26`, borderColor: medal }]}>
                    <Icon name="crown-outline" size={14} color={medal} weight="fill" />
                  </View>
                ) : null}
                <PlayerAvatar value={avatarFor(r.playerId)} size={28} />
                <View style={[styles.inline, styles.grow]}>
                  <Text style={[text.rowTitle, styles.shrink, { color: c.text }]} numberOfLines={1}>
                    {r.playerName}
                  </Text>
                  {r.playerId === hostId ? (
                    <View style={[styles.hostBadge, { backgroundColor: c.badge.host }]}>
                      <Text style={[text.micro, styles.hostBadgeText]}>HOST</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[text.amount, { color: r.profit > 0 ? c.profit : r.profit < 0 ? c.loss : c.textMuted }]}>
                  {formatSignedCurrency(r.profit)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {settlements.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionTitle}>
            <Icon name="bank" size={18} color={c.green} />
            <Text style={[text.heading, { color: c.text }]}>Settlement</Text>
          </View>
          <View style={[styles.settleCard, { backgroundColor: c.card, borderColor: c.border }]}>
            {settlements.map((s, i) => (
              <View key={i} style={[styles.settleRow, i > 0 && styles.settleDivider, { borderTopColor: c.border }]}>
                <View style={[styles.inline, styles.settleNames]}>
                  <Text style={[text.rowTitle, styles.shrink, { color: c.text }]} numberOfLines={1}>
                    {s.from}
                  </Text>
                  <Icon name="pays" size={16} color={c.green} />
                  <Text style={[text.rowTitle, styles.shrink, { color: c.text }]} numberOfLines={1}>
                    {s.to}
                  </Text>
                </View>
                <View style={[styles.amountPill, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}>
                  <Text style={[text.amount, styles.amountPillText, { color: c.accentText }]}>
                    {formatCurrency(s.amount)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={[text.caption, styles.footer, { color: c.textHint }]}>Tracked with Nonsense</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    padding: 24,
    gap: 18,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 40,
    height: 40,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heading: {
    gap: 10,
    marginBottom: 2,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  resultRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rankBar: {
    width: 4,
  },
  resultBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  medal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 24,
  },
  metaCol: {
    gap: 4,
  },
  inlineTight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hostBadge: {
    height: 18,
    borderRadius: 4,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  hostBadgeText: {
    color: '#fff',
    lineHeight: 12,
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  settleCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  settleDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  settleNames: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  shrink: {
    flexShrink: 1,
  },
  amountPill: {
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  amountPillText: {
    lineHeight: 15,
  },
  footer: {
    textAlign: 'center',
  },
});
