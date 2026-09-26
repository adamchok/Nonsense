import { EmptyState } from '@/components/empty-state';
import { Icon, type IconName } from '@/components/icon';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { formatCurrency, formatSignedCurrency } from '@/lib/currency-format';
import { formatDateDMY } from '@/lib/date-format';
import type { PlayerAppStatistics } from '@/lib/firestore';
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const MAX_SAVED_LOCATIONS = 10;

function formatPlayTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function signedColor(c: AppColors, n: number | null): string {
  if (n === null || Number.isNaN(n) || n === 0) return c.text;
  return n > 0 ? c.profit : c.loss;
}

const signedOrDash = (n: number | null) => (n === null ? '—' : formatSignedCurrency(n));
const dateOrDash = (d: Date | null) => (d ? formatDateDMY(d) : '—');

type Row = { label: string; value: string };

/** Statistics content: P/L headline + win bar, key-number tiles, then grouped detail lists. */
export function StatsBody({ stats: s }: { stats: PlayerAppStatistics }) {
  const c = useAppColors();
  const hasSessions = s.finishedSessions > 0;
  const winRate = hasSessions ? Math.round((s.winningSessions / s.finishedSessions) * 100) : 0;
  const roi = s.totalBuyIn > 0 ? (s.totalProfit / s.totalBuyIn) * 100 : null;

  const social: Row[] = [
    { label: 'Friends', value: String(s.friendCount) },
    { label: 'Groups', value: String(s.groupCount) },
    { label: 'Saved locations', value: `${s.savedLocationCount} / ${MAX_SAVED_LOCATIONS}` },
  ];

  if (!hasSessions) {
    return (
      <View style={styles.wrap}>
        <EmptyState
          compact
          icon="bar-chart"
          title="No finished sessions yet"
          message="Cash out a session and your results will show up here."
        />
        <Section title="Social" icon="people" rows={social} c={c} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
        <Text style={[styles.heroLabel, { color: c.textMuted }]}>Lifetime profit / loss</Text>
        <Text style={[styles.heroValue, { color: signedColor(c, s.totalProfit) }]}>
          {formatSignedCurrency(s.totalProfit)}
        </Text>
        <Text style={[styles.heroSub, { color: c.textMuted }]}>
          {s.finishedSessions} {s.finishedSessions === 1 ? 'session' : 'sessions'} · {winRate}% won
        </Text>
        <WinBar c={c} win={s.winningSessions} loss={s.losingSessions} even={s.breakEvenSessions} />
      </View>

      <View style={styles.tiles}>
        <Tile c={c} label="Per session" value={signedOrDash(s.avgProfitPerSession)} color={signedColor(c, s.avgProfitPerSession)} />
        <Tile c={c} label="Per hour" value={signedOrDash(s.profitPerHour)} color={signedColor(c, s.profitPerHour)} />
        <Tile c={c} label="Best" value={signedOrDash(s.bestSessionProfit)} color={signedColor(c, s.bestSessionProfit)} />
        <Tile c={c} label="Worst" value={signedOrDash(s.worstSessionProfit)} color={signedColor(c, s.worstSessionProfit)} />
        <Tile
          c={c}
          label="Return on buy-in"
          value={roi === null ? '—' : `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%`}
          color={signedColor(c, roi)}
        />
        <Tile c={c} label="Time played" value={formatPlayTime(s.totalPlayTimeMs)} color={c.text} />
      </View>

      <Section
        title="Money"
        icon="account-balance-wallet"
        c={c}
        rows={[
          { label: 'Total buy-in', value: formatCurrency(s.totalBuyIn) },
          { label: 'Total cash-out', value: formatCurrency(s.totalCashOut) },
        ]}
      />
      <Section
        title="Sessions"
        icon="history"
        c={c}
        rows={[
          { label: 'First', value: dateOrDash(s.firstSessionDate) },
          { label: 'Latest', value: dateOrDash(s.lastSessionDate) },
          { label: 'Hosted / joined', value: `${s.sessionsAsHost} / ${s.sessionsAsParticipant}` },
        ]}
      />
      <Section
        title="Places"
        icon="location-on"
        c={c}
        rows={[
          { label: 'Unique locations', value: String(s.uniqueSessionLocations) },
          { label: 'Sessions with a location', value: String(s.sessionsWithLocation) },
        ]}
      />
      <Section title="Social" icon="people" rows={social} c={c} />

      <Text style={[styles.footnote, { color: c.textMuted }]}>
        Per hour and time played only count sessions with a recorded end time.
      </Text>
    </View>
  );
}

function WinBar({ c, win, loss, even }: { c: AppColors; win: number; loss: number; even: number }) {
  const parts = [
    { n: win, color: c.profit, label: 'W' },
    { n: even, color: c.textMuted, label: 'Even' },
    { n: loss, color: c.loss, label: 'L' },
  ];
  return (
    <View style={styles.winWrap}>
      <View
        style={[styles.winBar, { backgroundColor: c.border }]}
        accessibilityLabel={`${win} won, ${loss} lost, ${even} broke even`}>
        {parts.map((p) => (p.n > 0 ? <View key={p.label} style={{ flex: p.n, backgroundColor: p.color }} /> : null))}
      </View>
      <View style={styles.winLegend} importantForAccessibility="no-hide-descendants">
        {parts.map((p) => (
          <View key={p.label} style={styles.winLegendItem}>
            <View style={[styles.winDot, { backgroundColor: p.color }]} />
            <Text style={[styles.winLegendText, { color: c.textMuted }]}>
              {p.n} {p.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Tile({ c, label, value, color }: { c: AppColors; label: string; value: string; color: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
      <Text style={[styles.tileLabel, { color: c.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.tileValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Section({ title, icon, rows, c }: { title: string; icon: IconName; rows: Row[]; c: AppColors }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={14} color={c.textMuted} />
        <Text style={[styles.sectionTitle, { color: c.textMuted }]} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={[styles.list, { borderColor: c.border }]}>
        {rows.map((r, i) => (
          <Fragment key={r.label}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: c.textMuted }]}>{r.label}</Text>
              <Text style={[styles.rowValue, { color: c.text }]}>{r.value}</Text>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16, paddingBottom: 4 },
  hero: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 2 },
  heroLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroValue: { fontSize: 32, lineHeight: 40, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroSub: { fontSize: 13 },
  winWrap: { alignSelf: 'stretch', marginTop: 12, gap: 8 },
  winBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  winLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  winLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  winDot: { width: 8, height: 8, borderRadius: 4 },
  winLegendText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  tileLabel: { fontSize: 12 },
  tileValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  list: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  divider: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 40 },
  rowLabel: { flex: 1, fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  footnote: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
