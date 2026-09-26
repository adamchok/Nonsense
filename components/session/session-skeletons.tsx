/**
 * Layout-matching loading states for the session screens. Each skeleton copies the loaded
 * screen's containers (padding, radius, borders, gaps, line heights) and puts a bone exactly
 * where data lands, so the real content replaces it in place without a jump. Static chrome
 * (section titles, field labels, icons) stays real.
 *
 * Keep in sync with: session-header, pot-badge, session-meta-cards, ledger-header,
 * player-ledger-row, session-footer-actions, app/session/summary/[id], app/session/cashout/[id].
 */
import { Icon, type IconName } from '@/components/icon';
import { Skeleton, SkeletonGroup } from '@/components/skeleton';
import { useAppColors } from '@/lib/app-theme';
import { text as type, ui } from '@/lib/ui';
import { StyleSheet, Text, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

/** Realistic table: a few players with differing name lengths. */
const PLAYER_NAME_WIDTHS: DimensionValue[] = ['55%', '40%', '62%'];
const SETTLEMENT_NAME_WIDTHS: DimensionValue[] = ['45%', '38%'];

/**
 * A bone sitting inside a box one text line tall, so the row keeps the real text's height.
 * The bone itself is a bit shorter than the line, like a cap-height glyph run.
 */
function TextBone({
  lineHeight,
  width,
  style,
}: {
  lineHeight: number;
  width: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ height: lineHeight, justifyContent: 'center' }, style]}>
      <Skeleton width={width} height={Math.round(lineHeight * 0.65)} radius={4} />
    </View>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Live session                                                                                */
/* ------------------------------------------------------------------------------------------ */

type LayoutProps = { contentStyle: StyleProp<ViewStyle> };

/** Mirrors app/session/[id].tsx: header, pot, meta cards, ledger, footer button. */
export function LiveSessionSkeleton({ contentStyle }: LayoutProps) {
  const c = useAppColors();
  return (
    <SkeletonGroup label="Loading session" style={[live.screen, { backgroundColor: c.bg }]}>
      <View style={contentStyle}>
        <View style={live.group}>
          <LiveHeaderSkeleton />
          <PotSkeleton />
          <View style={live.metaRow}>
            <MetaCardSkeleton icon="place" label="LOCATION" valueWidth="70%" />
            <MetaCardSkeleton icon="payments" label="BLINDS" valueWidth="55%" />
          </View>
        </View>

        <View style={live.ledger}>
          <View style={live.ledgerHeader}>
            <Text style={[type.section, { color: c.textMuted }]} numberOfLines={1}>
              Buy-In Ledger
            </Text>
            <Skeleton width={22} height={10} radius={4} />
          </View>
          <View style={[ui.card, { backgroundColor: c.card, borderColor: c.border }]}>
            {PLAYER_NAME_WIDTHS.map((nameWidth, i) => (
              <LedgerRowSkeleton key={i} nameWidth={nameWidth} showBadge={i === 0} showDivider={i > 0} />
            ))}
          </View>
        </View>

        <Skeleton height={48} radius={14} />
      </View>
    </SkeletonGroup>
  );
}

function LiveHeaderSkeleton() {
  const c = useAppColors();
  return (
    <View style={live.header}>
      <View style={live.headerText}>
        <Text style={[live.headerLabel, { color: c.textHint }]}>SESSION</Text>
        <TextBone lineHeight={26} width="70%" />
      </View>
      <View style={live.headerActions}>
        <Skeleton width={44} height={44} radius={22} />
        <Skeleton width={100} height={44} radius={22} />
      </View>
    </View>
  );
}

function PotSkeleton() {
  const c = useAppColors();
  return (
    <View style={[live.pot, { backgroundColor: c.card, borderColor: c.borderAccent }]}>
      <Text style={[live.potLabel, { color: c.accentText }]}>POT</Text>
      <TextBone lineHeight={26} width={96} />
    </View>
  );
}

function MetaCardSkeleton({ icon, label, valueWidth }: { icon: IconName; label: string; valueWidth: DimensionValue }) {
  const c = useAppColors();
  return (
    <View style={[live.metaCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={live.metaText}>
        <View style={live.metaLabelRow}>
          <Icon name={icon} size={14} color={c.textHint} />
          <Text style={[live.metaLabel, { color: c.textHint }]}>{label}</Text>
        </View>
        <TextBone lineHeight={20} width={valueWidth} />
      </View>
    </View>
  );
}

function LedgerRowSkeleton({
  nameWidth,
  showBadge,
  showDivider,
}: {
  nameWidth: DimensionValue;
  showBadge: boolean;
  showDivider: boolean;
}) {
  const c = useAppColors();
  return (
    <View style={[ui.row, live.row, showDivider && ui.rowDivider, { borderColor: c.border }]}>
      <Skeleton width={32} height={32} radius={9} />
      <View style={live.rowLeft}>
        <View style={live.rowInfo}>
          <TextBone lineHeight={20} width={nameWidth} />
          {showBadge ? <Skeleton width={38} height={16} radius={4} /> : null}
        </View>
        <View style={live.rowAmounts}>
          <TextBone lineHeight={20} width={56} />
        </View>
      </View>
      <View style={live.rowActions}>
        <Skeleton width={40} height={40} radius={20} />
        <Skeleton width={40} height={40} radius={20} />
      </View>
    </View>
  );
}

/* Values copied from the live session components listed at the top of the file. */
const live = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  group: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  headerLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.72, marginBottom: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pot: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 2,
  },
  potLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.72 },
  metaRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  metaCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  metaText: { flex: 1, gap: 2 },
  metaLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.66 },
  ledger: { gap: 8 },
  ledgerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, minHeight: 32 },
  row: { gap: 12 },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 },
  rowInfo: { flex: 1, minWidth: 0, gap: 4 },
  rowAmounts: { alignItems: 'flex-end', marginLeft: 8, minWidth: 80 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

/* ------------------------------------------------------------------------------------------ */
/* Session summary                                                                             */
/* ------------------------------------------------------------------------------------------ */

type MetaTile = { icon: IconName; label: string; tint: 'accent' | 'yellow' | 'blue' | 'chip'; width: DimensionValue };
const SUMMARY_META: MetaTile[][] = [
  [
    { icon: 'map-marker-outline', label: 'Location', tint: 'accent', width: '80%' },
    { icon: 'crown-outline', label: 'Host', tint: 'yellow', width: '65%' },
  ],
  [
    { icon: 'clock-outline', label: 'Duration', tint: 'blue', width: '50%' },
    { icon: 'cash-multiple', label: 'Blinds', tint: 'chip', width: '60%' },
  ],
];

/** Mirrors app/session/summary/[id].tsx: info grid, standings cards, settlement rows. */
export function SessionSummarySkeleton({ contentStyle }: LayoutProps) {
  const c = useAppColors();
  return (
    <SkeletonGroup label="Loading summary" style={[summary.screen, { backgroundColor: c.bg }]}>
      <View style={[contentStyle, summary.content]}>
        <View style={[summary.metaCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={summary.metaGrid}>
            {SUMMARY_META.map((row, r) => (
              <View key={r} style={summary.metaGridRow}>
                {row.map((tile) => (
                  <SummaryMetaTile key={tile.label} tile={tile} />
                ))}
              </View>
            ))}
          </View>
        </View>

        <View style={summary.block}>
          <View style={summary.sectionHeader}>
            <Icon name="trophy-outline" size={20} color={c.warning} />
            <Text style={[summary.sectionTitle, { color: c.text }]}>Standings</Text>
          </View>
          {PLAYER_NAME_WIDTHS.map((nameWidth, i) => (
            <StandingSkeleton key={i} nameWidth={nameWidth} />
          ))}
        </View>

        <View style={summary.block}>
          <View style={summary.sectionHeader}>
            <Icon name="bank-transfer" size={26} color={c.green} />
            <Text style={[summary.sectionTitle, { color: c.text }]}>Settlement</Text>
          </View>
          <View style={[summary.settlementCard, { backgroundColor: c.card, borderColor: c.border }]}>
            {SETTLEMENT_NAME_WIDTHS.map((fromWidth, i) => (
              <View key={i}>
                {i > 0 ? <View style={[summary.divider, { backgroundColor: c.border }]} /> : null}
                <View style={summary.settlementRow}>
                  <View style={summary.settlementNames}>
                    <TextBone lineHeight={20} width={fromWidth} />
                    <View style={summary.settlementFlow}>
                      <Icon name="arrow-right-bold" size={14} color={c.textMuted} />
                      <TextBone lineHeight={17} width="40%" style={summary.flex} />
                    </View>
                  </View>
                  <Skeleton width={72} height={32} radius={9} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </SkeletonGroup>
  );
}

function SummaryMetaTile({ tile }: { tile: MetaTile }) {
  const c = useAppColors();
  const tints = {
    accent: { wrap: { backgroundColor: c.accentBg }, icon: c.green },
    yellow: { wrap: { backgroundColor: c.yellowBg }, icon: c.yellow },
    blue: { wrap: { backgroundColor: c.blueBg }, icon: c.blue },
    chip: { wrap: { backgroundColor: c.chipBg, borderColor: c.chipBorder, borderWidth: 1 }, icon: c.chipText },
  } as const;
  const tint = tints[tile.tint];
  return (
    <View style={summary.metaCell}>
      <View style={[summary.metaIconWrap, tint.wrap]}>
        <Icon name={tile.icon} size={16} color={tint.icon} />
      </View>
      <View style={summary.metaText}>
        <Text style={[summary.metaLabel, { color: c.textMuted }]}>{tile.label}</Text>
        <TextBone lineHeight={18} width={tile.width} />
      </View>
    </View>
  );
}

function StandingSkeleton({ nameWidth }: { nameWidth: DimensionValue }) {
  const c = useAppColors();
  return (
    <View style={[summary.resultRow, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={summary.rankBar} />
      <View style={summary.resultBody}>
        <View style={summary.resultTop}>
          <View style={summary.resultLeft}>
            <Skeleton width={32} height={32} radius={9} />
            <TextBone lineHeight={20} width={nameWidth} style={summary.flex} />
          </View>
          <TextBone lineHeight={22} width={68} />
        </View>
        <View style={summary.amountChips}>
          <Skeleton width={88} height={31} radius={8} />
          <Icon name="arrow-right" size={14} color={c.textHint} />
          <Skeleton width={88} height={31} radius={8} />
        </View>
      </View>
    </View>
  );
}

/* Values copied from app/session/summary/[id].tsx styles. */
const summary = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  content: { flexGrow: 1 },
  flex: { flex: 1 },
  metaCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  metaGrid: { gap: 12 },
  metaGridRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  metaCell: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  metaIconWrap: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  metaText: { flex: 1, minWidth: 0, gap: 3 },
  metaLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.66 },
  block: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  sectionTitle: { fontWeight: '600', fontSize: 17, lineHeight: 22 },
  resultRow: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  rankBar: { width: 4 },
  resultBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, gap: 10, minWidth: 0 },
  resultTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  resultLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  amountChips: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  settlementCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 16 },
  divider: { height: 1 },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 12,
  },
  settlementNames: { flex: 1, minWidth: 0, gap: 4 },
  settlementFlow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

/* ------------------------------------------------------------------------------------------ */
/* Cash-out                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** Four minus and four plus quick-amount chips per player. */
const CHIP_COUNT = 8;

/**
 * Mirrors the body of app/session/cashout/[id].tsx under its title: instructions line, balance
 * tracker, player cards and the confirm button. The screen keeps its own container and title.
 */
export function CashOutSkeleton() {
  const c = useAppColors();
  return (
    <SkeletonGroup label="Loading cash-out" style={cashOut.body}>
      <TextBone lineHeight={18} width="72%" style={cashOut.meta} />

      <View style={[cashOut.trackerCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={cashOut.trackerRow}>
          <TrackerItemSkeleton label="Total Pot" />
          <TrackerItemSkeleton label="Distributed" />
          <TrackerItemSkeleton />
        </View>
        <View style={cashOut.center}>
          <TextBone lineHeight={16} width={160} />
        </View>
      </View>

      <View style={cashOut.list}>
        {PLAYER_NAME_WIDTHS.map((nameWidth, i) => (
          <CashOutCardSkeleton key={i} nameWidth={nameWidth} />
        ))}
      </View>

      <Skeleton height={48} radius={14} style={cashOut.confirm} />
    </SkeletonGroup>
  );
}

/** A tracker column; the third one's label flips between Remaining and Balanced, so it's a bone. */
function TrackerItemSkeleton({ label }: { label?: string }) {
  const c = useAppColors();
  return (
    <View style={cashOut.trackerItem}>
      {label ? (
        <Text style={[cashOut.trackerLabel, { color: c.textHint }]}>{label}</Text>
      ) : (
        <TextBone lineHeight={14} width={64} />
      )}
      <TextBone lineHeight={22} width={72} />
    </View>
  );
}

function CashOutCardSkeleton({ nameWidth }: { nameWidth: DimensionValue }) {
  const c = useAppColors();
  return (
    <View style={[cashOut.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={cashOut.cardHeader}>
        <TextBone lineHeight={20} width={nameWidth} style={cashOut.flex} />
        <TextBone lineHeight={16} width={88} />
      </View>
      <View style={[cashOut.inputRow, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
        <TextBone lineHeight={22} width={80} />
      </View>
      <View style={cashOut.chipRow}>
        {Array.from({ length: CHIP_COUNT }, (_, i) => (
          <Skeleton key={i} width={44} height={44} radius={8} />
        ))}
      </View>
      <View style={[cashOut.profitRow, { borderTopColor: c.border }]}>
        <Text style={[cashOut.profitLabel, { color: c.textHint }]}>P/L</Text>
        <TextBone lineHeight={18} width={52} />
      </View>
    </View>
  );
}

/* Values copied from app/session/cashout/[id].tsx styles. */
const cashOut = StyleSheet.create({
  /** Same gap as the screen container, so the skeleton's children space like the real ones. */
  body: { flex: 1, gap: 12 },
  flex: { flex: 1 },
  center: { alignItems: 'center' },
  meta: { marginTop: -6 },
  trackerCard: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  trackerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  trackerItem: { alignItems: 'center', flex: 1, gap: 2 },
  trackerLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.66 },
  list: { flex: 1, overflow: 'hidden', paddingBottom: 8 },
  card: { borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  profitLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.72 },
  confirm: { marginBottom: 16 },
});
