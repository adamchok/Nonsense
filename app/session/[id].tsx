import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatCompactCurrency } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getFirestoreDb } from '@/lib/firebase';
import {
  addBuyIn,
  finishSession,
  removeEarlyCashOut,
  removePlayerBuyIns,
  saveEarlyCashOut,
  subscribeBuyIns,
  subscribeEarlyCashOuts,
  subscribeFriends,
  updateSessionLocation,
} from '@/lib/firestore';
import type { BuyIn, EarlyCashOut, FriendRecord } from '@/types';

type SessionView = {
  hostId?: string;
  date?: Date;
  location?: string;
  status: 'active' | 'finished';
};

function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

/** USD with commas for ledger amounts (e.g. $12,345.67). */
function formatLedgerCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatCashOutTimestamp(d: Date): string {
  try {
    return formatDateTimeDMY(d);
  } catch {
    return '—';
  }
}

/** Max rows visible before the buy-in ledger scrolls (approx row height incl. margin). */
const LEDGER_MAX_VISIBLE_ROWS = 4;
const LEDGER_ROW_APPROX_PX = 68;
const GUEST_AVATARS = ['🤠', '😎', '🦈', '🐯', '🦁', '🐸', '🐻', '🎯', '🔥', '⚡', '🍀', '🎲'];

export default function ActiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const [session, setSession] = useState<SessionView | null>(null);
  const [buyIns, setBuyIns] = useState<BuyIn[]>([]);
  const [earlyCashOuts, setEarlyCashOuts] = useState<EarlyCashOut[]>([]);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [playerName, setPlayerName] = useState('');
  const [amount, setAmount] = useState('');
  /** When set, buy-in uses this Firestore player id (from ledger quick pick). */
  const [pickedPlayerId, setPickedPlayerId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  const [cashOutTarget, setCashOutTarget] = useState<{
    playerId: string;
    playerName: string;
    totalBuyIn: number;
  } | null>(null);
  const [cashOutAmount, setCashOutAmount] = useState('');
  const amountInputRef = useRef<TextInput>(null);
  /** Ledger row tap → early cash-out detail modal (buy back in lives in modal). */
  const [cashedOutDetailPlayerId, setCashedOutDetailPlayerId] = useState<string | null>(null);
  const [locationEditorVisible, setLocationEditorVisible] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  useEffect(() => {
    if (!id) return;
    const ref = doc(getFirestoreDb(), 'sessions', id);
    return onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError('Session not found.');
          setSession(null);
          return;
        }
        const data = snapshot.data();
        setSession({
          hostId: data.hostId ? String(data.hostId) : undefined,
          date: toDate(data.date ?? data.createdAt),
          location: data.location ? String(data.location) : undefined,
          status: data.status === 'finished' ? 'finished' : 'active',
        });
        setError(null);
      },
      (e) => setError(e.message)
    );
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return subscribeBuyIns(id, setBuyIns, (e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return subscribeEarlyCashOuts(id, setEarlyCashOuts, (e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!playerProfile) return;
    return subscribeFriends(playerProfile.id, setFriends, () => {});
  }, [playerProfile]);

  useEffect(() => {
    if (!cashedOutDetailPlayerId) return;
    const stillOut = earlyCashOuts.some((ec) => ec.playerId === cashedOutDetailPlayerId);
    if (!stillOut) setCashedOutDetailPlayerId(null);
  }, [cashedOutDetailPlayerId, earlyCashOuts]);

  const earlyCashOutMap = new Map(earlyCashOuts.map((ec) => [ec.playerId, ec]));
  const friendAvatarMap = new Map(friends.map((f) => [f.playerId, f.avatarEmoji]));

  const playerTotals = buyIns.reduce<Record<string, { name: string; total: number }>>(
    (acc, b) => {
      if (!acc[b.playerId]) acc[b.playerId] = { name: b.playerName, total: 0 };
      acc[b.playerId].total += b.amount;
      return acc;
    },
    {}
  );
  const hostId = session?.hostId;
  const players = Object.entries(playerTotals)
    .map(([playerId, v]) => ({
      playerId,
      ...v,
    }))
    .sort((a, b) => {
      if (hostId) {
        if (a.playerId === hostId) return -1;
        if (b.playerId === hostId) return 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  const totalPot = players.reduce((sum, p) => sum + p.total, 0);

  function pickGuestAvatar(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return GUEST_AVATARS[hash % GUEST_AVATARS.length];
  }

  function getAvatarEmoji(playerId: string): string {
    if (playerProfile && playerId === playerProfile.id) {
      return playerProfile.avatarEmoji ?? '🙂';
    }
    if (friendAvatarMap.has(playerId)) {
      return friendAvatarMap.get(playerId) ?? '🙂';
    }
    return pickGuestAvatar(playerId);
  }

  const cashedOutDetailModal = useMemo(() => {
    if (!cashedOutDetailPlayerId) return null;
    const co = earlyCashOuts.find((ec) => ec.playerId === cashedOutDetailPlayerId);
    const p = players.find((x) => x.playerId === cashedOutDetailPlayerId);
    if (!co || !p) return null;
    return { playerId: p.playerId, name: p.name, totalBuyIn: p.total, cashOut: co };
  }, [cashedOutDetailPlayerId, earlyCashOuts, players]);

  function resolvePlayerId(name: string): string {
    const trimmed = name.trim();
    if (pickedPlayerId) return pickedPlayerId;
    if (playerProfile && trimmed.toLowerCase() === playerProfile.name.toLowerCase()) {
      return playerProfile.id;
    }
    return trimmed.toLowerCase().replace(/\s+/g, '_');
  }

  async function handleAddBuyIn(name: string, amt: string) {
    Keyboard.dismiss();
    if (!id || !name.trim() || !amt.trim()) return;
    const parsed = parseFloat(amt);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.');
      return;
    }

    try {
      setIsAdding(true);
      await addBuyIn(id, {
        playerId: resolvePlayerId(name),
        playerName: name.trim(),
        amount: parsed,
      });
      setPlayerName('');
      setAmount('');
      setPickedPlayerId(null);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add buy-in.');
    } finally {
      setIsAdding(false);
    }
  }

  function onPlayerNameChange(text: string) {
    setPlayerName(text);
    setPickedPlayerId(null);
  }

  function selectRebuyForPlayer(playerId: string, name: string) {
    setPlayerName(name);
    setPickedPlayerId(playerId);
    amountInputRef.current?.focus();
  }

  const viewerIsHost = Boolean(
    playerProfile && session?.hostId && playerProfile.id === session.hostId
  );

  function confirmRemovePlayer(playerId: string, name: string) {
    if (!id) return;
    Alert.alert(
      `Remove ${name}?`,
      'All buy-ins for this player will be deleted from the session.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingPlayerId(playerId);
              await removePlayerBuyIns(id, playerId);
              if (pickedPlayerId === playerId) {
                setPlayerName('');
                setPickedPlayerId(null);
              }
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not remove player.');
            } finally {
              setRemovingPlayerId(null);
            }
          },
        },
      ]
    );
  }

  function startEarlyCashOut(playerId: string, playerName: string, totalBuyIn: number) {
    setCashOutTarget({ playerId, playerName, totalBuyIn });
    setCashOutAmount('');
  }

  async function confirmEarlyCashOut() {
    if (!id || !cashOutTarget) return;
    const parsed = parseFloat(cashOutAmount);
    if (isNaN(parsed) || parsed < 0) {
      Alert.alert('Invalid', 'Enter a valid amount.');
      return;
    }
    try {
      await saveEarlyCashOut(id, {
        playerId: cashOutTarget.playerId,
        playerName: cashOutTarget.playerName,
        amount: parsed,
      });
      Keyboard.dismiss();
      setCashOutTarget(null);
      setCashOutAmount('');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save cash-out.');
    }
  }

  function confirmBuyBackIn(playerId: string, playerName: string) {
    if (!id) return;
    Alert.alert(
      `Buy back in?`,
      `${playerName} will rejoin the session. Their early cash-out will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy Back In',
          onPress: async () => {
            try {
              await removeEarlyCashOut(id, playerId);
              setCashedOutDetailPlayerId(null);
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove cash-out.');
            }
          },
        },
      ]
    );
  }

  function closeCashedOutDetailModal() {
    setCashedOutDetailPlayerId(null);
  }

  function handleEndSession() {
    if (!id) return;
    Alert.alert('End Session', 'Are you sure? Players will need to cash out.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          try {
            await finishSession(id);
            router.push(`./cashout/${id}`);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to end session.');
          }
        },
      },
    ]);
  }

  const selfInSession = playerProfile && playerTotals[playerProfile.id];

  function closeCashOutModal() {
    Keyboard.dismiss();
    setCashOutTarget(null);
    setCashOutAmount('');
  }

  function openLocationEditor() {
    setLocationDraft(session?.location ?? '');
    setLocationEditorVisible(true);
  }

  function closeLocationEditor() {
    Keyboard.dismiss();
    setLocationEditorVisible(false);
    setLocationDraft('');
  }

  async function saveLocation() {
    if (!id) return;
    try {
      setIsSavingLocation(true);
      await updateSessionLocation(id, locationDraft);
      closeLocationEditor();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update location.');
    } finally {
      setIsSavingLocation(false);
    }
  }

  return (
    <>
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled>
      <Text style={[styles.title, { color: c.text }]}>
        {session?.date ? formatDateTimeDMY(session.date) : 'Active Session'}
      </Text>
      <View style={styles.metaRow}>
        {viewerIsHost ? (
          <Pressable
            onPress={openLocationEditor}
            style={[styles.locationCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <MaterialIcons name="place" size={20} color={c.textHint} style={styles.locationIcon} />
            <View style={styles.locationTextBlock}>
              <Text style={[styles.locationLabel, { color: c.textHint }]}>LOCATION</Text>
              <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={2}>
                {session?.location ? session.location : 'Tap to add location'}
              </Text>
            </View>
            <MaterialIcons name="edit" size={18} color={c.textHint} />
          </Pressable>
        ) : session?.location ? (
          <View style={[styles.locationCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <MaterialIcons name="place" size={20} color={c.textHint} style={styles.locationIcon} />
            <View style={styles.locationTextBlock}>
              <Text style={[styles.locationLabel, { color: c.textHint }]}>LOCATION</Text>
              <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={2}>
                {session.location}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.metaSpacer} />
        )}
        <View style={[styles.potBadge, { backgroundColor: c.card, borderColor: c.borderAccent }]}>
          <Text style={[styles.potLabel, { color: c.profit }]}>POT</Text>
          <Text style={[styles.potValue, { color: c.profit }]}>{formatCompactCurrency(totalPot)}</Text>
        </View>
      </View>
      {error ? <Text style={[styles.error, { color: c.loss }]}>{error}</Text> : null}

      {session?.status === 'active' && (
        <View style={[styles.addSection, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Add Buy-In</Text>

          {playerProfile && !selfInSession && (
            <Pressable
              style={[styles.quickAddButton, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
              onPress={() => selectRebuyForPlayer(playerProfile.id, playerProfile.name)}>
              <Text style={[styles.quickAddLabel, { color: c.profit }]}>+ Add myself ({playerProfile.name})</Text>
            </Pressable>
          )}

          {(() => {
            const sessionPlayerIds = new Set(players.map((p) => p.playerId));
            const activePlayers = players.filter((p) => !earlyCashOutMap.has(p.playerId));
            const friendsNotInSession = friends.filter(
              (f) => !sessionPlayerIds.has(f.playerId)
            );
            const hasChips = activePlayers.length > 0 || friendsNotInSession.length > 0;
            if (!hasChips) return null;
            return (
              <View style={styles.rebuyBlock}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rebuyChips}
                  keyboardShouldPersistTaps="handled">
                  {activePlayers.map((p) => {
                    const isMe = playerProfile && p.playerId === playerProfile.id;
                    return (
                      <Pressable
                        key={p.playerId}
                        style={[styles.rebuyChip, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}
                        onPress={() => selectRebuyForPlayer(p.playerId, p.name)}>
                        <Text style={[styles.rebuyChipText, { color: c.chipText }]}>
                          {p.name}
                          {isMe ? ' (You)' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {friendsNotInSession.map((f) => (
                    <Pressable
                      key={f.playerId}
                      style={[styles.friendChip, { backgroundColor: c.friendChipBg, borderColor: c.friendChipBorder }]}
                      onPress={() => selectRebuyForPlayer(f.playerId, f.name)}>
                      <MaterialIcons name="person-add" size={14} color={c.blue} />
                      <Text style={[styles.friendChipText, { color: c.blue }]}>{f.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            );
          })()}

          <View style={styles.inputRow}>
            <TextInput
              value={playerName}
              onChangeText={onPlayerNameChange}
              placeholder="Player name"
              placeholderTextColor={c.placeholder}
              style={[styles.input, { flex: 2, borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
            />
            <View style={[styles.amountInputWrap, { borderColor: c.border, backgroundColor: c.inputBg }]}>
              <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
              <TextInput
                ref={amountInputRef}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={c.placeholder}
                keyboardType="numeric"
                style={[styles.amountInput, { color: c.text }]}
              />
            </View>
          </View>
          <Pressable
            style={[styles.addButton, { backgroundColor: c.accent }, (isAdding || !playerName.trim() || !amount.trim()) && styles.disabled]}
            onPress={() => handleAddBuyIn(playerName, amount)}
            disabled={isAdding || !playerName.trim() || !amount.trim()}>
            <Text style={styles.addButtonLabel}>{isAdding ? 'Adding...' : 'Add Buy-In'}</Text>
          </Pressable>
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: c.text }]}>Buy-In Ledger ({players.length})</Text>
      {players.length === 0 ? (
        <Text style={[styles.emptyText, { color: c.textMuted }]}>No buy-ins yet. Add a player above.</Text>
      ) : (
        <ScrollView
          style={
            players.length > LEDGER_MAX_VISIBLE_ROWS
              ? { maxHeight: LEDGER_MAX_VISIBLE_ROWS * LEDGER_ROW_APPROX_PX }
              : undefined
          }
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={players.length > LEDGER_MAX_VISIBLE_ROWS}>
          {players.map((item) => {
            const isMe = item.playerId === playerProfile?.id;
            const rowIsHost = item.playerId === session?.hostId;
            const cashOut = earlyCashOutMap.get(item.playerId);
            const isCashedOut = !!cashOut;
            const rowStyle = [
              styles.playerRow,
              { backgroundColor: c.card, borderColor: c.border },
              isCashedOut && [styles.playerRowCashedOut, { borderColor: c.borderDanger }],
            ];
            const tapCashedOutRow = session?.status === 'active' && isCashedOut;

            const rowInner = (
              <>
                <View style={styles.playerRowLeft}>
                  <View style={styles.playerInfo}>
                    {!isCashedOut ? (
                      <View style={styles.playerInfoInline}>
                        <Text
                          style={[styles.playerName, styles.playerNameInline, { color: c.text }]}
                          numberOfLines={1}>
                          {getAvatarEmoji(item.playerId)} {item.name}
                        </Text>
                        {rowIsHost && (
                          <View style={[styles.hostBadge, { backgroundColor: c.badge.host }]}>
                            <Text style={styles.badgeText}>HOST</Text>
                          </View>
                        )}
                        {isMe && !rowIsHost && (
                          <View style={[styles.meBadge, { backgroundColor: c.badge.you }]}>
                            <Text style={styles.badgeText}>YOU</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <>
                        <Text
                          style={[styles.playerName, { color: c.textMuted }]}
                          numberOfLines={1}>
                          {getAvatarEmoji(item.playerId)} {item.name}
                        </Text>
                        <View style={styles.badges}>
                          <View style={[styles.cashedOutBadge, { backgroundColor: c.badge.cashedOut }]}>
                            <Text style={styles.badgeText}>CASHED OUT</Text>
                          </View>
                          {rowIsHost && (
                            <View style={[styles.hostBadge, { backgroundColor: c.badge.host }]}>
                              <Text style={styles.badgeText}>HOST</Text>
                            </View>
                          )}
                          {isMe && !rowIsHost && (
                            <View style={[styles.meBadge, { backgroundColor: c.badge.you }]}>
                              <Text style={styles.badgeText}>YOU</Text>
                            </View>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                  <View style={styles.playerAmounts}>
                    <Text style={[styles.playerAmount, { color: isCashedOut ? c.textMuted : c.profit }]}>
                      {formatLedgerCurrency(item.total)}
                    </Text>
                    {isCashedOut && (
                      <Text style={[styles.cashOutResult, { color: c.textMuted }]}>
                        Out: {formatLedgerCurrency(cashOut.amount)} (
                        <Text
                          style={{ color: cashOut.amount - item.total >= 0 ? c.profit : c.lossLight }}>
                          {cashOut.amount - item.total >= 0 ? '+' : ''}
                          {formatLedgerCurrency(cashOut.amount - item.total)}
                        </Text>
                        )
                      </Text>
                    )}
                  </View>
                </View>
                {session?.status === 'active' && !isCashedOut && (
                  <View style={styles.playerRowActions}>
                    <Pressable
                      style={[styles.cashOutPlayerBtn, { backgroundColor: c.blueBg }]}
                      onPress={() => startEarlyCashOut(item.playerId, item.name, item.total)}
                      hitSlop={8}
                      accessibilityLabel={`Cash out ${item.name}`}
                      accessibilityRole="button">
                      <MaterialIcons name="account-balance-wallet" size={18} color={c.blue} />
                    </Pressable>
                    {viewerIsHost ? (
                      <Pressable
                        style={styles.removePlayerBtn}
                        disabled={removingPlayerId === item.playerId}
                        onPress={() => confirmRemovePlayer(item.playerId, item.name)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${item.name}`}
                        accessibilityRole="button">
                        {removingPlayerId === item.playerId ? (
                          <Text style={[styles.removePlayerLabel, { color: c.lossLight }]}>…</Text>
                        ) : (
                          <MaterialIcons name="delete-outline" size={18} color={c.lossLight} />
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                )}
                {tapCashedOutRow ? (
                  <MaterialIcons name="chevron-right" size={22} color={c.textHint} />
                ) : null}
              </>
            );

            if (tapCashedOutRow) {
              return (
                <Pressable
                  key={item.playerId}
                  style={({ pressed }) => [...(Array.isArray(rowStyle) ? rowStyle.flat() : [rowStyle]), pressed && { opacity: 0.85, backgroundColor: c.pressedRow }]}
                  onPress={() => setCashedOutDetailPlayerId(item.playerId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, early cash-out details`}>
                  {rowInner}
                </Pressable>
              );
            }

            return (
              <View key={item.playerId} style={rowStyle}>
                {rowInner}
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.bottomActions}>
        {session?.status === 'active' && (
          <Pressable style={[styles.endButton, { backgroundColor: c.destructive }]} onPress={handleEndSession}>
            <Text style={styles.endButtonLabel}>End Session & Cash Out</Text>
          </Pressable>
        )}
        {session?.status === 'finished' && (
          <Pressable style={[styles.summaryButton, { backgroundColor: c.accent }]} onPress={() => router.push(`./summary/${id}`)}>
            <Text style={styles.addButtonLabel}>View Summary</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>

    <Modal
      visible={!!cashOutTarget}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeCashOutModal}>
      {cashOutTarget ? (
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={closeCashOutModal}
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
          />
          <View pointerEvents="box-none" style={styles.modalCenterWrap}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
              style={styles.modalKeyboard}>
              <View style={[styles.cashOutForm, { backgroundColor: c.card, borderColor: c.borderBlue }]}>
                <Text style={[styles.cashOutFormTitle, { color: c.text }]}>
                  Cash out: {cashOutTarget.playerName}
                </Text>
                <Text style={[styles.cashOutFormSub, { color: c.textMuted }]}>
                  Buy-in total: {formatLedgerCurrency(cashOutTarget.totalBuyIn)}
                </Text>
                <View style={styles.cashOutInputRow}>
                  <View style={[styles.amountInputWrap, styles.cashOutModalAmountWrap, { borderColor: c.border, backgroundColor: c.inputBg }]}>
                    <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
                    <TextInput
                      value={cashOutAmount}
                      onChangeText={setCashOutAmount}
                      placeholder="0.00"
                      placeholderTextColor={c.placeholder}
                      keyboardType="numeric"
                      style={[styles.amountInput, { color: c.text }]}
                    />
                  </View>
                </View>
                <View style={styles.cashOutModalActions}>
                  <Pressable style={styles.cashOutCancelBtn} onPress={closeCashOutModal}>
                    <Text style={[styles.removePlayerLabel, { color: c.lossLight }]}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.cashOutConfirmBtn, { backgroundColor: c.accent }]} onPress={confirmEarlyCashOut}>
                    <Text style={styles.addButtonLabel}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      ) : null}
    </Modal>

    <Modal
      visible={!!cashedOutDetailPlayerId && !!cashedOutDetailModal}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeCashedOutDetailModal}>
      {cashedOutDetailModal ? (
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={closeCashedOutDetailModal}
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
          />
          <View pointerEvents="box-none" style={styles.modalCenterWrap}>
            <View style={styles.modalKeyboard}>
              <View style={[styles.cashedOutDetailCard, { backgroundColor: c.card, borderColor: c.borderDanger }]}>
                <Text style={[styles.cashedOutDetailTitle, { color: c.text }]}>{cashedOutDetailModal.name}</Text>
                <Text style={[styles.cashedOutDetailSubtitle, { color: c.textHint }]}>Early cash-out</Text>

                <View style={styles.cashOutDetailRows}>
                  <View style={styles.cashOutDetailRow}>
                    <Text style={[styles.cashOutDetailLabel, { color: c.textMuted }]}>Total buy-in</Text>
                    <Text style={[styles.cashOutDetailValue, { color: c.textSecondary }]}>
                      {formatLedgerCurrency(cashedOutDetailModal.totalBuyIn)}
                    </Text>
                  </View>
                  <View style={styles.cashOutDetailRow}>
                    <Text style={[styles.cashOutDetailLabel, { color: c.textMuted }]}>Cashed out</Text>
                    <Text style={[styles.cashOutDetailValue, { color: c.textSecondary }]}>
                      {formatLedgerCurrency(cashedOutDetailModal.cashOut.amount)}
                    </Text>
                  </View>
                  <View style={styles.cashOutDetailRow}>
                    <Text style={[styles.cashOutDetailLabel, { color: c.textMuted }]}>Result</Text>
                    <Text
                      style={[
                        styles.cashOutDetailValue,
                        { color: cashedOutDetailModal.cashOut.amount - cashedOutDetailModal.totalBuyIn >= 0
                          ? c.profit
                          : c.lossLight },
                      ]}>
                      {cashedOutDetailModal.cashOut.amount - cashedOutDetailModal.totalBuyIn >= 0
                        ? '+'
                        : ''}
                      {formatLedgerCurrency(
                        cashedOutDetailModal.cashOut.amount - cashedOutDetailModal.totalBuyIn
                      )}
                    </Text>
                  </View>
                  <View style={styles.cashOutDetailRow}>
                    <Text style={[styles.cashOutDetailLabel, { color: c.textMuted }]}>Cashed out at</Text>
                    <Text style={[styles.cashOutDetailValueMuted, { color: c.textMuted }]}>
                      {formatCashOutTimestamp(cashedOutDetailModal.cashOut.cashedOutAt)}
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[styles.cashedOutDetailBuyBackBtn, { backgroundColor: c.chipBg, borderColor: c.borderAmber }]}
                  onPress={() =>
                    confirmBuyBackIn(cashedOutDetailModal.playerId, cashedOutDetailModal.name)
                  }>
                  <MaterialIcons name="replay" size={18} color={c.warning} />
                  <Text style={[styles.cashedOutDetailBuyBackLabel, { color: c.warning }]}>Buy Back In</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </Modal>

    <Modal
      visible={locationEditorVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeLocationEditor}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
          onPress={closeLocationEditor}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        />
        <View pointerEvents="box-none" style={styles.modalCenterWrap}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            style={styles.modalKeyboard}>
            <View style={[styles.cashOutForm, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.cashOutFormTitle, { color: c.text }]}>Edit location</Text>
              <TextInput
                value={locationDraft}
                onChangeText={setLocationDraft}
                placeholder="Location"
                placeholderTextColor={c.placeholder}
                style={[
                  styles.input,
                  { borderColor: c.border, backgroundColor: c.inputBg, color: c.text },
                ]}
              />
              <View style={styles.cashOutModalActions}>
                <Pressable style={styles.cashOutCancelBtn} onPress={closeLocationEditor}>
                  <Text style={[styles.removePlayerLabel, { color: c.lossLight }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.cashOutConfirmBtn,
                    { backgroundColor: c.accent },
                    isSavingLocation && styles.disabled,
                  ]}
                  onPress={saveLocation}
                  disabled={isSavingLocation}>
                  <Text style={styles.addButtonLabel}>{isSavingLocation ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 12,
    gap: 10,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  metaSpacer: {
    flex: 1,
  },
  locationCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  locationIcon: {
    marginTop: 1,
  },
  locationTextBlock: {
    flex: 1,
    gap: 2,
  },
  locationLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  locationValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  potBadge: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    minWidth: 88,
  },
  potLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  potValue: {
    fontWeight: '700',
    fontSize: 16,
  },
  error: {},
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
    marginTop: 6,
  },
  addSection: {
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  quickAddButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickAddLabel: {
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  amountInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  dollarSign: {
    fontSize: 16,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  addButton: {
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  addButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
  emptyText: {},
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  playerRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  playerRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  removePlayerBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    minWidth: 32,
  },
  removePlayerLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  rebuyBlock: {
    gap: 6,
  },
  rebuyChips: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  rebuyChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  rebuyChipText: {
    fontWeight: '600',
    fontSize: 13,
  },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  friendChipText: {
    fontWeight: '600',
    fontSize: 13,
  },
  playerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  playerInfoInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  playerName: {
    fontWeight: '600',
    fontSize: 15,
  },
  playerNameInline: {
    flexShrink: 1,
  },
  badges: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  hostBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  meBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  playerAmounts: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 92,
  },
  playerAmount: {
    fontWeight: '600',
  },
  playerRowCashedOut: {
    opacity: 0.65,
    borderStyle: 'dashed',
  },
  cashedOutBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cashOutResult: {
    fontSize: 12,
    marginTop: 2,
  },
  cashOutPlayerBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    minWidth: 32,
    borderRadius: 6,
  },
  cashedOutDetailCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cashedOutDetailTitle: {
    fontWeight: '700',
    fontSize: 18,
  },
  cashedOutDetailSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: -6,
  },
  cashOutDetailRows: {
    gap: 10,
  },
  cashOutDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cashOutDetailLabel: {
    fontSize: 14,
    flex: 1,
  },
  cashOutDetailValue: {
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'right',
    maxWidth: '55%',
  },
  cashOutDetailValueMuted: {
    fontSize: 13,
    textAlign: 'right',
    maxWidth: '55%',
  },
  cashedOutDetailBuyBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cashedOutDetailBuyBackLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalRoot: {
    flex: 1,
  },
  modalCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalKeyboard: {
    width: '100%',
    maxWidth: 360,
  },
  cashOutForm: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cashOutModalAmountWrap: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  cashOutModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  cashOutFormTitle: {
    fontWeight: '700',
    fontSize: 15,
  },
  cashOutFormSub: {
    fontSize: 13,
  },
  cashOutInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    width: '100%',
  },
  cashOutConfirmBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  cashOutCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bottomActions: {
    paddingTop: 12,
    gap: 10,
  },
  endButton: {
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  endButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  summaryButton: {
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
});
