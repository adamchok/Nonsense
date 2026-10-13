import { Icon, type IconName } from '@/components/icon';
import { PlayerAvatar } from '@/components/player-avatar';
import { SessionTitle } from '@/components/meta-line';
import { PressableScale } from '@/components/motion';
import { formatSessionTime, formatSessionTitle } from '@/components/session/session-title';
import { Skeleton } from '@/components/skeleton';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { formatCurrency, formatSignedCurrency } from '@/lib/currency-format';
import type { SessionHistoryEntry } from '@/lib/firestore';
import { space } from '@/lib/spacing';
import { pressBg, text as type, ui } from '@/lib/ui';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

const signColor = (c: AppColors, n: number) => (n > 0 ? c.profit : n < 0 ? c.loss : c.text);

const RECENT_ROWS = 3;
const BOARD_ROWS = 3;

function SectionHeader({ title, icon, seeAllHref }: { title: string; icon?: IconName; seeAllHref?: string }) {
  const c = useAppColors();
  const router = useRouter();
  return (
    <View style={ui.sectionHeaderRow}>
      <View style={styles.sectionTitle}>
        {icon ? <Icon name={icon} size={14} color={c.textMuted} /> : null}
        <Text style={[type.section, { color: c.textMuted }]} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {seeAllHref ? (
        <PressableScale
          onPress={() => router.push(seeAllHref as never)}
          accessibilityRole="link"
          accessibilityLabel={`See all ${title.toLowerCase()}`}
          hitSlop={8}
          style={styles.seeAll}>
          <Text style={[type.label, { color: c.accentText }]}>See all</Text>
          <Icon name="chevron-right" size={14} color={c.accentText} />
        </PressableScale>
      ) : null}
    </View>
  );
}

export function RecentResults({
  entries,
  style,
}: {
  entries: SessionHistoryEntry[] | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useAppColors();
  const router = useRouter();
  if (entries && entries.length === 0) return null;
  return (
    <View style={[styles.section, style]}>
      <SectionHeader title="Recent results" icon="history" seeAllHref="/history" />
      <View style={[ui.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {entries
          ? entries.slice(0, RECENT_ROWS).map((item, index) => (
              <PressableScale
                key={item.id}
                pressedScale={0.985}
                onPress={() => router.push(`../session/summary/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${formatSessionTitle(item.date, item.location)}, ${item.profit >= 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(item.profit))}`}
                style={(state) => [
                  ui.row,
                  index > 0 && ui.rowDivider,
                  { borderColor: c.border },
                  pressBg(c, state, c.card),
                ]}>
                <View style={ui.rowBody}>
                  <SessionTitle
                    date={item.date}
                    location={item.location}
                    textStyle={[type.rowTitle, { color: c.text }]}
                  />
                  <Text style={[type.rowMeta, { color: c.textMuted }]}>{formatSessionTime(item.date)}</Text>
                </View>
                <Text style={[type.amount, { color: signColor(c, item.profit) }]}>
                  {formatSignedCurrency(item.profit)}
                </Text>
              </PressableScale>
            ))
          : [0, 1, 2].map((i) => (
              <View key={i} style={[ui.row, i > 0 && ui.rowDivider, { borderColor: c.border }]}>
                <View style={ui.rowBody}>
                  <Skeleton width={160} height={14} />
                  <Skeleton width={72} height={11} />
                </View>
                <Skeleton width={56} height={14} />
              </View>
            ))}
      </View>
    </View>
  );
}

type BoardRow = { playerId: string; name: string; avatarEmoji?: string; totalProfit: number };

export function FriendsBoard({
  rows,
  myId,
  style,
}: {
  rows: BoardRow[] | undefined;
  myId: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useAppColors();
  if (rows && rows.length < 2) return null;
  return (
    <View style={[styles.section, style]}>
      <SectionHeader title="Friends leaderboard" icon="trophy-outline" seeAllHref="/friends" />
      <View style={[ui.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {rows
          ? rows.slice(0, BOARD_ROWS).map((row, index) => {
              const isMe = row.playerId === myId;
              return (
                <View
                  key={row.playerId}
                  accessible
                  accessibilityLabel={`${index + 1}. ${isMe ? 'You' : row.name}, ${row.totalProfit >= 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(row.totalProfit))}`}
                  style={[
                    ui.row,
                    index > 0 && ui.rowDivider,
                    { borderColor: c.border },
                    isMe && { backgroundColor: c.accentBg },
                  ]}>
                  <Text style={[type.label, type.tabular, styles.rank, { color: c.textMuted }]}>{index + 1}</Text>
                  <PlayerAvatar value={row.avatarEmoji} size={30} />
                  <Text style={[type.rowTitle, styles.boardName, { color: c.text }]} numberOfLines={1}>
                    {isMe ? 'You' : row.name}
                  </Text>
                  <Text style={[type.amount, { color: signColor(c, row.totalProfit) }]}>
                    {formatSignedCurrency(row.totalProfit)}
                  </Text>
                </View>
              );
            })
          : [0, 1, 2].map((i) => (
              <View key={i} style={[ui.row, i > 0 && ui.rowDivider, { borderColor: c.border }]}>
                <Skeleton width={30} height={30} radius={15} />
                <View style={ui.rowBody}>
                  <Skeleton width={110} height={14} />
                </View>
                <Skeleton width={56} height={14} />
              </View>
            ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rank: {
    width: 16,
    textAlign: 'center',
  },
  boardName: {
    flex: 1,
    minWidth: 0,
  },
  section: {
    gap: space.sm,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 32,
  },
});
