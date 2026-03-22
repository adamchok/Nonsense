import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  addFriend,
  getFriendLeaderboard,
  lookupPlayerByRefCode,
  removeFriend,
  subscribeFriends,
} from '@/lib/firestore';
import type { FriendRecord } from '@/types';

type LeaderboardEntry = { playerId: string; name: string; totalProfit: number };

export default function FriendsScreen() {
  const c = useAppColors();
  const { user, playerProfile } = useAuth();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refCodeInput, setRefCodeInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);

  useEffect(() => {
    if (!user) return;
    return subscribeFriends(user.uid, setFriends, (e) =>
      console.error('Friends subscription error:', e)
    );
  }, [user]);

  useEffect(() => {
    if (!user || friends.length === 0) {
      setLeaderboard([]);
      return;
    }
    let cancelled = false;
    setLbLoading(true);
    getFriendLeaderboard(user.uid)
      .then((lb) => {
        if (!cancelled) setLeaderboard(lb);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, friends]);

  async function handleCopyCode() {
    if (!playerProfile?.refCode) return;
    await Clipboard.setStringAsync(playerProfile.refCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleAddFriend() {
    if (!user || !refCodeInput.trim()) return;
    const code = refCodeInput.trim().toUpperCase();

    if (code === playerProfile?.refCode) {
      Alert.alert('Oops', "That's your own code!");
      return;
    }

    const existing = friends.find(
      (f) => f.playerId === code || f.name.toUpperCase() === code
    );
    if (existing) {
      Alert.alert('Already friends', `You're already friends with ${existing.name}.`);
      return;
    }

    try {
      setAdding(true);
      const found = await lookupPlayerByRefCode(code);
      if (!found) {
        Alert.alert('Not found', 'No player found with that code.');
        return;
      }
      if (friends.some((f) => f.playerId === found.id)) {
        Alert.alert('Already friends', `You're already friends with ${found.name}.`);
        return;
      }
      await addFriend(user.uid, found);
      setRefCodeInput('');
      setShowAddModal(false);
      Alert.alert('Added!', `${found.name} has been added to your friends.`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add friend.');
    } finally {
      setAdding(false);
    }
  }

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission needed', 'Camera access is required to scan QR codes.');
        return;
      }
    }
    scanLock.current = false;
    setShowScanner(true);
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanLock.current || !user) return;
    scanLock.current = true;

    const code = data.trim().toUpperCase();
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

    try {
      setShowScanner(false);
      setAdding(true);
      const found = await lookupPlayerByRefCode(code);
      if (!found) {
        Alert.alert('Not found', 'No player found with that code.');
        return;
      }
      if (friends.some((f) => f.playerId === found.id)) {
        Alert.alert('Already friends', `You're already friends with ${found.name}.`);
        return;
      }
      await addFriend(user.uid, found);
      Alert.alert('Added!', `${found.name} has been added to your friends.`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add friend.');
    } finally {
      setAdding(false);
    }
  }

  function handleRemoveFriend(friendId: string, friendName: string) {
    if (!user) return;
    Alert.alert(`Remove ${friendName}?`, 'They will also be removed from your friends list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeFriend(user.uid, friendId);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove friend.');
          }
        },
      },
    ]);
  }

  const refCode = playerProfile?.refCode ?? '------';

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: c.text }]}>Friends</Text>

      <View
        style={[
          styles.codeCard,
          { backgroundColor: c.card, borderColor: c.border },
        ]}>
        <Text style={[styles.codeLabel, { color: c.textHint }]}>YOUR REF CODE</Text>
        <View style={styles.codeRow}>
          <Text style={[styles.codeValue, { color: c.text }]}>{refCode}</Text>
          <Pressable style={styles.copyBtn} onPress={handleCopyCode}>
            <MaterialIcons
              name={copied ? 'check' : 'content-copy'}
              size={20}
              color={copied ? c.profit : c.textMuted}
            />
          </Pressable>
        </View>
        <View style={[styles.qrWrap, { backgroundColor: c.card }]}>
          {playerProfile?.refCode ? (
            <QRCode
              value={playerProfile.refCode}
              size={160}
              backgroundColor={c.qrBg}
              color={c.qrFg}
            />
          ) : (
            <Text style={[styles.qrPlaceholder, { color: c.textHint }]}>
              Set your display name first
            </Text>
          )}
        </View>
        <Text style={[styles.qrHint, { color: c.textHint }]}>
          Share your code or QR to add friends
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.text }]}>
          Friends ({friends.length})
        </Text>
        <View style={styles.addBtnGroup}>
          <Pressable
            style={[
              styles.scanBtn,
              {
                backgroundColor: c.friendChipBg,
                borderColor: c.friendChipBorder,
              },
            ]}
            onPress={openScanner}>
            <MaterialIcons name="qr-code-scanner" size={20} color={c.blue} />
          </Pressable>
          <Pressable
            style={[
              styles.addBtn,
              {
                backgroundColor: c.accentBg,
                borderColor: c.accentBorder,
              },
            ]}
            onPress={() => setShowAddModal(true)}>
            <MaterialIcons name="person-add" size={20} color={c.profit} />
            <Text style={[styles.addBtnLabel, { color: c.profit }]}>Add</Text>
          </Pressable>
        </View>
      </View>

      {friends.length === 0 ? (
        <Text style={[styles.emptyText, { color: c.textMuted }]}>
          No friends yet. Share your code or add someone with theirs!
        </Text>
      ) : (
        friends.map((item) => (
          <View
            key={item.playerId}
            style={[
              styles.friendRow,
              { backgroundColor: c.card, borderColor: c.border },
            ]}>
            <View style={styles.friendInfo}>
              <MaterialIcons name="person" size={22} color={c.textMuted} />
              <Text style={[styles.friendName, { color: c.textSecondary }]}>
                {item.name}
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => handleRemoveFriend(item.playerId, item.name)}>
              <MaterialIcons name="close" size={20} color={c.textHint} />
            </Pressable>
          </View>
        ))
      )}

      {friends.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Leaderboard</Text>
          </View>
          {lbLoading ? (
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              Calculating...
            </Text>
          ) : leaderboard.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              No session results yet.
            </Text>
          ) : (
            leaderboard.map((entry, idx) => {
              const isMe = entry.playerId === user?.uid;
              return (
                <View
                  key={entry.playerId}
                  style={[
                    styles.lbRow,
                    {
                      backgroundColor: c.card,
                      borderColor: isMe ? c.borderAccent : c.border,
                    },
                  ]}>
                  <View style={styles.lbLeft}>
                    <Text style={[styles.lbRank, { color: c.textMuted }]}>
                      #{idx + 1}
                    </Text>
                    <Text
                      style={[
                        styles.lbName,
                        { color: isMe ? c.text : c.textSecondary },
                      ]}>
                      {entry.name}
                      {isMe ? ' (You)' : ''}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.lbProfit,
                      {
                        color:
                          entry.totalProfit >= 0 ? c.profit : c.loss,
                      },
                    ]}>
                    {entry.totalProfit >= 0 ? '+' : ''}${entry.totalProfit.toFixed(2)}
                  </Text>
                </View>
              );
            })
          )}
        </>
      )}

      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={() => setShowAddModal(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View
              style={[
                styles.addCard,
                { backgroundColor: c.card, borderColor: c.border },
              ]}>
              <Text style={[styles.addCardTitle, { color: c.text }]}>Add Friend</Text>
              <Text style={[styles.addCardSub, { color: c.textMuted }]}>
                Enter their 6-character ref code
              </Text>
              <TextInput
                value={refCodeInput}
                onChangeText={(t) => setRefCodeInput(t.toUpperCase())}
                placeholder="e.g. A3X7KP"
                placeholderTextColor={c.placeholder}
                maxLength={6}
                autoCapitalize="characters"
                autoFocus
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: c.inputBg,
                    borderColor: c.border,
                    color: c.text,
                  },
                ]}
              />
              <View style={styles.addCardActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => {
                    setShowAddModal(false);
                    setRefCodeInput('');
                  }}>
                  <Text style={[styles.cancelLabel, { color: c.lossLight }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: c.accent },
                    (adding || refCodeInput.trim().length < 6) && styles.disabled,
                  ]}
                  onPress={handleAddFriend}
                  disabled={adding || refCodeInput.trim().length < 6}>
                  <Text style={[styles.confirmLabel, { color: c.text }]}>
                    {adding ? 'Adding...' : 'Add Friend'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showScanner}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowScanner(false)}>
        <View style={styles.scannerScreen}>
          <View style={[styles.scannerHeader, { backgroundColor: c.bg }]}>
            <Text style={[styles.scannerTitle, { color: c.text }]}>
              Scan QR Code
            </Text>
            <Pressable
              style={styles.scannerCloseBtn}
              onPress={() => setShowScanner(false)}
              hitSlop={12}>
              <MaterialIcons name="close" size={26} color={c.text} />
            </Pressable>
          </View>
          <View style={styles.scannerBody}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarCodeScanned}
            />
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerFrame} />
            </View>
          </View>
          <Text
            style={[
              styles.scannerHint,
              { color: c.textMuted, backgroundColor: c.bg },
            ]}>
            Point your camera at a friend&apos;s QR code
          </Text>
        </View>
      </Modal>
    </ScrollView>
  );
}

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
  /** Matches Settings tab screen title */
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  codeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
  },
  copyBtn: {
    padding: 6,
  },
  qrWrap: {
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
  },
  qrPlaceholder: {
    fontSize: 13,
  },
  qrHint: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
  },
  addBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 35,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  addBtnLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 16,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  friendName: {
    fontWeight: '600',
    fontSize: 15,
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
  addCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  addCardTitle: {
    fontWeight: '700',
    fontSize: 18,
  },
  addCardSub: {
    fontSize: 13,
  },
  codeInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  addCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cancelLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  confirmLabel: {
    fontWeight: '700',
    fontSize: 14,
  },
  disabled: {
    opacity: 0.4,
  },
  scannerScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scannerCloseBtn: {
    padding: 4,
  },
  scannerBody: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderColor: 'rgba(96,165,250,0.6)',
    borderRadius: 16,
  },
  scannerHint: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  lbLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lbRank: {
    fontWeight: '700',
    fontSize: 14,
    width: 28,
  },
  lbName: {
    fontWeight: '600',
    fontSize: 15,
  },
  lbProfit: {
    fontWeight: '700',
    fontSize: 15,
  },
});
