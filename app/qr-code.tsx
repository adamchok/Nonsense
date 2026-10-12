import { ModalShell } from '@/components/session/modal-shell';
import { PlayerAvatar } from '@/components/player-avatar';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  acceptFriendRequest,
  ensureRefCode,
  lookupPlayerByRefCode,
  sendFriendRequest,
  subscribeFriends,
  subscribeIncomingFriendRequests,
  subscribeOutgoingFriendRequests,
} from '@/lib/firestore';
import type { FriendRecord, FriendRequestRecord, PlayerProfile } from '@/types';
import { Icon } from '@/components/icon';
import { SegmentedTabs, type SegmentedTab } from '@/components/segmented-tabs';
import { isShareCancel, shareViewAsImage } from '@/lib/share-image';
import { ScaleFadeIn } from '@/components/celebration';
import { Animated, PressableScale, fadeIn } from '@/components/motion';
import { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { userMessage } from '@/lib/user-message';

type Tab = 'my' | 'scan';

const QR_TABS: readonly SegmentedTab<Tab>[] = [
  { key: 'my', label: 'My code', icon: 'qr-code' },
  { key: 'scan', label: 'Scan code', icon: 'qr-code-scanner' },
];

const iconSwapEntering = ZoomIn.duration(180).reduceMotion(ReduceMotion.System);


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
  const shareCardRef = useRef<View>(null);
  const lastDismissedRef = useRef<{ code: string; at: number } | null>(null);
  const friendsRef = useRef<FriendRecord[]>([]);
  const incomingRef = useRef<FriendRequestRecord[]>([]);
  const outgoingRef = useRef<FriendRequestRecord[]>([]);
  const { tab } = useLocalSearchParams<{ tab?: string }>();

  const [backfilledCode, setBackfilledCode] = useState<string | null>(null);
  const [codeAttempt, setCodeAttempt] = useState(0);
  const refCode = playerProfile?.refCode ?? backfilledCode ?? '';
  const needsCodeBackfill = !!playerProfile?.id && !playerProfile?.refCode;
  const [codeStatus, setCodeStatus] = useState<'idle' | 'loading' | 'error'>(() =>
    needsCodeBackfill ? 'loading' : 'idle',
  );
  const codeRequestKey = `${playerProfile?.id}|${playerProfile?.refCode}|${codeAttempt}`;
  const [prevCodeRequestKey, setPrevCodeRequestKey] = useState(codeRequestKey);
  if (prevCodeRequestKey !== codeRequestKey) {
    setPrevCodeRequestKey(codeRequestKey);
    if (needsCodeBackfill) setCodeStatus('loading');
  }

  useEffect(() => {
    const uid = playerProfile?.id;
    if (!uid || playerProfile?.refCode) return;
    let cancelled = false;
    ensureRefCode(uid)
      .then((code) => {
        if (cancelled) return;
        setBackfilledCode(code);
        setCodeStatus('idle');
      })
      .catch(() => {
        if (!cancelled) setCodeStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [playerProfile?.id, playerProfile?.refCode, codeAttempt]);

  useEffect(() => {
    if (!user) return;
    return subscribeFriends(user.uid, setFriends, (e) => console.error('Friends subscription error:', e));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeIncomingFriendRequests(user.uid, setIncomingRequests, (e) =>
      console.error('Incoming friend requests error:', e),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeOutgoingFriendRequests(user.uid, setOutgoingRequests, (e) =>
      console.error('Outgoing friend requests error:', e),
    );
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
    try {
      await Clipboard.setStringAsync(inviteMessage);
    } catch (e) {
      appAlert('Copy failed', userMessage(e, `Could not copy. Your code is ${refCode}.`));
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareQrImage() {
    if (!refCode || sharingQr) return;
    setSharingQr(true);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      await shareViewAsImage(shareCardRef, {
        fileName: `nonsense-code-${refCode.toLowerCase()}.png`,
        title: 'Share your Nonsense code',
      });
    } catch (e) {
      if (!isShareCancel(e)) appAlert('Share failed', userMessage(e, 'Could not share QR image.'));
    } finally {
      setSharingQr(false);
    }
  }


  const ensureCamera = useCallback(async () => {
    if (permission?.granted) return true;
    const result = await requestPermission();
    return result.granted;
  }, [permission?.granted, requestPermission]);

  const [prevTabParam, setPrevTabParam] = useState(tab);
  if (prevTabParam !== tab) {
    setPrevTabParam(tab);
    if (tab === 'my') setActiveTab('my');
  }

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
    }
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
      appAlert('Error', userMessage(e, 'Could not read that image.'));
    } finally {
      setPickingGalleryImage(false);
    }
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanLock.current || !user) return;
    scanLock.current = true;
    const code = data.trim().toUpperCase();

    if (lastDismissedRef.current?.code === code && Date.now() - lastDismissedRef.current.at < 2500) {
      scanLock.current = false;
      return;
    }

    const releaseWithCooldown = () => {
      lastDismissedRef.current = { code, at: Date.now() };
      scanLock.current = false;
    };
    const alertThenRelease = (title: string, message: string) => {
      appAlert(title, message, [{ text: 'OK', onPress: releaseWithCooldown }]);
    };

    if (code.length !== 6) {
      alertThenRelease('Invalid QR', 'This QR code does not contain a valid ref code.');
      return;
    }
    if (code === playerProfile?.refCode) {
      alertThenRelease('Oops', "That's your own code!");
      return;
    }

    try {
      const found = await lookupPlayerByRefCode(code);
      if (!found) {
        alertThenRelease('Not found', 'No player found with that code.');
        return;
      }
      if (friendsRef.current.some((f) => f.playerId === found.id)) {
        alertThenRelease('Already friends', `You're already friends with ${found.name}.`);
        return;
      }

      const incoming = incomingRef.current.some((r) => r.playerId === found.id);
      if (incoming) {
        appAlert(`${found.name} invited you`, 'Accept their friend request?', [
          { text: 'Not now', onPress: releaseWithCooldown },
          {
            text: 'Accept',
            onPress: async () => {
              try {
                await acceptFriendRequest(user.uid, found.id);
                appAlert('Added!', `${found.name} is now your friend.`);
                router.replace('/(tabs)/friends');
              } catch (e) {
                appAlert('Error', userMessage(e, 'Failed to accept.'));
              } finally {
                releaseWithCooldown();
              }
            },
          },
        ]);
        return;
      }

      if (outgoingRef.current.some((r) => r.playerId === found.id)) {
        alertThenRelease('Request pending', `You already sent a request to ${found.name}.`);
        return;
      }

      setPendingFriend(found);
      setPendingRefCode(code);
    } catch (e) {
      alertThenRelease('Error', userMessage(e, 'Failed to add friend.'));
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
      appAlert('Error', userMessage(e, 'Failed to send request.'));
      dismissAddFriendModal();
    } finally {
      setAddingFriend(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ title: 'QR code', headerBackTitle: 'Back' }} />

      <View style={styles.tabsWrap}>
        <SegmentedTabs
          tabs={QR_TABS}
          value={activeTab}
          onChange={async (tab) => {
            if (tab === 'my') {
              setActiveTab('my');
              return;
            }
            const ok = await ensureCamera();
            if (!ok) {
              appAlert('Permission needed', 'Camera access is required to scan QR codes.');
              return;
            }
            scanLock.current = false;
            setActiveTab('scan');
          }}
        />
      </View>

      {activeTab === 'my' ? (
        <Animated.View key="my" entering={fadeIn} style={styles.myRoot}>
          <ScaleFadeIn fromScale={0.96}>
            <View ref={shareCardRef} collapsable={false} style={styles.shareShot}>
              <View style={[styles.shareExportCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={[styles.nameRow, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
                  <View style={[styles.avatarCircle, { backgroundColor: c.avatarBg }]}>
                    <PlayerAvatar value={playerProfile?.avatarEmoji} size={38} />
                  </View>
                  <View style={styles.nameText}>
                    <Text style={[styles.name, { color: c.text }]}>{playerProfile?.name ?? 'Guest'}</Text>
                  </View>
                </View>

                <View style={styles.qrCardExport}>
                  {refCode ? (
                    <View style={[styles.qrInner, { backgroundColor: c.qrBg }]}>
                      <QRCode value={refCode} size={210} backgroundColor={c.qrBg} color={c.qrFg} />
                    </View>
                  ) : (
                    <View style={styles.qrPlaceholderBox}>
                      {!playerProfile ? (
                        <>
                          <Text style={[styles.qrPlaceholder, { color: c.textMuted }]}>
                            Set your display name to generate a referral code.
                          </Text>
                          <Pressable
                            onPress={() => router.push('/name')}
                            accessibilityRole="button"
                            style={[styles.qrRetry, { borderColor: c.inputBorder }]}>
                            <Text style={[styles.qrRetryLabel, { color: c.text }]}>Set display name</Text>
                          </Pressable>
                        </>
                      ) : codeStatus === 'error' ? (
                        <>
                          <Text style={[styles.qrPlaceholder, { color: c.textMuted }]}>
                            Couldn&apos;t create your code.
                          </Text>
                          <Pressable
                            onPress={() => setCodeAttempt((n) => n + 1)}
                            accessibilityRole="button"
                            style={[styles.qrRetry, { borderColor: c.inputBorder }]}>
                            <Text style={[styles.qrRetryLabel, { color: c.text }]}>Try again</Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <ActivityIndicator color={c.textMuted} />
                          <Text style={[styles.qrPlaceholder, { color: c.textMuted }]}>Creating your code…</Text>
                        </>
                      )}
                    </View>
                  )}

                  <View style={styles.codeRow}>
                    <Text style={[styles.code, styles.codeExport, { color: c.text }]}>{refCode || '------'}</Text>
                    {refCode && !(sharingQr && Platform.OS !== 'web') ? (
                      <PressableScale
                        {...({ dataSet: { html2canvasIgnore: 'true' } } as object)}
                        pressedScale={0.92}
                        style={[styles.copyBtn, { borderColor: c.inputBorder, backgroundColor: c.card }]}
                        onPress={copyRefCode}
                        accessibilityRole="button"
                        accessibilityLabel={copied ? 'Referral code copied' : 'Copy referral code'}>
                        <Animated.View key={copied ? 'check' : 'copy'} entering={iconSwapEntering}>
                          <Icon name={copied ? 'check' : 'content-copy'} size={18} color={copied ? c.profit : c.text} />
                        </Animated.View>
                      </PressableScale>
                    ) : null}
                  </View>
                  <Text style={[styles.shareCardFooter, { color: c.textHint }]}>
                    Scan in Nonsense to send a friend request
                  </Text>
                </View>
              </View>
            </View>
          </ScaleFadeIn>

          <View style={styles.shareToolbar}>
            <PressableScale
                style={[
                  styles.toolbarBtnPrimary,
                  { backgroundColor: c.accent, borderColor: c.accentBorder },
                  (!refCode || sharingQr) && styles.disabled,
                ]}
                onPress={handleShareQrImage}
                disabled={!refCode || sharingQr}
                accessibilityRole="button"
                accessibilityLabel="Share QR code as image">
                {sharingQr ? (
                  <ActivityIndicator size="small" color={c.onAccent} />
                ) : (
                  <Icon name="share" size={20} color={c.onAccent} />
                )}
                <Text style={[styles.toolbarBtnPrimaryLabel, { color: c.onAccent }]}>
                  {sharingQr ? 'Sharing…' : 'Share'}
                </Text>
              </PressableScale>
          </View>

        </Animated.View>
      ) : (
        <Animated.View key="scan" entering={fadeIn} style={styles.scanRoot}>
          <View style={[styles.scanCard, { borderColor: c.border }]}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarCodeScanned}
              onMountError={() => {
                appAlert('Camera unavailable', 'Could not start the camera on this device.');
                setActiveTab('my');
              }}
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
                <Icon name="photo-library" size={22} color={c.blue} />
              )}
              <Text style={[styles.scanGalleryBtnLabel, { color: c.text }]}>
                {pickingGalleryImage ? 'Reading…' : 'Choose from gallery'}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      <ModalShell
        visible={pendingFriend != null}
        onClose={() => {
          if (!addingFriend) dismissAddFriendModal();
        }}
        title="Send friend request?"
        titleIcon={{ name: 'person-add', color: c.textMuted }}
        avoidKeyboard={false}
        primary={{
          label: 'Send request',
          onPress: confirmAddFriend,
          busy: addingFriend,
          disabled: !pendingFriend,
          icon: 'person-add',
        }}>
        <Text style={[styles.confirmSub, { color: c.textMuted }]}>
          {pendingFriend ? `${pendingFriend.name} will get a request to connect.` : ''}
        </Text>
        {pendingFriend && (
          <View style={styles.friendPreview}>
            <View style={[styles.previewAvatarCircle, { backgroundColor: c.avatarBg }]}>
              <PlayerAvatar value={pendingFriend.avatarEmoji} size={44} />
            </View>
            <Text style={[styles.previewName, { color: c.text }]}>{pendingFriend.name}</Text>
          </View>
        )}
      </ModalShell>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 10,
  },
  tabsWrap: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  myRoot: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  shareShot: {
    borderRadius: 14,
  },
  shareExportCard: {
    borderWidth: 1,
    borderRadius: 14,
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
    fontSize: 12,
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
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    borderRadius: 14,
    borderWidth: 1,
  },
  toolbarBtnPrimaryLabel: {
    fontWeight: '600',
    fontSize: 15,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  sub: {
    fontSize: 12,
  },
  qrInner: {
    borderRadius: 16,
    padding: 12,
  },
  qrPlaceholderBox: {
    alignItems: 'center',
    gap: 12,
  },
  qrRetry: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
  },
  qrRetryLabel: {
    fontSize: 14,
    fontWeight: '600',
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
  scanRoot: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  scanCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 360,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFill,
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
  scanGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  scanGalleryBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },

  confirmSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  friendPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  previewAvatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
