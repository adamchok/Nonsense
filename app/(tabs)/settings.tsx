import { ModalBackdrop } from '@/components/modal-backdrop';
import { AVATAR_EMOJIS } from '@/constants/avatar';
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
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SHEET_BREAKPOINT } from '@/lib/spacing';
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

export default function SettingsScreen() {
  const router = useRouter();
  const { user, playerProfile, saveAvatarEmoji, saveDisplayName, isLinked, linkedEmail, email, signOutUser } =
    useAuth();
  const c = useAppColors();
  const layout = usePageLayout(40);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSheet = width < SHEET_BREAKPOINT;
  const { preference, setPreference } = useThemePreference();
  const t = settingsTheme(c);
  const signInMethodLabel = isLinked ? 'Signed in with Google' : 'Signed in with email';
  const accountEmail = (isLinked ? linkedEmail : null) ?? email;
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [pendingAvatarEmoji, setPendingAvatarEmoji] = useState<string | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerAppStatistics | null>(null);
  const [isSignOutHovered, setIsSignOutHovered] = useState(false);
  const signOutColor = isSignOutHovered ? c.loss : t.text;

  // Reset loading/error whenever a new stats request starts (modal opened, or user changed).
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
      appAlert(
        'Theme not saved',
        'The theme changed for this session but could not be saved to device storage.'
      );
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
      contentContainerStyle={[layout.content, styles.content, layout.compactTop]}>
      <Text style={[styles.title, { color: t.text }]}>Settings</Text>

      <View style={styles.section}>
        <Text style={[styles.cardLabel, { color: t.muted }]} accessibilityRole="header">
          Profile
        </Text>
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={styles.profileRow}>
            <PressableScale
              pressedScale={0.94}
              style={[styles.avatar, { backgroundColor: t.avatarBg }]}
              onPress={() => setShowAvatarPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit avatar emoji">
              <Text style={styles.avatarEmoji}>{playerProfile?.avatarEmoji ?? '🙂'}</Text>
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
                  accessibilityLabel="Edit display name">
                  <Icon name="edit" size={18} color={t.muted} />
                </PressableScale>
              </View>
            </View>
          </View>
          <PressableScale
            style={[styles.primaryBtn, { backgroundColor: t.accent }]}
            onPress={() => router.push('../qr-code')}
            accessibilityRole="button"
            accessibilityLabel="Open QR code">
            <Icon name="qr-code" size={18} color={t.onAccent} />
            <Text style={[styles.primaryBtnLabel, { color: t.onAccent }]}>QR Code</Text>
          </PressableScale>
          <View style={styles.secondaryBtnRow}>
            <PressableScale
              style={[
                styles.secondaryBtn,
                styles.secondaryBtnHalf,
                { borderColor: c.inputBorder, backgroundColor: t.card },
              ]}
              onPress={() => router.push('../locations')}
              accessibilityRole="button"
              accessibilityLabel="Saved locations">
              <View style={styles.secondaryBtnContent}>
                <Icon name="location-on" size={18} color={t.text} />
                <Text style={[styles.secondaryBtnLabel, { color: t.text }]}>Locations</Text>
              </View>
            </PressableScale>
            <PressableScale
              style={[
                styles.secondaryBtn,
                styles.secondaryBtnHalf,
                { borderColor: c.inputBorder, backgroundColor: t.card },
              ]}
              onPress={() => setShowStatsModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Open statistics">
              <View style={styles.secondaryBtnContent}>
                <Icon name="bar-chart" size={18} color={t.text} />
                <Text style={[styles.secondaryBtnLabel, { color: t.text }]}>Statistics</Text>
              </View>
            </PressableScale>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.cardLabel, { color: t.muted }]} accessibilityRole="header">
          Account
        </Text>
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <View
            style={styles.linkedRow}
            accessible
            accessibilityLabel={`${signInMethodLabel}${accountEmail ? `, ${accountEmail}` : ''}`}>
            {isLinked ? <GoogleLogo size={22} /> : <EnvelopeSimpleIcon size={22} color={c.accentText} />}
            <View style={styles.linkedTextCol}>
              <Text style={[styles.linkedText, { color: t.text }]}>{signInMethodLabel}</Text>
              {accountEmail ? (
                <Text style={[styles.linkedEmail, { color: t.muted }]} numberOfLines={1} ellipsizeMode="middle">
                  {accountEmail}
                </Text>
              ) : null}
            </View>
            <PressableScale
              style={[
                styles.signOutBtn,
                { borderColor: isSignOutHovered ? c.loss : c.inputBorder, backgroundColor: t.card },
              ]}
              onPress={onSignOut}
              onHoverIn={() => setIsSignOutHovered(true)}
              onHoverOut={() => setIsSignOutHovered(false)}
              accessibilityRole="button"
              accessibilityLabel="Sign out">
              <View style={styles.secondaryBtnContent}>
                <Icon name="logout" size={18} color={signOutColor} />
                <Text style={[styles.signOutLabel, { color: signOutColor }]}>Sign out</Text>
              </View>
            </PressableScale>
          </View>
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
            showDivider
          />
          <ThemeOption
            icon="nights-stay"
            label="Dark"
            description="Always dark theme"
            selected={preference === 'dark'}
            onPress={() => onSelectTheme('dark')}
            t={t}
            showDivider
          />
        </View>
        </LayoutAnimationConfig>
      </View>

      <Modal
        visible={showStatsModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowStatsModal(false)}>
        <View style={styles.modalRoot}>
          <ModalBackdrop
                        onPress={() => setShowStatsModal(false)}
          />
          <View pointerEvents="box-none" style={[styles.statsModalCenter, isSheet && styles.statsModalSheet]}>
            <View
              style={[
                styles.statsCard,
                { backgroundColor: t.card, borderColor: t.border },
                isSheet && [styles.statsSheet, { paddingBottom: Math.max(20, insets.bottom + 12) }],
              ]}>
              {isSheet ? <View style={[styles.statsGrabber, { backgroundColor: t.border }]} /> : null}
              <View style={styles.statsHeaderRow}>
                <Text style={[styles.statsTitle, { color: t.text }]}>Your statistics</Text>
                <Pressable
                  onPress={() => setShowStatsModal(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close statistics">
                  <Icon name="close" size={22} color={t.muted} />
                </Pressable>
              </View>
              {!user ? (
                <Text style={[styles.statsFootnote, { color: t.muted }]}>
                  Sign in to see statistics.
                </Text>
              ) : statsLoading ? (
                <ScrollView contentContainerStyle={styles.statsScrollContent}>
                  <StatsSkeleton />
                </ScrollView>
              ) : statsError ? (
                <Text style={[styles.statsError, { color: '#b91c1c' }]}>{statsError}</Text>
              ) : stats ? (
                <ScrollView
                  contentContainerStyle={styles.statsScrollContent}>
                  <StatsBody stats={stats} />
                </ScrollView>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {showNameEditor ? (
        <EditNameModal
          initialName={playerProfile?.name ?? ''}
          onClose={() => setShowNameEditor(false)}
          onSave={saveDisplayName}
        />
      ) : null}

      <Modal
        visible={showAvatarPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowAvatarPicker(false)}>
        <View style={styles.modalRoot}>
          <ModalBackdrop
                        onPress={() => setShowAvatarPicker(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View style={[styles.pickerCard, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.pickerTitle, { color: t.text }]}>Pick an avatar</Text>
              <View style={styles.emojiGrid} accessibilityRole="radiogroup">
                {AVATAR_EMOJIS.map((emoji) => (
                  <PressableScale
                    key={emoji}
                    pressedScale={0.92}
                    style={[
                      styles.emojiBtn,
                      { borderColor: t.border, backgroundColor: t.chipBg },
                      (savingAvatar ? pendingAvatarEmoji : playerProfile?.avatarEmoji) === emoji && {
                        borderColor: t.accentText,
                      },
                    ]}
                    onPress={() => onPickAvatar(emoji)}
                    disabled={savingAvatar}
                    accessibilityRole="radio"
                    accessibilityLabel={`Avatar ${emoji}`}
                    accessibilityState={{
                      checked: (savingAvatar ? pendingAvatarEmoji : playerProfile?.avatarEmoji) === emoji,
                      disabled: savingAvatar,
                    }}>
                    {savingAvatar && pendingAvatarEmoji === emoji ? (
                      <ActivityIndicator size="small" color={t.accentText} />
                    ) : (
                      <Text style={styles.emojiBtnText}>{emoji}</Text>
                    )}
                  </PressableScale>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ThemeOption({
  icon,
  label,
  description,
  selected,
  onPress,
  t,
  showDivider,
}: {
  icon: IconName;
  label: string;
  description: string;
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
      accessibilityLabel={`${label} theme. ${description}`}
      style={(state) => [
        styles.themeRow,
        showDivider && styles.rowDivider,
        { borderColor: t.border },
        pressBg(c, state, selected ? t.selectedBg : t.card),
      ]}>
      <View style={[styles.themeIconWrap, { backgroundColor: t.chipBg }]}>
        <Icon name={icon} size={18} color={t.text} />
      </View>
      <View style={styles.themeText}>
        <Text style={[styles.themeLabel, { color: t.text }]}>{label}</Text>
        <Text style={[styles.themeDesc, { color: t.muted }]}>{description}</Text>
      </View>
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
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 48,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
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
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
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
  profileText: {
    flex: 1,
    gap: 4,
  },
  editNameBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
    lineHeight: 26,
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  linkedTextCol: {
    flex: 1,
    gap: 2,
  },
  linkedText: {
    fontSize: 15,
    fontWeight: '600',
  },
  linkedEmail: {
    fontSize: 13,
  },
  primaryBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  signOutBtn: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  signOutLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
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
  themeLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
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
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  pickerTitle: text.modalTitle,
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
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnText: {
    fontSize: 24,
  },
  statsModalCenter: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  statsModalSheet: {
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  statsSheet: {
    maxWidth: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    paddingTop: 8,
  },
  statsGrabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4 },
  statsCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 8,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsTitle: text.modalTitle,
  statsScrollContent: {
    gap: 2,
    paddingBottom: 12,
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
