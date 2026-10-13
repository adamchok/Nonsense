import { ModalShell } from '@/components/session/modal-shell';
import { PlayerAvatar } from '@/components/player-avatar';
import { faceValue, isFaceAvatar, randomFaceSeeds } from '@/lib/avatar-face';
import { appAlert } from '@/lib/app-alert';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors, type AppColors } from '@/lib/app-theme';
import { pressBg, text } from '@/lib/ui';
import { useAuth } from '@/lib/auth-context';
import { useThemePreference } from '@/lib/theme-context';
import { Icon, type IconName } from '@/components/icon';
import { GoogleLogo } from '@/components/google-button';
import { EnvelopeSimpleIcon } from 'phosphor-react-native/src/icons/EnvelopeSimple';
import { SegmentedTabs, type SegmentedTab } from '@/components/segmented-tabs';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { userMessage } from '@/lib/user-message';
import { EditNameModal } from '@/components/edit-name-modal';
import { PressableScale } from '@/components/motion';


const FACE_BATCH = 30;
const FACE_TILE = 56;

type ThemeKey = 'system' | 'light' | 'dark';
const THEME_TABS: readonly SegmentedTab<ThemeKey>[] = [
  { key: 'system', label: 'System', icon: 'phone-iphone' },
  { key: 'light', label: 'Light', icon: 'wb-sunny' },
  { key: 'dark', label: 'Dark', icon: 'nights-stay' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { playerProfile, saveAvatarEmoji, saveDisplayName, isLinked, linkedEmail, email, hasPassword, signOutUser } =
    useAuth();
  const c = useAppColors();
  const layout = usePageLayout(40);
  const { preference, setPreference } = useThemePreference();
  const t = settingsTheme(c);
  const signInMethodLabel = isLinked ? 'Signed in with Google' : 'Signed in with email';
  const accountEmail = (isLinked ? linkedEmail : null) ?? email;
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [faceSeeds, setFaceSeeds] = useState(() => randomFaceSeeds(FACE_BATCH));
  const currentFace = isFaceAvatar(playerProfile?.avatarEmoji) ? playerProfile.avatarEmoji : null;
  const pickerFaces = [
    ...(currentFace ? [currentFace] : []),
    ...faceSeeds.map(faceValue).filter((f) => f !== currentFace),
  ].slice(0, FACE_BATCH);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [pendingAvatarEmoji, setPendingAvatarEmoji] = useState<string | null>(null);

  function onSelectTheme(p: ThemeKey) {
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
          Account
        </Text>
        <View style={[styles.listCard, { backgroundColor: t.card, borderColor: t.border }]}>
          <NavRow icon="location-on" label="Saved locations" onPress={() => router.push('../locations')} t={t} />
          {hasPassword ? (
            <NavRow
              icon="lock"
              label="Change password"
              onPress={() => router.push('/change-password')}
              t={t}
              showDivider
            />
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.cardLabel, { color: t.muted }]} accessibilityRole="header">
          Appearance
        </Text>
        <SegmentedTabs tabs={THEME_TABS} value={preference} onChange={onSelectTheme} variant="radio" />
      </View>

      <PressableScale
        style={[styles.signOutBtn, { borderColor: t.border, backgroundColor: t.card }]}
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out">
        <Icon name="logout" size={18} color={c.loss} />
        <Text style={[styles.signOutLabel, { color: c.loss }]}>Sign out</Text>
      </PressableScale>

      <PressableScale
        style={styles.deleteAccountBtn}
        onPress={() => router.push('/delete-account')}
        accessibilityRole="button"
        accessibilityLabel="Delete account">
        <Text style={[styles.deleteAccountLabel, { color: t.muted }]}>Delete account</Text>
      </PressableScale>


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
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Shuffle avatars"
            style={[styles.shuffleBtn, { borderColor: t.border, backgroundColor: t.chipBg }]}>
            <Icon name="refresh" size={14} color={t.accentText} />
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
    marginVertical: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  displayNameText: {
    flexShrink: 1,
  },
  displayName: text.title,
  deleteAccountBtn: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  deleteAccountLabel: {
    ...text.label,
    textDecorationLine: 'underline',
  },
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
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  shuffleText: { fontSize: 13, fontWeight: '600' },
  modalScroll: {
    flexShrink: 1,
  },
});
