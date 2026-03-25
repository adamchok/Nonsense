import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { addFriend, lookupPlayerByRefCode, subscribeFriends } from '@/lib/firestore';
import type { FriendRecord, PlayerProfile } from '@/types';

type Tab = 'my' | 'scan';

export default function QrCodeScreen() {
  const c = useAppColors();
  const { playerProfile, user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('my');
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [pendingFriend, setPendingFriend] = useState<PlayerProfile | null>(null);
  const [pendingRefCode, setPendingRefCode] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const lastDismissedRef = useRef<{ code: string; at: number } | null>(null);
  const { tab } = useLocalSearchParams<{ tab?: string }>();

  const refCode = playerProfile?.refCode ?? '';

  useEffect(() => {
    if (!user) return;
    return subscribeFriends(user.uid, setFriends, () => {});
  }, [user]);

  async function copyRefCode() {
    if (!refCode) return;
    await Clipboard.setStringAsync(refCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const ensureCamera = useCallback(async () => {
    if (permission?.granted) return true;
    const result = await requestPermission();
    return result.granted;
  }, [permission?.granted, requestPermission]);

  useEffect(() => {
    if (tab === 'scan') {
      (async () => {
        const ok = await ensureCamera();
        if (!ok) {
          Alert.alert('Permission needed', 'Camera access is required to scan QR codes.');
          setActiveTab('my');
          return;
        }
        setActiveTab('scan');
      })();
      return;
    }

    if (tab === 'my') setActiveTab('my');
  }, [tab, ensureCamera]);

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanLock.current || !user) return;
    scanLock.current = true;
    const code = data.trim().toUpperCase();

    // Prevent the same visible QR code from immediately re-triggering after a cancel.
    if (
      lastDismissedRef.current?.code === code &&
      Date.now() - lastDismissedRef.current.at < 2500
    ) {
      scanLock.current = false;
      return;
    }

    if (code.length !== 6) {
      Alert.alert('Invalid QR', 'This QR code does not contain a valid ref code.', [
        { text: 'OK', onPress: () => { scanLock.current = false; } },
      ]);
      return;
    }
    if (code === playerProfile?.refCode) {
      Alert.alert('Oops', "That's your own code!", [
        { text: 'OK', onPress: () => { scanLock.current = false; } },
      ]);
      return;
    }

    let shouldReleaseLock = true;
    try {
      const found = await lookupPlayerByRefCode(code);
      if (!found) {
        Alert.alert('Not found', 'No player found with that code.');
        return;
      }
      if (friends.some((f) => f.playerId === found.id)) {
        Alert.alert('Already friends', `You're already friends with ${found.name}.`);
        return;
      }

      // Pause scanning and ask for confirmation before mutating friend state.
      setPendingFriend(found);
      setPendingRefCode(code);
      shouldReleaseLock = false;
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add friend.');
    } finally {
      if (shouldReleaseLock) scanLock.current = false;
    }
  }

  function dismissAddFriendModal() {
    if (pendingRefCode) lastDismissedRef.current = { code: pendingRefCode, at: Date.now() };
    setPendingFriend(null);
    setPendingRefCode(null);
    setAddingFriend(false);
    scanLock.current = false;
  }

  async function confirmAddFriend() {
    if (!user || !pendingFriend) return;
    setAddingFriend(true);
    try {
      await addFriend(user.uid, pendingFriend);
      Alert.alert('Added!', `${pendingFriend.name} has been added to your friends.`);
      router.replace('/(tabs)/friends');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add friend.');
      // Keep them on the scan screen so they can try again.
      dismissAddFriendModal();
    } finally {
      setAddingFriend(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ title: 'QR code', headerBackTitle: 'Back' }} />

      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tabBtn, activeTab === 'my' && { borderColor: c.borderAccent }]}
          onPress={() => setActiveTab('my')}>
          <Text style={[styles.tabText, { color: activeTab === 'my' ? c.text : c.textMuted }]}>
            MY CODE
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'scan' && { borderColor: c.borderAccent }]}
          onPress={async () => {
            const ok = await ensureCamera();
            if (!ok) {
              Alert.alert('Permission needed', 'Camera access is required to scan QR codes.');
              return;
            }
            scanLock.current = false;
            setActiveTab('scan');
          }}>
          <Text style={[styles.tabText, { color: activeTab === 'scan' ? c.text : c.textMuted }]}>
            SCAN CODE
          </Text>
        </Pressable>
      </View>

      {activeTab === 'my' ? (
        <View style={styles.myRoot}>
          <View style={[styles.nameRow, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.avatarCircle, { backgroundColor: c.avatarBg }]}>
              <Text style={[styles.avatarEmoji, { color: c.text }]}>{playerProfile?.avatarEmoji ?? '🙂'}</Text>
            </View>
            <View style={styles.nameText}>
              <Text style={[styles.name, { color: c.text }]}>{playerProfile?.name ?? 'Guest'}</Text>
              <Text style={[styles.sub, { color: c.textMuted }]}>Nonsense player</Text>
            </View>
          </View>

          <View style={[styles.qrCard, { backgroundColor: c.card, borderColor: c.border }]}>
            {refCode ? (
              <View style={[styles.qrInner, { backgroundColor: c.qrBg }]}>
                <QRCode value={refCode} size={210} backgroundColor={c.qrBg} color={c.qrFg} />
              </View>
            ) : (
              <Text style={[styles.qrPlaceholder, { color: c.textMuted }]}>
                Set your display name to generate a referral code.
              </Text>
            )}

            <View style={styles.codeRow}>
              <Text style={[styles.code, { color: c.text }]}>{refCode || '------'}</Text>
              <Pressable
                style={[styles.copyBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}
                onPress={copyRefCode}
                disabled={!refCode}
                accessibilityRole="button"
                accessibilityLabel="Copy referral code">
                <MaterialIcons
                  name={copied ? 'check' : 'content-copy'}
                  size={18}
                  color={copied ? c.profit : c.textMuted}
                />
              </Pressable>
            </View>
          </View>

          <Text style={[styles.note, { color: c.textHint }]}>
            Your QR code is private. If you share it with someone, they can scan it to add you.
          </Text>
        </View>
      ) : (
        <View style={styles.scanRoot}>
          <View style={[styles.scanCard, { borderColor: c.border }]}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarCodeScanned}
            />
            <View style={styles.scanOverlay}>
              <View style={[styles.scanFrame, { borderColor: c.blue }]} />
            </View>
          </View>
          <Text style={[styles.scanHint, { color: c.textMuted }]}>
            Scan a friend&apos;s QR code to add them instantly.
          </Text>
        </View>
      )}

      <Modal
        visible={pendingFriend != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissAddFriendModal}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={dismissAddFriendModal}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View style={[styles.confirmCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.confirmTitle, { color: c.text }]}>Add this friend?</Text>
              <Text style={[styles.confirmSub, { color: c.textMuted }]}>
                {pendingFriend ? `${pendingFriend.name} will be added to your friends.` : ''}
              </Text>

              {pendingFriend && (
                <View style={styles.friendPreview}>
                  <View style={[styles.previewAvatarCircle, { backgroundColor: c.avatarBg }]}>
                    <Text style={[styles.previewAvatarEmoji, { color: c.text }]}>
                      {pendingFriend.avatarEmoji ?? '🙂'}
                    </Text>
                  </View>
                  <Text style={[styles.previewName, { color: c.text }]}>{pendingFriend.name}</Text>
                </View>
              )}

              <View style={styles.confirmActions}>
                <Pressable
                  style={[styles.cancelBtn, { borderColor: c.border }]}
                  onPress={dismissAddFriendModal}
                  disabled={addingFriend}>
                  <Text style={[styles.cancelLabel, { color: c.textHint }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: c.accent, borderColor: c.accentBorder },
                    (addingFriend || !pendingFriend) && styles.disabled,
                  ]}
                  onPress={confirmAddFriend}
                  disabled={addingFriend || !pendingFriend}>
                  <Text style={styles.confirmLabel}>{addingFriend ? 'Adding...' : 'Add Friend'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 10,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  myRoot: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 14,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 18,
    fontWeight: '700',
  },
  nameText: {
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
  },
  sub: {
    fontSize: 12,
  },
  qrCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  qrInner: {
    borderRadius: 16,
    padding: 12,
  },
  qrPlaceholder: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 32,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  code: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
  },
  copyBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 10,
    marginTop: 2,
  },
  scanRoot: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 12,
  },
  scanCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    minHeight: 360,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  scanHint: {
    textAlign: 'center',
    fontSize: 12,
    paddingBottom: 40,
  },

  modalRoot: {
    flex: 1,
  },
  modalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  confirmSub: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  friendPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  previewAvatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarEmoji: {
    fontSize: 22,
    fontWeight: '700',
  },
  previewName: {
    fontSize: 16,
    fontWeight: '800',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelLabel: {
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmLabel: {
    fontWeight: '800',
    fontSize: 14,
    color: '#fff',
  },
  disabled: {
    opacity: 0.5,
  },
});

