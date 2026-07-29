import { AVATAR_EMOJIS } from '@/constants/avatar';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatSignedCurrency } from '@/lib/currency-format';
import { formatDateDMY } from '@/lib/date-format';
import { getPlayerAppStatistics, type PlayerAppStatistics } from '@/lib/firestore';
import { useThemePreference } from '@/lib/theme-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

function formatPlayTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function signedMetricColor(
  c: { profit: string; loss: string },
  n: number | null | undefined
): string | undefined {
  if (n === null || n === undefined || Number.isNaN(n)) return undefined;
  if (n > 0) return c.profit;
  if (n < 0) return c.loss;
  return undefined;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, playerProfile, saveAvatarEmoji } = useAuth();
  const c = useAppColors();
  const { preference, resolvedColorScheme, setPreference } = useThemePreference();
  const isDark = resolvedColorScheme === 'dark';
  // Shared surface colors come from the app-wide palette so this screen can't drift from it;
  // only the settings-specific accents below stay local.
  const t = {
    ...(isDark ? theme.dark : theme.light),
    bg: c.bg,
    card: c.card,
    border: c.border,
    text: c.text,
    muted: c.textMuted,
  };
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [pendingAvatarEmoji, setPendingAvatarEmoji] = useState<string | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerAppStatistics | null>(null);

  useEffect(() => {
    if (!showStatsModal || !user) return;
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    void getPlayerAppStatistics(user.uid)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setStatsError(e instanceof Error ? e.message : 'Failed to load statistics.');
        }
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showStatsModal, user]);

  function onSelectTheme(p: 'system' | 'light' | 'dark') {
    // Theme applies in memory even if persisting fails; tell the user it won't stick.
    void setPreference(p).catch(() => {
      appAlert(
        'Theme not saved',
        'The theme changed for this session but could not be saved to device storage.'
      );
    });
  }

  async function onPickAvatar(emoji: string) {
    if (savingAvatar) return;
    try {
      setPendingAvatarEmoji(emoji);
      setSavingAvatar(true);
      await saveAvatarEmoji(emoji);
      setShowAvatarPicker(false);
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to save avatar.');
    } finally {
      setSavingAvatar(false);
      setPendingAvatarEmoji(null);
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: t.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: t.text }]}>Settings</Text>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.cardLabel, { color: t.muted }]}>PROFILE</Text>
        <View style={styles.profileRow}>
          <Pressable
            style={[styles.avatar, { backgroundColor: t.avatarBg }]}
            onPress={() => setShowAvatarPicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit avatar emoji">
            <Text style={styles.avatarEmoji}>{playerProfile?.avatarEmoji ?? '🙂'}</Text>
            <View style={[styles.avatarEditBadge, { backgroundColor: t.accent, borderColor: t.border }]}>
              <MaterialIcons name="edit" size={13} color="#fff" />
            </View>
          </Pressable>
          <Pressable
            style={styles.profileText}
            onPress={() => router.push('../(auth)/name')}
            accessibilityRole="button"
            accessibilityLabel="Edit display name">
            <View style={styles.displayNameRow}>
              <Text
                style={[styles.displayName, styles.displayNameText, { color: t.text }]}
                numberOfLines={1}
                ellipsizeMode="tail">
                {playerProfile?.name ?? 'Guest'}
              </Text>
              <MaterialIcons name="edit" size={16} color={t.muted} />
            </View>
            <Text style={[styles.displayHint, { color: t.muted }]}>Display name</Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: t.accent }]}
          onPress={() => router.push('../qr-code')}
          accessibilityRole="button"
          accessibilityLabel="Open QR code">
          <MaterialIcons name="qr-code" size={18} color="#fff" />
          <Text style={styles.primaryBtnLabel}>QR Code</Text>
        </Pressable>
        <View style={styles.secondaryBtnRow}>
          <Pressable
            style={[
              styles.secondaryBtn,
              styles.secondaryBtnHalf,
              { borderColor: t.card, backgroundColor: t.avatarBg },
            ]}
            onPress={() => router.push('../locations')}>
            <View style={styles.secondaryBtnContent}>
              <MaterialIcons name="location-on" size={18} color={t.text} />
              <Text style={[styles.secondaryBtnLabel, { color: t.text }]}>Locations</Text>
            </View>
          </Pressable>
          <Pressable
            style={[
              styles.secondaryBtn,
              styles.secondaryBtnHalf,
              { borderColor: t.card, backgroundColor: t.avatarBg },
            ]}
            onPress={() => setShowStatsModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Open statistics">
            <View style={styles.secondaryBtnContent}>
              <MaterialIcons name="bar-chart" size={18} color={t.text} />
              <Text style={[styles.secondaryBtnLabel, { color: t.text }]}>Statistics</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.cardLabel, { color: t.muted }]}>APPEARANCE</Text>
        <Text style={[styles.appearanceHint, { color: t.muted }]}>
          Choose light, dark, or match your device.
        </Text>

        <ThemeOption
          icon="phone-iphone"
          label="System"
          description="Match device setting"
          selected={preference === 'system'}
          onPress={() => onSelectTheme('system')}
          t={t}
        />
        <ThemeOption
          icon="wb-sunny"
          label="Light"
          description="Always light theme"
          selected={preference === 'light'}
          onPress={() => onSelectTheme('light')}
          t={t}
        />
        <ThemeOption
          icon="nights-stay"
          label="Dark"
          description="Always dark theme"
          selected={preference === 'dark'}
          onPress={() => onSelectTheme('dark')}
          t={t}
        />
      </View>

      <Modal
        visible={showStatsModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowStatsModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={() => setShowStatsModal(false)}
          />
          <View pointerEvents="box-none" style={styles.statsModalCenter}>
            <View style={[styles.statsCard, { backgroundColor: t.card, borderColor: t.border }]}>
              <View style={styles.statsHeaderRow}>
                <Text style={[styles.statsTitle, { color: t.text }]}>Your statistics</Text>
                <Pressable
                  onPress={() => setShowStatsModal(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close statistics">
                  <MaterialIcons name="close" size={22} color={t.muted} />
                </Pressable>
              </View>
              {!user ? (
                <Text style={[styles.statsFootnote, { color: t.muted }]}>
                  Sign in to see statistics.
                </Text>
              ) : statsLoading ? (
                <View style={styles.statsLoadingWrap}>
                  <ActivityIndicator size="large" color={t.accent} />
                </View>
              ) : statsError ? (
                <Text style={[styles.statsError, { color: '#b91c1c' }]}>{statsError}</Text>
              ) : stats ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.statsScrollContent}>
                  <Text style={[styles.statsSectionLabel, { color: t.muted }]}>Sessions</Text>
                  <StatRow t={t} label="Finished sessions" value={String(stats.finishedSessions)} />
                  <StatRow
                    t={t}
                    label="First session"
                    value={stats.firstSessionDate ? formatDateDMY(stats.firstSessionDate) : '—'}
                  />
                  <StatRow
                    t={t}
                    label="Latest session"
                    value={stats.lastSessionDate ? formatDateDMY(stats.lastSessionDate) : '—'}
                  />
                  <StatRow t={t} label="As host" value={String(stats.sessionsAsHost)} />
                  <StatRow t={t} label="As participant" value={String(stats.sessionsAsParticipant)} />

                  <Text style={[styles.statsSectionLabel, { color: t.muted }]}>Results & money</Text>
                  <StatRow
                    t={t}
                    label="Lifetime profit / loss"
                    value={formatSignedCurrency(stats.totalProfit)}
                    emphasize
                    valueColor={signedMetricColor(c, stats.totalProfit)}
                  />
                  <StatRow
                    t={t}
                    label="Average per finished session"
                    value={
                      stats.avgProfitPerSession !== null
                        ? formatSignedCurrency(stats.avgProfitPerSession)
                        : '—'
                    }
                    valueColor={signedMetricColor(c, stats.avgProfitPerSession ?? undefined)}
                  />
                  <StatRow
                    t={t}
                    label="P/L per hour"
                    value={
                      stats.profitPerHour !== null
                        ? formatSignedCurrency(stats.profitPerHour)
                        : '—'
                    }
                    hint="Lifetime P/L divided by recorded time played."
                    valueColor={signedMetricColor(c, stats.profitPerHour ?? undefined)}
                  />
                  <StatRow
                    t={t}
                    label="Best session"
                    value={
                      stats.bestSessionProfit !== null
                        ? formatSignedCurrency(stats.bestSessionProfit)
                        : '—'
                    }
                    valueColor={signedMetricColor(c, stats.bestSessionProfit ?? undefined)}
                  />
                  <StatRow
                    t={t}
                    label="Worst session"
                    value={
                      stats.worstSessionProfit !== null
                        ? formatSignedCurrency(stats.worstSessionProfit)
                        : '—'
                    }
                    valueColor={signedMetricColor(c, stats.worstSessionProfit ?? undefined)}
                  />
                  <StatRow
                    t={t}
                    label="Win rate"
                    value={
                      stats.finishedSessions > 0
                        ? `${((stats.winningSessions / stats.finishedSessions) * 100).toFixed(1)}% (${stats.winningSessions}W / ${stats.losingSessions}L / ${stats.breakEvenSessions} even)`
                        : '—'
                    }
                  />
                  <StatRow
                    t={t}
                    label="Total buy-in"
                    value={formatCurrency(stats.totalBuyIn)}
                  />
                  <StatRow
                    t={t}
                    label="Total cash-out"
                    value={formatCurrency(stats.totalCashOut)}
                  />
                  <StatRow
                    t={t}
                    label="Return on buy-in"
                    value={
                      stats.totalBuyIn > 0
                        ? `${((stats.totalProfit / stats.totalBuyIn) * 100).toFixed(1)}%`
                        : '—'
                    }
                    hint="Profit ÷ total buy-in across finished sessions."
                    valueColor={
                      stats.totalBuyIn > 0 ? signedMetricColor(c, stats.totalProfit) : undefined
                    }
                  />

                  <Text style={[styles.statsSectionLabel, { color: t.muted }]}>Time & places</Text>
                  <StatRow
                    t={t}
                    label="Total time played"
                    value={formatPlayTime(stats.totalPlayTimeMs)}
                    hint="Sum of session lengths where end time is recorded."
                  />
                  <StatRow
                    t={t}
                    label="Sessions with a location"
                    value={String(stats.sessionsWithLocation)}
                  />
                  <StatRow
                    t={t}
                    label="Unique locations played"
                    value={String(stats.uniqueSessionLocations)}
                  />

                  <Text style={[styles.statsSectionLabel, { color: t.muted }]}>Social & saved data</Text>
                  <StatRow t={t} label="Friends" value={String(stats.friendCount)} />
                  <StatRow t={t} label="Groups" value={String(stats.groupCount)} />
                  <StatRow
                    t={t}
                    label="Saved locations"
                    value={`${stats.savedLocationCount} / 10`}
                  />

                  <Text style={[styles.statsFootnote, { color: t.muted }]}>
                    Stats include every finished session in the database where you have a saved result.
                    Sessions without a recorded end time do not add to “time played” or P/L per hour.
                  </Text>
                </ScrollView>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAvatarPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowAvatarPicker(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={() => setShowAvatarPicker(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View style={[styles.pickerCard, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.pickerTitle, { color: t.text }]}>Pick an avatar</Text>
              <View style={styles.emojiGrid}>
                {AVATAR_EMOJIS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={[
                      styles.emojiBtn,
                      { borderColor: t.border, backgroundColor: t.chipBg },
                      (savingAvatar ? pendingAvatarEmoji : playerProfile?.avatarEmoji) === emoji && {
                        borderColor: t.accent,
                      },
                    ]}
                    onPress={() => onPickAvatar(emoji)}
                    disabled={savingAvatar}>
                    {savingAvatar && pendingAvatarEmoji === emoji ? (
                      <ActivityIndicator size="small" color={t.accent} />
                    ) : (
                      <Text style={styles.emojiBtnText}>{emoji}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatRow({
  t,
  label,
  value,
  hint,
  emphasize,
  valueColor,
}: {
  t: (typeof theme)['dark'];
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={styles.statBlock}>
      <View style={styles.statRow}>
        <Text style={[styles.statLabel, { color: t.muted }]}>{label}</Text>
        <Text
          style={[
            emphasize ? styles.statValueStrong : styles.statValue,
            { color: valueColor ?? t.text },
          ]}
          numberOfLines={3}>
          {value}
        </Text>
      </View>
      {hint ? (
        <Text style={[styles.statHint, { color: t.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

function ThemeOption({
  icon,
  label,
  description,
  selected,
  onPress,
  t,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  t: (typeof theme)['dark'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.themeRow,
        { borderColor: t.border, backgroundColor: selected ? t.selectedBg : 'transparent' },
      ]}>
      <View style={[styles.themeIconWrap, { backgroundColor: t.chipBg }]}>
        <MaterialIcons name={icon} size={22} color={t.text} />
      </View>
      <View style={styles.themeText}>
        <Text style={[styles.themeLabel, { color: t.text }]}>{label}</Text>
        <Text style={[styles.themeDesc, { color: t.muted }]}>{description}</Text>
      </View>
      {selected ? (
        <MaterialIcons name="check-circle" size={24} color={t.accent} />
      ) : (
        <View style={[styles.radioOuter, { borderColor: t.border }]}>
          <View style={styles.radioInner} />
        </View>
      )}
    </Pressable>
  );
}

const theme = {
  dark: {
    bg: '#0f1115',
    card: '#1b1f27',
    border: '#2f3542',
    text: '#f8fafc',
    muted: '#94a3b8',
    accent: '#2d6a4f',
    avatarBg: '#243548',
    avatarIcon: '#94a3b8',
    chipBg: '#12151b',
    selectedBg: 'rgba(45, 106, 79, 0.25)',
  },
  light: {
    bg: '#f1f5f9',
    card: '#ffffff',
    border: '#e2e8f0',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#15803d',
    avatarBg: '#e2e8f0',
    avatarIcon: '#475569',
    chipBg: '#f1f5f9',
    selectedBg: 'rgba(21, 128, 61, 0.12)',
  },
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 34,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    gap: 4,
  },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  displayNameText: {
    flex: 1,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
  },
  displayHint: {
    fontSize: 13,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnHalf: {
    flex: 1,
    minWidth: 0,
  },
  secondaryBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  appearanceHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 4,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  themeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeText: {
    flex: 1,
    gap: 2,
  },
  themeLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  themeDesc: {
    fontSize: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 0,
    height: 0,
  },
  modalRoot: {
    flex: 1,
  },
  modalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  emojiBtn: {
    width: 46,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnText: {
    fontSize: 24,
  },
  statsModalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  statsCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statsScrollContent: {
    gap: 2,
    paddingBottom: 12,
  },
  statsSectionLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statBlock: {
    marginBottom: 6,
    gap: 2,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  statLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  statValue: {
    maxWidth: '52%',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    lineHeight: 18,
  },
  statValueStrong: {
    maxWidth: '52%',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 20,
  },
  statHint: {
    fontSize: 11,
    lineHeight: 15,
  },
  statsRefCode: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statsLoadingWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsError: {
    paddingVertical: 12,
    fontSize: 14,
  },
  statsFootnote: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
});
