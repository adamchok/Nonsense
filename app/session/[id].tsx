import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  type ViewStyle,
} from 'react-native';

import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { formatBlinds, formatCompactCurrency } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getFirestoreDb } from '@/lib/firebase';
import {
  addBuyIn,
  removeEarlyCashOut,
  removePlayerBuyIns,
  saveEarlyCashOut,
  subscribeBuyIns,
  subscribeEarlyCashOuts,
  subscribeFriends,
  updateSessionBlinds,
  updateSessionLocation,
} from '@/lib/firestore';
import { scrollModalFieldToEnd, scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import type { BuyIn, EarlyCashOut, FriendRecord } from '@/types';

type SessionView = {
  hostId?: string;
  date?: Date;
  location?: string;
  smallBlind?: number;
  bigBlind?: number;
  status: 'active' | 'finished';
};

function sessionBlindsFromData(data: Record<string, unknown>): {
  smallBlind?: number;
  bigBlind?: number;
} {
  const rawSb = data.smallBlind;
  const rawBb = data.bigBlind;
  if (rawSb == null || rawBb == null) return {};
  const sb = typeof rawSb === 'number' ? rawSb : Number(rawSb);
  const bb = typeof rawBb === 'number' ? rawBb : Number(rawBb);
  if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb <= 0 || bb < sb) return {};
  return { smallBlind: sb, bigBlind: bb };
}

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
const LEDGER_MAX_VISIBLE_ROWS = 8;
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
  const [buyInEditorVisible, setBuyInEditorVisible] = useState(false);
  const buyInAmountInputRef = useRef<TextInput>(null);
  const buyInScrollRef = useRef<ScrollView>(null);
  const locationScrollRef = useRef<ScrollView>(null);
  const blindsScrollRef = useRef<ScrollView>(null);
  /** Ledger row tap → early cash-out detail modal (buy back in lives in modal). */
  const [cashedOutDetailPlayerId, setCashedOutDetailPlayerId] = useState<string | null>(null);
  const [locationEditorVisible, setLocationEditorVisible] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [blindsEditorVisible, setBlindsEditorVisible] = useState(false);
  const [smallBlindDraft, setSmallBlindDraft] = useState('');
  const [bigBlindDraft, setBigBlindDraft] = useState('');
  const [isSavingBlinds, setIsSavingBlinds] = useState(false);

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
        const data = snapshot.data() as Record<string, unknown>;
        setSession({
          hostId: data.hostId ? String(data.hostId) : undefined,
          date: toDate(data.date ?? data.createdAt),
          location: data.location ? String(data.location) : undefined,
          ...sessionBlindsFromData(data),
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
  const selfInSession = Boolean(playerProfile && playerTotals[playerProfile.id]);

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
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can add buy-ins.');
      return;
    }
    if (!id || !name.trim() || !amt.trim()) return;
    const parsed = parseFloat(amt);
    if (isNaN(parsed) || parsed <= 0) {
      appAlert('Invalid amount', 'Enter a positive number.');
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
      appAlert('Error', e instanceof Error ? e.message : 'Failed to add buy-in.');
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
    requestAnimationFrame(() => buyInAmountInputRef.current?.focus());
  }

  function openBuyInEditor() {
    setBuyInEditorVisible(true);
  }

  function closeBuyInEditor() {
    Keyboard.dismiss();
    setBuyInEditorVisible(false);
    setPlayerName('');
    setAmount('');
    setPickedPlayerId(null);
  }

  const viewerIsHost = Boolean(
    playerProfile && session?.hostId && playerProfile.id === session.hostId
  );

  function confirmRemovePlayer(playerId: string, name: string) {
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can remove players.');
      return;
    }
    if (!id) return;
    appAlert(
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
              appAlert('Error', e instanceof Error ? e.message : 'Could not remove player.');
            } finally {
              setRemovingPlayerId(null);
            }
          },
        },
      ]
    );
  }

  function startEarlyCashOut(playerId: string, playerName: string, totalBuyIn: number) {
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can cash out players.');
      return;
    }
    setCashOutTarget({ playerId, playerName, totalBuyIn });
    setCashOutAmount('');
  }

  async function confirmEarlyCashOut() {
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can cash out players.');
      return;
    }
    if (!id || !cashOutTarget) return;
    const parsed = parseFloat(cashOutAmount);
    if (isNaN(parsed) || parsed < 0) {
      appAlert('Invalid', 'Enter a valid amount.');
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
      appAlert('Error', e instanceof Error ? e.message : 'Failed to save cash-out.');
    }
  }

  function confirmBuyBackIn(playerId: string, playerName: string) {
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can buy players back in.');
      return;
    }
    if (!id) return;
    appAlert(
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
              appAlert('Error', e instanceof Error ? e.message : 'Failed to remove cash-out.');
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
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can end this session.');
      return;
    }
    if (!id) return;
    if (!formatBlinds(session?.smallBlind, session?.bigBlind)) {
      appAlert(
        'Blinds required',
        'Set small and big blind before ending this session.'
      );
      return;
    }
    appAlert('End Session', 'Are you sure? Players will need to cash out.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: () => {
          router.push(`./cashout/${id}`);
        },
      },
    ]);
  }

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
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can edit location.');
      return;
    }
    if (!id) return;
    try {
      setIsSavingLocation(true);
      await updateSessionLocation(id, locationDraft);
      closeLocationEditor();
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to update location.');
    } finally {
      setIsSavingLocation(false);
    }
  }

  function openBlindsEditor() {
    setSmallBlindDraft(
      session?.smallBlind != null && Number.isFinite(session.smallBlind)
        ? String(session.smallBlind)
        : ''
    );
    setBigBlindDraft(
      session?.bigBlind != null && Number.isFinite(session.bigBlind) ? String(session.bigBlind) : ''
    );
    setBlindsEditorVisible(true);
  }

  function closeBlindsEditor() {
    Keyboard.dismiss();
    setBlindsEditorVisible(false);
    setSmallBlindDraft('');
    setBigBlindDraft('');
  }

  async function saveBlinds() {
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can edit blinds.');
      return;
    }
    if (!id) return;
    const sbTrim = smallBlindDraft.trim();
    const bbTrim = bigBlindDraft.trim();
    const sb = parseFloat(sbTrim);
    const bb = parseFloat(bbTrim);
    if (!sbTrim || !bbTrim || Number.isNaN(sb) || Number.isNaN(bb) || sb <= 0 || bb < sb) {
      appAlert(
        'Blinds required',
        'Enter small and big blind amounts, with big blind at least equal to the small blind.'
      );
      return;
    }
    try {
      setIsSavingBlinds(true);
      await updateSessionBlinds(id, { smallBlind: sb, bigBlind: bb });
      closeBlindsEditor();
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to update blinds.');
    } finally {
      setIsSavingBlinds(false);
    }
  }

  async function confirmBuyInFromModal() {
    if (!playerName.trim() || !amount.trim()) return;
    await handleAddBuyIn(playerName, amount);
    closeBuyInEditor();
  }

  const blindsDisplay = session ? formatBlinds(session.smallBlind, session.bigBlind) : null;
  /** Host always sees location/blinds cards; participants see them when the host has set values. */
  const showSessionMetaCards = Boolean(
    viewerIsHost || blindsDisplay || Boolean(session?.location?.trim())
  );
  const sbDraft = smallBlindDraft.trim();
  const bbDraft = bigBlindDraft.trim();
  const sbDraftValue = parseFloat(sbDraft);
  const bbDraftValue = parseFloat(bbDraft);
  const isBlindsDraftValid =
    Boolean(sbDraft) &&
    Boolean(bbDraft) &&
    !Number.isNaN(sbDraftValue) &&
    !Number.isNaN(bbDraftValue) &&
    sbDraftValue > 0 &&
    bbDraftValue >= sbDraftValue;
  const isBlindsSaveDisabled = isSavingBlinds || !isBlindsDraftValid;

  return (
    <>
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled>
      <View style={styles.sessionHeader}>
        <View style={styles.sessionHeaderText}>
          <Text style={[styles.sessionHeaderLabel, { color: c.textHint }]}>SESSION</Text>
          <Text
            style={[styles.sessionHeaderTitle, { color: c.text }]}
            numberOfLines={2}>
            {session?.date ? formatDateTimeDMY(session.date) : 'Active Session'}
          </Text>
        </View>
        {viewerIsHost ? (
          <Pressable
            onPress={openBuyInEditor}
            style={({ pressed }) => [
              styles.sessionHeaderBuyIn,
              {
                backgroundColor: c.accent,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}>
            <MaterialIcons name="add" size={18} color="#fff" />
            <Text style={styles.sessionHeaderBuyInLabel}>Buy-In</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.metaRow}>
        <View style={styles.potRowRight}>
          <View style={[styles.potBadge, { backgroundColor: c.card, borderColor: c.borderAccent }]}>
            <Text style={[styles.potLabel, { color: c.profit }]}>POT</Text>
            <Text style={[styles.potValue, { color: c.profit }]}>{formatCompactCurrency(totalPot)}</Text>
          </View>
        </View>
      </View>
      {showSessionMetaCards ? (
        <View style={styles.metaSecondRow}>
          {viewerIsHost ? (
            <>
              <Pressable
                onPress={openLocationEditor}
                style={[styles.blindsCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.locationTextBlock}>
                  <View style={styles.locationLabelRow}>
                    <MaterialIcons name="place" size={14} color={c.textHint} />
                    <Text style={[styles.locationLabel, { color: c.textHint }]}>LOCATION</Text>
                  </View>
                  <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={1}>
                    {session?.location ? session.location : 'Tap to add location'}
                  </Text>
                </View>
                <MaterialIcons name="edit" size={18} color={c.textHint} />
              </Pressable>
              <Pressable
                onPress={openBlindsEditor}
                style={[styles.blindsCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.locationTextBlock}>
                  <View style={styles.locationLabelRow}>
                    <MaterialIcons name="payments" size={14} color={c.textHint} />
                    <Text style={[styles.locationLabel, { color: c.textHint }]}>BLINDS</Text>
                  </View>
                  <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={1}>
                    {blindsDisplay ?? 'Tap to add blinds'}
                  </Text>
                </View>
                <MaterialIcons name="edit" size={18} color={c.textHint} />
              </Pressable>
            </>
          ) : (
            <>
              {session?.location?.trim() ? (
                <View style={[styles.blindsCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={styles.locationTextBlock}>
                    <View style={styles.locationLabelRow}>
                      <MaterialIcons name="place" size={14} color={c.textHint} />
                      <Text style={[styles.locationLabel, { color: c.textHint }]}>LOCATION</Text>
                    </View>
                    <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={2}>
                      {session.location}
                    </Text>
                  </View>
                </View>
              ) : null}
              {blindsDisplay ? (
                <View style={[styles.blindsCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={styles.locationTextBlock}>
                    <View style={styles.locationLabelRow}>
                      <MaterialIcons name="payments" size={14} color={c.textHint} />
                      <Text style={[styles.locationLabel, { color: c.textHint }]}>BLINDS</Text>
                    </View>
                    <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={1}>
                      {blindsDisplay}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
      {error ? <Text style={[styles.error, { color: c.loss }]}>{error}</Text> : null}
      {session?.status === 'active' && !viewerIsHost && (
        <Text style={[styles.emptyText, { color: c.textMuted }]}>
          View-only mode: only the host can add buy-ins, cash out players, edit location or blinds, or end the session.
        </Text>
      )}

      <Text style={[styles.sectionTitle, { color: c.text }]}>Buy-In Ledger ({players.length})</Text>
      {players.length > 0 && session?.hostId ? (
        <View style={styles.ledgerLegend}>
          <View
            style={[
              styles.ledgerLegendSwatch,
              { backgroundColor: c.accentBg, borderColor: c.borderAccent },
            ]}
          />
          <Text style={[styles.ledgerLegendText, { color: c.textHint }]}>
            Highlighted row is the session host.
          </Text>
        </View>
      ) : null}
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
            const rowStyle: ViewStyle[] = [
              styles.playerRow,
              rowIsHost
                ? { backgroundColor: c.accentBg, borderColor: c.borderAccent, borderWidth: 2 }
                : { backgroundColor: c.card, borderColor: c.border },
            ];
            if (isCashedOut) {
              rowStyle.push(styles.playerRowCashedOut);
              if (!rowIsHost) {
                rowStyle.push({ borderColor: c.borderDanger });
              }
            }
            const tapCashedOutRow = viewerIsHost && session?.status === 'active' && isCashedOut;

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
                        {isMe && (
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
                {viewerIsHost && session?.status === 'active' && !isCashedOut && (
                  <View style={styles.playerRowActions}>
                    <Pressable
                      style={[styles.cashOutPlayerBtn, { backgroundColor: c.blueBg }]}
                      onPress={() => startEarlyCashOut(item.playerId, item.name, item.total)}
                      hitSlop={8}
                      accessibilityLabel={`Cash out ${item.name}`}
                      accessibilityRole="button">
                      <MaterialIcons name="account-balance-wallet" size={18} color={c.blue} />
                    </Pressable>
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
        {viewerIsHost && session?.status === 'active' && (
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
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
              style={[styles.modalKeyboard, styles.sessionModalKav]}>
              <View style={[styles.cashOutForm, { backgroundColor: c.card, borderColor: c.border }]}>
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
      visible={buyInEditorVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeBuyInEditor}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
          onPress={closeBuyInEditor}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        />
        <View pointerEvents="box-none" style={styles.modalCenterWrap}>
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            style={[styles.modalKeyboard, styles.sessionModalKav]}>
            <View style={[styles.cashOutForm, styles.buyInModalForm, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.cashOutFormTitle, { color: c.text }]}>Add Buy-In</Text>
              <Text style={[styles.cashOutFormSub, { color: c.textMuted }]}>
                Enter name and amount, or pick a player below.
              </Text>
              <ScrollView
                ref={buyInScrollRef}
                style={styles.buyInModalScroll}
                contentContainerStyle={styles.buyInModalScrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}>
                <View style={[styles.addSection, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
                  {playerProfile && !selfInSession && (
                    <Pressable
                      style={[styles.quickAddButton, { backgroundColor: c.accentBg, borderColor: c.accentBorder }]}
                      onPress={() => selectRebuyForPlayer(playerProfile.id, playerProfile.name)}>
                      <Text style={[styles.quickAddLabel, { color: c.profit }]}>
                        + Add myself ({playerProfile.name})
                      </Text>
                    </Pressable>
                  )}
                  <View style={styles.inputRow}>
                    <TextInput
                      value={playerName}
                      onChangeText={onPlayerNameChange}
                      placeholder="Player name"
                      placeholderTextColor={c.placeholder}
                      onFocus={() => scrollModalFieldToTop(buyInScrollRef)}
                      style={[styles.input, { flex: 2, borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                    />
                    <View style={[styles.amountInputWrap, { borderColor: c.border, backgroundColor: c.inputBg }]}>
                      <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
                      <TextInput
                        ref={buyInAmountInputRef}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        placeholderTextColor={c.placeholder}
                        keyboardType="numeric"
                        style={[styles.amountInput, { color: c.text }]}
                      />
                    </View>
                  </View>
                  {(() => {
                    const sessionPlayerIds = new Set(players.map((p) => p.playerId));
                    const activePlayers = players.filter((p) => !earlyCashOutMap.has(p.playerId));
                    const friendsNotInSession = friends.filter((f) => !sessionPlayerIds.has(f.playerId));
                    const hasChips = activePlayers.length > 0 || friendsNotInSession.length > 0;
                    if (!hasChips) return null;
                    return (
                      <View style={styles.rebuyBlock}>
                        <ScrollView
                          horizontal
                          nestedScrollEnabled
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
                              style={[
                                styles.friendChip,
                                { backgroundColor: c.friendChipBg, borderColor: c.friendChipBorder },
                              ]}
                              onPress={() => selectRebuyForPlayer(f.playerId, f.name)}>
                              <MaterialIcons name="person-add" size={14} color={c.blue} />
                              <Text style={[styles.friendChipText, { color: c.blue }]}>{f.name}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    );
                  })()}
                </View>
              </ScrollView>
              <View style={styles.cashOutModalActions}>
                <Pressable style={styles.cashOutCancelBtn} onPress={closeBuyInEditor}>
                  <Text style={[styles.removePlayerLabel, { color: c.lossLight }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.cashOutConfirmBtn,
                    { backgroundColor: c.accent },
                    (isAdding || !playerName.trim() || !amount.trim()) && styles.disabled,
                  ]}
                  onPress={() => void confirmBuyInFromModal()}
                  disabled={isAdding || !playerName.trim() || !amount.trim()}>
                  {isAdding ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.addButtonLabel}>Add</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
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
              <View style={[styles.cashedOutDetailCard, { backgroundColor: c.card, borderColor: c.border }]}>
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

                {viewerIsHost ? (
                  <Pressable
                    style={[styles.cashedOutDetailBuyBackBtn, { backgroundColor: c.chipBg, borderColor: c.borderAmber }]}
                    onPress={() =>
                      confirmBuyBackIn(cashedOutDetailModal.playerId, cashedOutDetailModal.name)
                    }>
                    <MaterialIcons name="replay" size={18} color={c.warning} />
                    <Text style={[styles.cashedOutDetailBuyBackLabel, { color: c.warning }]}>Buy Back In</Text>
                  </Pressable>
                ) : null}
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
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            style={[styles.modalKeyboard, styles.sessionModalKav]}>
            <View style={[styles.cashOutForm, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.cashOutFormTitle, { color: c.text }]}>Edit location</Text>
              <ScrollView
                ref={locationScrollRef}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.sessionModalLocationScroll}
                contentContainerStyle={styles.sessionModalFieldsScrollContent}>
                <TextInput
                  value={locationDraft}
                  onChangeText={setLocationDraft}
                  placeholder="Location"
                  placeholderTextColor={c.placeholder}
                  onFocus={() => scrollModalFieldToTop(locationScrollRef)}
                  style={[
                    styles.input,
                    { borderColor: c.border, backgroundColor: c.inputBg, color: c.text },
                  ]}
                />
              </ScrollView>
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
                  {isSavingLocation ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.addButtonLabel}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>

    <Modal
      visible={blindsEditorVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeBlindsEditor}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
          onPress={closeBlindsEditor}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        />
        <View pointerEvents="box-none" style={styles.modalCenterWrap}>
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            style={[styles.modalKeyboard, styles.sessionModalKav]}>
            <View style={[styles.cashOutForm, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.cashOutFormTitle, { color: c.text }]}>Edit blinds</Text>
              <Text style={[styles.blindsModalHint, { color: c.textMuted }]}>
                Small and big blind are required. Big blind must be at least the small blind.
              </Text>
              <ScrollView
                ref={blindsScrollRef}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.sessionModalFieldsScroll}
                contentContainerStyle={styles.sessionModalFieldsScrollContent}>
                <View style={styles.blindsModalInputs}>
                  <View style={styles.blindsModalField}>
                    <View style={styles.blindsModalLabelRow}>
                      <Text style={[styles.blindsModalFieldLabel, { color: c.textHint }]}>Small blind</Text>
                      <Text style={[styles.blindsModalRequiredMark, { color: c.loss }]}>*</Text>
                    </View>
                    <View style={[styles.blindsModalAmountWrap, { borderColor: c.border, backgroundColor: c.inputBg }]}>
                      <Text style={[styles.blindsModalDollar, { color: c.textMuted }]}>$</Text>
                      <TextInput
                        value={smallBlindDraft}
                        onChangeText={setSmallBlindDraft}
                        placeholder="0"
                        placeholderTextColor={c.placeholder}
                        keyboardType="decimal-pad"
                        onFocus={() => scrollModalFieldToTop(blindsScrollRef)}
                        style={[styles.blindsModalTextInput, { color: c.text }]}
                      />
                    </View>
                  </View>
                  <View style={styles.blindsModalField}>
                    <View style={styles.blindsModalLabelRow}>
                      <Text style={[styles.blindsModalFieldLabel, { color: c.textHint }]}>Big blind</Text>
                      <Text style={[styles.blindsModalRequiredMark, { color: c.loss }]}>*</Text>
                    </View>
                    <View style={[styles.blindsModalAmountWrap, { borderColor: c.border, backgroundColor: c.inputBg }]}>
                      <Text style={[styles.blindsModalDollar, { color: c.textMuted }]}>$</Text>
                      <TextInput
                        value={bigBlindDraft}
                        onChangeText={setBigBlindDraft}
                        placeholder="0"
                        placeholderTextColor={c.placeholder}
                        keyboardType="decimal-pad"
                        onFocus={() => scrollModalFieldToEnd(blindsScrollRef)}
                        style={[styles.blindsModalTextInput, { color: c.text }]}
                      />
                    </View>
                  </View>
                </View>
              </ScrollView>
              <View style={styles.cashOutModalActions}>
                <Pressable style={styles.cashOutCancelBtn} onPress={closeBlindsEditor}>
                  <Text style={[styles.removePlayerLabel, { color: c.lossLight }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.cashOutConfirmBtn,
                    { backgroundColor: c.accent },
                    isBlindsSaveDisabled && styles.disabled,
                  ]}
                  onPress={() => void saveBlinds()}
                  disabled={isBlindsSaveDisabled}>
                  <Text style={styles.addButtonLabel}>{isSavingBlinds ? 'Saving...' : 'Save'}</Text>
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
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 2,
  },
  sessionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sessionHeaderLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  sessionHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  sessionHeaderBuyIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  sessionHeaderBuyInLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  metaSecondRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  potRowRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  blindsCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  blindsModalHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  blindsModalInputs: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  blindsModalField: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  blindsModalFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  blindsModalLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  blindsModalRequiredMark: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
  },
  blindsModalAmountWrap: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 2 : 6,
    minHeight: 40,
  },
  blindsModalDollar: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 4,
  },
  blindsModalTextInput: {
    flex: 1,
    minWidth: 0,
    minHeight: Platform.OS === 'android' ? 34 : 30,
    paddingVertical: Platform.OS === 'android' ? 4 : 2,
    paddingHorizontal: 4,
    fontSize: 13,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : {}),
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
  locationLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    minWidth: 0,
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
  ledgerLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -6,
    marginBottom: 4,
  },
  ledgerLegendSwatch: {
    width: 22,
    height: 14,
    borderRadius: 4,
    borderWidth: 2,
  },
  ledgerLegendText: {
    fontSize: 12,
    flex: 1,
  },
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
  /** Shared with Add Buy-In, Edit location, Edit blinds modals */
  sessionModalKav: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 360,
  },
  sessionModalLocationScroll: {
    width: '100%',
  },
  sessionModalFieldsScroll: {
    maxHeight: 260,
    width: '100%',
  },
  sessionModalFieldsScrollContent: {
    paddingBottom: 4,
  },
  buyInModalForm: {
    maxWidth: '100%',
  },
  buyInModalScroll: {
    maxHeight: 320,
    width: '100%',
  },
  buyInModalScrollContent: {
    paddingBottom: 4,
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
    fontSize: 18,
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
