import { ModalShell } from '@/components/session/modal-shell';
import { PlayerAvatar } from '@/components/player-avatar';
import { faceValue, isFaceAvatar, randomFaceSeeds } from '@/lib/avatar-face';
import { appAlert } from '@/lib/app-alert';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { pressBg, text } from '@/lib/ui';
import { useAuth } from '@/lib/auth-context';
import { getPlayerAppStatistics, type PlayerAppStatistics } from '@/lib/firestore';
import { useThemePreference } from '@/lib/theme-context';
import { Icon, type IconName } from '@/components/icon';
import { GoogleLogo } from '@/components/google-button';
import { EnvelopeSimpleIcon } from 'phosphor-react-native/src/icons/EnvelopeSimple';
import { StatsBody, StatsSkeleton } from '@/components/stats-body';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { userMessage } from '@/lib/user-message';
import { EditNameModal } from '@/components/edit-name-modal';
import { Animated as Motion, PressableScale, webSafe } from '@/components/motion';
import { LayoutAnimationConfig, ReduceMotion, ZoomIn, FadeIn } from 'react-native-reanimated';

const checkEntering = webSafe(
  ZoomIn.springify()
    .damping(16)
    .stiffness(320)
    .mass(0.6)
    .withInitialValues({ transform: [{ scale: 0.4 }] })
    .reduceMotion(ReduceMotion.System),
  FadeIn.duration(150).reduceMotion(ReduceMotion.System),
);

const FACE_BATCH = 30;
const FACE_TILE = 56;

const STATS_SHEET_MAX = 560;

export default function SettingsScreen() {
  const router = useRouter();
  const { user, playerProfile, saveAvatarEmoji, saveDisplayName, isLinked, linkedEmail, email, hasPassword, signOutUser } =
    useAuth();
  const c = useAppColors();
  const layout = usePageLayout(40);
  const { height: windowHeight } = useWindowDimensions();
  const { preference, setPreference } = useThemePreference();
  const t = settingsTheme(c);
  const signInMethodLabel = isLinked ? 'Signed in with Google' : 'Signed in with email';
  const accountEmail = (isLinked ? linkedEmail : null) ?? email;
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [faceSeeds, setFaceSeeds] = useState(() => randomFaceSeeds(FACE_BATCH));
  // Keep the current face as the first tile so it stays visible (and selectable) across shuffles.
  const currentFace = isFaceAvatar(playerProfile?.avatarEmoji) ? playerProfile.avatarEmoji : null;
  const pickerFaces = [
    ...(currentFace ? [currentFace] : []),
    ...faceSeeds.map(faceValue).filter((f) => f !== currentFace),
  ];
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [pendingAvatarEmoji, setPendingAvatarEmoji] = useState<string | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerAppStatistics | null>(null);

  const statsRequestUser = showStatsModal ? user : null;
  const [prevStatsRequestUser, setPrevStatsRequestUser] = useState(statsRequestUser);
  if (prevStatsRequestUser !== statsRequestUser) {
    setPrevStatsRequestUser(statsRequestUser);
    if (statsRequestUser) {
      setStatsLoading(true);
      setStatsError(null);
    }
  }

  useEffect(() => {
    if (!showStatsModal || !user) return;
    let cancelled = false;
    void getPlayerAppStatistics(user.uid)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setStatsError(userMessage(e, 'Failed to load statistics.'));
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
    void setPreference(p).catch(() => {
      appAlert('Theme not saved', 'The theme changed for this session but could not be saved to device storage.');
    });
  }

  function onSignOut() {
    appAlert('Sign out?', 'You can sign back in any time with the same account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void signOutUser().catch((e) => {
            appAlert('Sign out failed', userMessage(e, 'Please try again.'));
          });
        },
      },
    ]);
  }

  async function onPickAvatar(emoji: string) {
    if (savingAvatar) return;
    try {
      setPendingAvatarEmoji(emoji);
      setSavingAvatar(true);
      await saveAvatarEmoji(emoji);
      setShowAvatarPicker(false);
    } catch (e) {
      appAlert('Error', userMessage(e, 'Failed to save avatar.'));
    } finally {
      setSavingAvatar(false);
      setPendingAvatarEmoji(null);
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: t.bg }]}
      contentContainerStyle={[layout.content, styles.content, layout.tabTop]}>
      <View style={styles.pageTitleRow}>
        <Icon name="person" size={26} color={t.muted} importantForAccessibility="no" />
        <Text style={[styles.title, { color: t.text }]}>Profile</Text>
      </View>

      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={styles.profileRow}>
            <PressableScale
              pressedScale={0.94}
              style={[styles.avatar, { backgroundColor: t.avatarBg }]}
              onPress={() => setShowAvatarPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Change avatar">
              <PlayerAvatar value={playerProfile?.avatarEmoji} size={62} />
              <View style={[styles.avatarEditBadge, { backgroundColor: t.accent, borderColor: t.border }]}>
                <Icon name="edit" size={13} color={t.onAccent} />
              </View>
            </PressableScale>
            <View style={styles.profileText}>
              <View style={styles.displayNameRow}>
                <Text
                  style={[styles.displayName, styles.displayNameText, { color: t.text }]}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {playerProfile?.name ?? 'Guest'}
                </Text>
                <PressableScale
                  pressedScale={0.9}
                  style={styles.editNameBtn}
                  onPress={() => setShowNameEditor(true)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel="Edit display name"
                  {...({ dataSet: { hoverDot: 'true' } } as object)}>
                  {/* Small visible hover circle; the button keeps the larger tap area. */}
                  <View style={styles.editNameDot}>
                    <Icon name="edit" size={16} color={t.muted} />
                  </View>
                </PressableScale>
              </View>
              {accountEmail ? (
                <View
                  style={styles.accountLine}
                  accessible
                  accessibilityLabel={`${signInMethodLabel}, ${accountEmail}`}>
                  <View style={styles.accountIcon}>
                    {isLinked ? <GoogleLogo size={16} /> : <EnvelopeSimpleIcon size={16} color={t.muted} />}
                  </View>
                  <Text style={[styles.accountEmail, { color: t.muted }]} numberOfLines={1} ellipsizeMode="middle">
                    {accountEmail}
                  </Text>
                </View>
              ) : null}
            </View>
            <PressableScale
              style={[styles.qrBtn, { backgroundColor: t.accent }]}
              onPress={() => router.push('../qr-code')}
              accessibilityRole="button"
              accessibilityLabel="Open QR code">
              <Icon name="qr-code" size={22} color={t.onAccent} />
            </PressableScale>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.cardLabel, { color: t.muted }]} accessibilityRole="header">
          Sessions
        </Text>
        <View style={[styles.listCard, { backgroundColor: t.card, borderColor: t.border }]}>
          <NavRow icon="bar-chart" label="Statistics" onPress={() => setShowStatsModal(true)} t={t} />
          <NavRow
            icon="location-on"
            label="Saved locations"
            onPress={() => router.push('../locations')}
            t={t}
            showDivider
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.cardLabel, { color: t.muted }]} accessibilityRole="header">
          Account
        </Text>
        <View style={[styles.listCard, { backgroundColor: t.card, borderColor: t.border }]}>
          {/* Google-only accounts have no password to change. */}
          {hasPassword ? (
            <NavRow icon="lock" label="Change password" onPress={() => router.push('/change-password')} t={t} />
          ) : null}
          <NavRow
            icon="delete-outline"
            label="Delete account"
            onPress={() => router.push('/delete-account')}
            t={t}
            showDivider={hasPassword}
            isDanger
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.cardLabel, { color: t.muted }]} accessibilityRole="header">
          Appearance
        </Text>
        <LayoutAnimationConfig skipEntering>
          <View style={[styles.listCard, { backgroundColor: t.card, borderColor: t.border }]}>
            <ThemeOption
              icon="phone-iphone"
              label="System"
              selected={preference === 'system'}
              onPress={() => onSelectTheme('system')}
              t={t}
            />
            <ThemeOption
              icon="wb-sunny"
              label="Light"
              selected={preference === 'light'}
              onPress={() => onSelectTheme('light')}
              t={t}
              showDivider
            />
            <ThemeOption
              icon="nights-stay"
              label="Dark"
              selected={preference === 'dark'}
              onPress={() => onSelectTheme('dark')}
              t={t}
              showDivider
            />
          </View>
        </LayoutAnimationConfig>
      </View>

      {/* Sign out lives on its own at the end (iOS-style) so the account card never has to squeeze it in. */}
      <PressableScale
        style={[styles.signOutBtn, { borderColor: t.border, backgroundColor: t.card }]}
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out">
        <Icon name="logout" size={18} color={c.loss} />
        <Text style={[styles.signOutLabel, { color: c.loss }]}>Sign out</Text>
      </PressableScale>

      <ModalShell
        visible={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        title="Your statistics"
        titleIcon={{ name: 'bar-chart', color: t.muted }}
        avoidKeyboard={false}
        // 60% of the screen, capped at 560px so very tall windows still get a compact sheet; the body scrolls.
        cardStyle={{ maxHeight: Math.min(STATS_SHEET_MAX, windowHeight * 0.6) }}>
        {!user ? (
          <Text style={[styles.statsFootnote, { color: t.muted }]}>Sign in to see statistics.</Text>
        ) : statsLoading ? (
          <ScrollView style={styles.modalScroll}>
            <StatsSkeleton />
          </ScrollView>
        ) : statsError ? (
          <Text style={[styles.statsError, { color: c.loss }]} accessibilityRole="alert">
            {statsError}
          </Text>
        ) : stats ? (
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.statsScrollContent}>
            <StatsBody stats={stats} />
          </ScrollView>
        ) : null}
      </ModalShell>

      {showNameEditor ? (
        <EditNameModal
          initialName={playerProfile?.name ?? ''}
          onClose={() => setShowNameEditor(false)}
          onSave={saveDisplayName}
        />
      ) : null}

      <ModalShell
        visible={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        title="Pick an avatar"
        titleIcon={{ name: 'person', color: t.muted }}
        avoidKeyboard={false}
        headerAction={
          <PressableScale
            pressedScale={0.94}
            onPress={() => setFaceSeeds(randomFaceSeeds(FACE_BATCH))}
            disabled={savingAvatar}
            accessibilityRole="button"
            accessibilityLabel="Shuffle avatars"
            style={[styles.shuffleBtn, { borderColor: t.border, backgroundColor: t.chipBg }]}>
            <Icon name="refresh" size={16} color={t.accentText} />
            <Text style={[styles.shuffleText, { color: t.text }]}>Shuffle</Text>
          </PressableScale>
        }>
        <ScrollView style={styles.modalScroll}>
          <View style={styles.emojiGrid} accessibilityRole="radiogroup">
            {pickerFaces.map((face, i) => {
              const current = savingAvatar ? pendingAvatarEmoji : playerProfile?.avatarEmoji;
              const checked = current === face;
              return (
                <PressableScale
                  key={face}
                  pressedScale={0.92}
                  style={[styles.emojiBtn, { borderColor: checked ? t.accentText : 'transparent' }]}
                  onPress={() => onPickAvatar(face)}
                  disabled={savingAvatar}
                  accessibilityRole="radio"
                  accessibilityLabel={`Avatar ${i + 1}`}
                  accessibilityState={{ checked, disabled: savingAvatar }}>
                  {savingAvatar && pendingAvatarEmoji === face ? (
                    <ActivityIndicator size="small" color={t.accentText} />
                  ) : (
                    <PlayerAvatar value={face} size={FACE_TILE - 8} />
                  )}
                </PressableScale>
              );
            })}
            </View>
        </ScrollView>
      </ModalShell>
    </ScrollView>
  );
}

/** Settings-style list row that opens another screen or sheet. */
function NavRow({
  icon,
  label,
  onPress,
  t,
  showDivider,
  isDanger,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  t: SettingsTheme;
  showDivider?: boolean;
  isDanger?: boolean;
}) {
  const c = useAppColors();
  const tint = isDanger ? c.loss : t.text;
  return (
    <PressableScale
      pressedScale={0.985}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => [
        styles.themeRow,
        showDivider && styles.rowDivider,
        { borderColor: t.border },
        pressBg(c, state, t.card),
      ]}>
      <View style={[styles.themeIconWrap, { backgroundColor: isDanger ? `${c.loss}1a` : t.chipBg }]}>
        <Icon name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.themeLabel, styles.themeText, { color: tint }]}>{label}</Text>
      <Icon name="chevron-right" size={18} color={t.muted} />
    </PressableScale>
  );
}

function ThemeOption({
  icon,
  label,
  selected,
  onPress,
  t,
  showDivider,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
  t: SettingsTheme;
  showDivider?: boolean;
}) {
  const c = useAppColors();
  return (
    <PressableScale
      pressedScale={0.985}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label} theme`}
      style={(state) => [
        styles.themeRow,
        showDivider && styles.rowDivider,
        { borderColor: t.border },
        pressBg(c, state, selected ? t.selectedBg : t.card),
      ]}>
      {/* Selected tile takes a soft gold tint, echoing the check on the right. */}
      <View style={[styles.themeIconWrap, { backgroundColor: selected ? `${t.accent}33` : t.chipBg }]}>
        <Icon name={icon} size={18} color={selected ? t.accentText : t.text} />
      </View>
      <Text style={[styles.themeLabel, styles.themeText, { color: t.text }]}>{label}</Text>
      {selected ? (
        <Motion.View entering={checkEntering}>
          <Icon name="check-circle" size={22} color={t.accentText} />
        </Motion.View>
      ) : (
        <View style={[styles.radioOuter, { borderColor: t.border }]}>
          <View style={styles.radioInner} />
        </View>
      )}
    </PressableScale>
  );
}

function settingsTheme(c: AppColors) {
  return {
    bg: c.bg,
    card: c.card,
    border: c.border,
    text: c.text,
    muted: c.textMuted,
    accent: c.accent,
    accentText: c.accentText,
    onAccent: c.onAccent,
    avatarBg: c.avatarBg,
    avatarIcon: c.avatarIcon,
    chipBg: c.bg,
    selectedBg: c.accentBg,
  };
}

type SettingsTheme = ReturnType<typeof settingsTheme>;

const styles = StyleSheet.create({
  editNameDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 48,
  },
  title: text.display,
  section: {
    gap: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowDivider: {
    borderTopWidth: 1,
  },
  cardLabel: {
    ...text.section,
    paddingHorizontal: 4,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 30,
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
  // Share code: primary action, kept as a gold icon at the end of the name row.
  qrBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Long emails shrink the text, never the icon.
  accountIcon: {
    flexShrink: 0,
  },
  accountEmail: {
    ...text.caption,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  editNameBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    // Keeps the 44px tap target without making the name row taller than the name.
    marginVertical: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  // Shrink rather than fill, so the pencil sits right after the name it edits.
  displayNameText: {
    flexShrink: 1,
  },
  displayName: text.title,
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
  },
  signOutLabel: text.button,
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  themeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeText: {
    flex: 1,
    gap: 2,
  },
  themeLabel: text.rowTitle,
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
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  emojiBtn: {
    width: FACE_TILE,
    height: FACE_TILE,
    borderRadius: FACE_TILE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  shuffleText: { fontSize: 14, fontWeight: '600' },
  statsScrollContent: {
    gap: 2,
  },
  // Lets the modal's max height bound the content, which then scrolls.
  modalScroll: {
    flexShrink: 1,
  },
  statsError: {
    ...text.caption,
    paddingVertical: 12,
  },
  statsFootnote: {
    ...text.caption,
    marginTop: 10,
  },
});
