import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  acceptFriendRequest,
  lookupPlayerByRefCode,
  sendFriendRequest,
  subscribeFriends,
  subscribeIncomingFriendRequests,
  subscribeOutgoingFriendRequests,
} from '@/lib/firestore';
import type { FriendRecord, FriendRequestRecord, PlayerProfile } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';

type Tab = 'my' | 'scan';

export default function QrCodeScreen() {
  const c = useAppColors();
  const { playerProfile, user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('my');
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestRecord[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestRecord[]>([]);
  const [pendingFriend, setPendingFriend] = useState<PlayerProfile | null>(null);
  const [pendingRefCode, setPendingRefCode] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [sharingQr, setSharingQr] = useState(false);
  const [pickingGalleryImage, setPickingGalleryImage] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const shareCardRef = useRef<ViewShot | null>(null);
  const lastDismissedRef = useRef<{ code: string; at: number } | null>(null);
  const friendsRef = useRef<FriendRecord[]>([]);
  const incomingRef = useRef<FriendRequestRecord[]>([]);
  const outgoingRef = useRef<FriendRequestRecord[]>([]);
  const { tab } = useLocalSearchParams<{ tab?: string }>();

  const refCode = playerProfile?.refCode ?? '';

  useEffect(() => {
    if (!user) return;
    return subscribeFriends(user.uid, setFriends, () => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeIncomingFriendRequests(user.uid, setIncomingRequests, () => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeOutgoingFriendRequests(user.uid, setOutgoingRequests, () => {});
  }, [user]);

  friendsRef.current = friends;
  incomingRef.current = incomingRequests;
  outgoingRef.current = outgoingRequests;

  async function copyRefCode() {
    if (!refCode) return;
    const inviteMessage = [
      'Join me on Nonsense Poker.',
      `Use my referral code: ${refCode}`,
      '',
      'Open the app, go to Friends, and enter this code to send me a friend request.',
    ].join('\n');
    await Clipboard.setStringAsync(inviteMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareQrImage() {
    if (Platform.OS === 'web') {
      appAlert('Not available', 'Sharing QR images is not supported on web.');
      return;
    }
    if (!refCode || sharingQr) return;
    setSharingQr(true);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 0.95,
      });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        appAlert('Sharing unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your Nonsense code',
      });
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Could not share QR image.');
    } finally {
      setSharingQr(false);
    }
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
          appAlert('Permission needed', 'Camera access is required to scan QR codes.');
          setActiveTab('my');
          return;
        }
        setActiveTab('scan');
      })();
      return;
    }

    if (tab === 'my') setActiveTab('my');
  }, [tab, ensureCamera]);

  async function handlePickQrFromGallery() {
    if (Platform.OS === 'web') {
      appAlert('Not available', 'Scanning a QR from a photo is not supported on web.');
      return;
    }
    if (!user || pickingGalleryImage) return;
    setPickingGalleryImage(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        appAlert('Permission needed', 'Photo library access is needed to scan a QR code from an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]?.uri) return;

      const barcodes = await scanFromURLAsync(result.assets[0].uri, ['qr']);
      if (!barcodes.length) {
        appAlert(
          'No QR code found',
          'Could not find a QR code in that image. Try a clearer photo with the code visible.',
        );
        return;
      }
      await handleBarCodeScanned({ data: barcodes[0].data });
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Could not read that image.');
    } finally {
      setPickingGalleryImage(false);
    }
  }

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
      appAlert('Invalid QR', 'This QR code does not contain a valid ref code.', [
        { text: 'OK', onPress: () => { scanLock.current = false; } },
      ]);
      return;
    }
    if (code === playerProfile?.refCode) {
      appAlert('Oops', "That's your own code!", [
        { text: 'OK', onPress: () => { scanLock.current = false; } },
      ]);
      return;
    }

    let shouldReleaseLock = true;
    try {
      const found = await lookupPlayerByRefCode(code);
      if (!found) {
        appAlert('Not found', 'No player found with that code.');
        return;
      }
      if (friendsRef.current.some((f) => f.playerId === found.id)) {
        appAlert('Already friends', `You're already friends with ${found.name}.`);
        return;
      }

      const incoming = incomingRef.current.some((r) => r.playerId === found.id);
      if (incoming) {
        appAlert(`${found.name} invited you`, 'Accept their friend request?', [
          { text: 'Not now', onPress: () => { scanLock.current = false; } },
          {
            text: 'Accept',
            onPress: async () => {
              try {
                await acceptFriendRequest(user.uid, found.id);
                appAlert('Added!', `${found.name} is now your friend.`);
                router.replace('/(tabs)/friends');
              } catch (e) {
                appAlert('Error', e instanceof Error ? e.message : 'Failed to accept.');
              } finally {
                scanLock.current = false;
              }
            },
          },
        ]);
        return;
      }

      if (outgoingRef.current.some((r) => r.playerId === found.id)) {
        appAlert('Request pending', `You already sent a request to ${found.name}.`, [
          { text: 'OK', onPress: () => { scanLock.current = false; } },
        ]);
        return;
      }

      // Pause scanning and ask for confirmation before sending a request.
      setPendingFriend(found);
      setPendingRefCode(code);
      shouldReleaseLock = false;
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to add friend.');
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
      const result = await sendFriendRequest(user.uid, pendingFriend);
      if (!result.ok) {
        if (result.reason === 'already_friends') {
          appAlert('Already friends', `You're already friends with ${pendingFriend.name}.`);
        } else if (result.reason === 'already_sent') {
          appAlert('Request pending', `You already sent a request to ${pendingFriend.name}.`);
        } else {
          appAlert('Oops', "That's your own code!");
        }
        dismissAddFriendModal();
        return;
      }
      if (result.outcome === 'now_friends') {
        appAlert('Added!', `You and ${pendingFriend.name} are now friends.`);
      } else {
        appAlert('Request sent', `${pendingFriend.name} will see your request.`);
      }
      router.replace('/(tabs)/friends');
      dismissAddFriendModal();
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to send request.');
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
              appAlert('Permission needed', 'Camera access is required to scan QR codes.');
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
          <ViewShot
            ref={shareCardRef}
            options={{ format: 'png', quality: 0.95 }}
            style={styles.shareShot}>
            <View style={[styles.shareExportCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[styles.nameRow, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
                <View style={[styles.avatarCircle, { backgroundColor: c.avatarBg }]}>
                  <Text style={[styles.avatarEmoji, { color: c.text }]}>
                    {playerProfile?.avatarEmoji ?? '🙂'}
                  </Text>
                </View>
                <View style={styles.nameText}>
                  <Text style={[styles.name, { color: c.text }]}>{playerProfile?.name ?? 'Guest'}</Text>
                  <Text style={[styles.sub, { color: c.textMuted }]}>Nonsense player</Text>
                </View>
              </View>

              <View style={styles.qrCardExport}>
                {refCode ? (
                  <View style={[styles.qrInner, { backgroundColor: c.qrBg }]}>
                    <QRCode value={refCode} size={210} backgroundColor={c.qrBg} color={c.qrFg} />
                  </View>
                ) : (
                  <Text style={[styles.qrPlaceholder, { color: c.textMuted }]}>
                    Set your display name to generate a referral code.
                  </Text>
                )}

                <Text style={[styles.code, styles.codeExport, { color: c.text }]}>
                  {refCode || '------'}
                </Text>
                <Text style={[styles.shareCardFooter, { color: c.textHint }]}>
                  Scan in Nonsense to send a friend request
                </Text>
              </View>
            </View>
          </ViewShot>

          <View style={styles.shareToolbar}>
            <Pressable
              style={[styles.toolbarBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}
              onPress={copyRefCode}
              disabled={!refCode}
              accessibilityRole="button"
              accessibilityLabel="Copy referral code">
              <MaterialIcons
                name={copied ? 'check' : 'content-copy'}
                size={20}
                color={copied ? c.profit : c.textMuted}
              />
            </Pressable>
            <Pressable
              style={[
                styles.toolbarBtnPrimary,
                { backgroundColor: c.accent, borderColor: c.accentBorder },
                (!refCode || sharingQr) && styles.disabled,
              ]}
              onPress={handleShareQrImage}
              disabled={!refCode || sharingQr}
              accessibilityRole="button"
              accessibilityLabel="Share QR code as image">
              <MaterialIcons name="share" size={20} color="#fff" />
              <Text style={styles.toolbarBtnPrimaryLabel}>
                {sharingQr ? 'Sharing…' : 'Share'}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.note, { color: c.textHint }]}>
            Your QR code is private. If someone scans it, they can send you a friend request.
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
          {Platform.OS !== 'web' && (
            <Pressable
              style={[
                styles.scanGalleryBtn,
                { borderColor: c.border, backgroundColor: c.cardAlt },
                pickingGalleryImage && styles.disabled,
              ]}
              onPress={handlePickQrFromGallery}
              disabled={pickingGalleryImage}
              accessibilityRole="button"
              accessibilityLabel="Choose QR code image from gallery">
              {pickingGalleryImage ? (
                <ActivityIndicator size="small" color={c.blue} />
              ) : (
                <MaterialIcons name="photo-library" size={22} color={c.blue} />
              )}
              <Text style={[styles.scanGalleryBtnLabel, { color: c.text }]}>
                {pickingGalleryImage ? 'Reading…' : 'Choose from gallery'}
              </Text>
            </Pressable>
          )}
          <Text style={[styles.scanHint, { color: c.textMuted }]}>
            Scan a friend&apos;s QR code to send them a friend request.
            {Platform.OS !== 'web' ? ' Or pick a saved photo of their code.' : ''}
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
              <Text style={[styles.confirmTitle, { color: c.text }]}>Send friend request?</Text>
              <Text style={[styles.confirmSub, { color: c.textMuted }]}>
                {pendingFriend ? `${pendingFriend.name} will get a request to connect.` : ''}
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
                  <Text style={styles.confirmLabel}>{addingFriend ? 'Sending...' : 'Send request'}</Text>
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
  shareShot: {
    borderRadius: 18,
  },
  shareExportCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    gap: 0,
  },
  qrCardExport: {
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  codeExport: {
    textAlign: 'center',
    marginTop: 0,
  },
  shareCardFooter: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  shareToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  toolbarBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
  },
  toolbarBtnPrimaryLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
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
  qrInner: {
    borderRadius: 16,
    padding: 12,
  },
  qrPlaceholder: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 32,
  },
  code: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
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
    backgroundColor: 'transparent',
  },
  scanHint: {
    textAlign: 'center',
    fontSize: 12,
    paddingBottom: 40,
  },
  scanGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
  },
  scanGalleryBtnLabel: {
    fontSize: 15,
    fontWeight: '800',
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

