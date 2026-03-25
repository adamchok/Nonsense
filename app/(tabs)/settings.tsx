import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { useThemePreference } from '@/lib/theme-context';

const AVATAR_EMOJIS = [
  '🙂', '😀', '😎', '🤠', '🧠', '🦈', '🐯', '🦁', '🐸', '🐻',
  '🃏', '♠️', '♥️', '♦️', '♣️', '🎲', '🎯', '🏆', '🔥', '⚡',
  '🍀', '🌙', '⭐', '☀️', '🌊', '🍕', '🍔', '🍩', '🎧', '🎮',
];

export default function SettingsScreen() {
  const router = useRouter();
  const { playerProfile, saveAvatarEmoji } = useAuth();
  const { preference, resolvedColorScheme, setPreference } = useThemePreference();
  const isDark = resolvedColorScheme === 'dark';
  const t = isDark ? theme.dark : theme.light;
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [pendingAvatarEmoji, setPendingAvatarEmoji] = useState<string | null>(null);

  async function onPickAvatar(emoji: string) {
    if (savingAvatar) return;
    try {
      setPendingAvatarEmoji(emoji);
      setSavingAvatar(true);
      await saveAvatarEmoji(emoji);
      setShowAvatarPicker(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save avatar.');
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
        <Pressable
          style={[styles.secondaryBtn, { borderColor: t.card, backgroundColor: t.avatarBg }]}
          onPress={() => router.push('../locations')}>
          <View style={styles.secondaryBtnContent}>
            <MaterialIcons name="location-on" size={18} color={t.text} />
            <Text style={[styles.secondaryBtnLabel, { color: t.text }]}>Locations</Text>
          </View>
        </Pressable>
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
          onPress={() => setPreference('system')}
          t={t}
        />
        <ThemeOption
          icon="wb-sunny"
          label="Light"
          description="Always light theme"
          selected={preference === 'light'}
          onPress={() => setPreference('light')}
          t={t}
        />
        <ThemeOption
          icon="nights-stay"
          label="Dark"
          description="Always dark theme"
          selected={preference === 'dark'}
          onPress={() => setPreference('dark')}
          t={t}
        />
      </View>

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
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
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
});
