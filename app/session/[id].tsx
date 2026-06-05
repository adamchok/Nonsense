import { SessionAmountPrefix } from '@/components/session-amount-prefix';
import { SessionAmountDisplay, SessionAmountInputRow } from '@/components/session-amount-ui';
import { AVATAR_EMOJIS } from '@/constants/avatar';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import {
  formatBlindChipStakeNumber,
  formatBlinds,
  formatBlindsChips,
  formatCompactCurrency,
} from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import { getFirestoreDb } from '@/lib/firebase';
import {
  addBuyIn,
  deleteSession,
  removeEarlyCashOut,
  removePlayerBuyIns,
  saveEarlyCashOut,
  subscribeBuyIns,
  subscribeEarlyCashOuts,
  subscribeFriends,
  updatePlayerBuyInTotal,
  updateSessionBlinds,
  updateSessionDollarsPerChip,
  updateSessionLocation,
} from '@/lib/firestore';
import { scrollModalFieldToEnd, scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import type { BuyIn, EarlyCashOut, FriendRecord, SessionAmountUnit } from '@/types';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

type SessionView = {
  hostId?: string;
  date?: Date;
  location?: string;
  smallBlind?: number;
  bigBlind?: number;
  amountUnit: SessionAmountUnit;
  dollarsPerChip?: number;
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

function sessionBlindsAreSet(session: SessionView | null): boolean {
  if (!session) return false;
  if (session.amountUnit === 'chips') {
    return formatBlindsChips(session.smallBlind, session.bigBlind) != null;
  }
  return formatBlinds(session.smallBlind, session.bigBlind) != null;
}

function BlindsMetaLine({
  session,
  textSecondary,
}: {
  session: SessionView;
  textSecondary: string;
}) {
  if (session.amountUnit === 'chips') {
    const s = session.smallBlind;
    const b = session.bigBlind;
    if (s == null || b == null || !Number.isFinite(s) || !Number.isFinite(b) || s <= 0 || b < s) {
      return (
        <Text style={[styles.locationValue, { color: textSecondary }]} numberOfLines={1}>
          Tap to add blinds
        </Text>
      );
    }
    return (
      <View style={styles.blindsChipsMetaRow}>
        <SessionAmountPrefix unit="chips" color={textSecondary} size={14} />
        <Text style={[styles.locationValue, { color: textSecondary }]} numberOfLines={1}>
          {formatBlindChipStakeNumber(s)}
        </Text>
        <Text style={[styles.locationValue, { color: textSecondary }]}> / </Text>
        <SessionAmountPrefix unit="chips" color={textSecondary} size={14} />
        <Text style={[styles.locationValue, { color: textSecondary }]} numberOfLines={1}>
          {formatBlindChipStakeNumber(b)}
        </Text>
      </View>
    );
  }
  const line = formatBlinds(session.smallBlind, session.bigBlind);
  return (
    <Text style={[styles.locationValue, { color: textSecondary }]} numberOfLines={1}>
      {line ?? 'Tap to add blinds'}
    </Text>
  );
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
  const chipValueScrollRef = useRef<ScrollView>(null);
  /** Ledger row tap → early cash-out detail modal (buy back in lives in modal). */
  const [cashedOutDetailPlayerId, setCashedOutDetailPlayerId] = useState<string | null>(null);
  const [locationEditorVisible, setLocationEditorVisible] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [blindsEditorVisible, setBlindsEditorVisible] = useState(false);
  const [smallBlindDraft, setSmallBlindDraft] = useState('');
  const [bigBlindDraft, setBigBlindDraft] = useState('');
  const [chipValueEditorVisible, setChipValueEditorVisible] = useState(false);
  const [dollarsPerChipDraft, setDollarsPerChipDraft] = useState('');
  const [isSavingBlinds, setIsSavingBlinds] = useState(false);
  const [isSavingChipValue, setIsSavingChipValue] = useState(false);
  /** Chip sessions with dollars per chip: ledger section switch toggles chip vs dollar display for all rows. */
  const [ledgerShowDollars, setLedgerShowDollars] = useState(false);
  const [editBuyInTarget, setEditBuyInTarget] = useState<{
    playerId: string;
    playerName: string;
    currentTotal: number;
  } | null>(null);
  const [editBuyInAmount, setEditBuyInAmount] = useState('');
  const [isSavingEditBuyIn, setIsSavingEditBuyIn] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

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
        const amountUnit: SessionAmountUnit = data.amountUnit === 'chips' ? 'chips' : 'cash';
        const rawDpc = data.dollarsPerChip;
        const dpcParsed = typeof rawDpc === 'number' ? rawDpc : Number(rawDpc);
        const dollarsPerChip =
          amountUnit === 'chips' && Number.isFinite(dpcParsed) && dpcParsed > 0 ? dpcParsed : undefined;
        setSession({
          hostId: data.hostId ? String(data.hostId) : undefined,
          date: toDate(data.date ?? data.createdAt),
          location: data.location ? String(data.location) : undefined,
          ...sessionBlindsFromData(data),
          amountUnit,
          ...(dollarsPerChip != null ? { dollarsPerChip } : {}),
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
    return AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length];
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

  const earlyCashOutResultDelta = cashedOutDetailModal
    ? cashedOutDetailModal.cashOut.amount - cashedOutDetailModal.totalBuyIn
    : 0;
  const earlyCashOutResultColor = earlyCashOutResultDelta >= 0 ? c.profit : c.lossLight;

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
    if (!sessionBlindsAreSet(session)) {
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

  function openChipValueEditor() {
    setDollarsPerChipDraft(
      session?.dollarsPerChip != null && Number.isFinite(session.dollarsPerChip)
        ? String(session.dollarsPerChip)
        : ''
    );
    setChipValueEditorVisible(true);
  }

  function closeChipValueEditor() {
    Keyboard.dismiss();
    setChipValueEditorVisible(false);
    setDollarsPerChipDraft('');
  }

  async function saveChipValue() {
    if (!viewerIsHost) {
      appAlert('Host only', 'Only the host can edit dollars per chip.');
      return;
    }
    if (!id) return;
    const dpcTrim = dollarsPerChipDraft.trim();
    const dpc = parseFloat(dpcTrim);
    if (!dpcTrim || Number.isNaN(dpc) || dpc <= 0) {
      appAlert(
        'Chip value required',
        'Enter how much each chip is worth in dollars (e.g. 0.50 for a $50 buy-in of 100 chips).'
      );
      return;
    }
    try {
      setIsSavingChipValue(true);
      await updateSessionDollarsPerChip(id, dpc);
      closeChipValueEditor();
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to update dollars per chip.');
    } finally {
      setIsSavingChipValue(false);
    }
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

  function openEditBuyIn(playerId: string, playerName: string, currentTotal: number) {
    setEditBuyInTarget({ playerId, playerName, currentTotal });
    setEditBuyInAmount(String(currentTotal));
  }

  function closeEditBuyIn() {
    Keyboard.dismiss();
    setEditBuyInTarget(null);
    setEditBuyInAmount('');
  }

  async function saveEditBuyIn() {
    if (!viewerIsHost || !id || !editBuyInTarget) return;
    const parsed = parseFloat(editBuyInAmount.trim());
    if (isNaN(parsed) || parsed <= 0) {
      appAlert('Invalid amount', 'Enter a positive number.');
      return;
    }
    try {
      setIsSavingEditBuyIn(true);
      await updatePlayerBuyInTotal(id, editBuyInTarget.playerId, editBuyInTarget.playerName, parsed);
      closeEditBuyIn();
    } catch (e) {
      appAlert('Error', e instanceof Error ? e.message : 'Failed to update buy-in.');
    } finally {
      setIsSavingEditBuyIn(false);
    }
  }

  function handleDeleteSession() {
    if (!viewerIsHost || !id) return;
    appAlert(
      'Delete Session?',
      'This will permanently delete the session and all buy-in data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingSession(true);
              await deleteSession(id);
              router.replace('/(tabs)');
            } catch (e) {
              setIsDeletingSession(false);
              appAlert('Error', e instanceof Error ? e.message : 'Failed to delete session.');
            }
          },
        },
      ]
    );
  }

  const sessionAmountUnit = session?.amountUnit ?? 'cash';
  const ledgerCanToggleDollars =
    sessionAmountUnit === 'chips' &&
    session?.dollarsPerChip != null &&
    Number.isFinite(session.dollarsPerChip) &&
    session.dollarsPerChip > 0;
  /** Host always sees location/blinds cards; participants see them when the host has set values. */
  const showSessionMetaCards = Boolean(
    viewerIsHost ||
      sessionBlindsAreSet(session) ||
      Boolean(session?.location?.trim()) ||
      session?.amountUnit === 'chips'
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
  const chipValueDraftTrim = dollarsPerChipDraft.trim();
  const chipValueDraftNum = parseFloat(chipValueDraftTrim);
  const isChipValueSaveValid =
    Boolean(chipValueDraftTrim) && !Number.isNaN(chipValueDraftNum) && chipValueDraftNum > 0;
  const isChipValueSaveDisabled = isSavingChipValue || !isChipValueSaveValid;

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
            <SessionAmountDisplay
              value={totalPot}
              unit={sessionAmountUnit}
              color={c.profit}
              iconSize={14}
              valueStyle="compact"
              textStyle={[styles.potValue, { color: c.profit }]}
              rowStyle={styles.potValueRow}
            />
          </View>
        </View>
      </View>
      {showSessionMetaCards ? (
        <View style={styles.metaSessionCards}>
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
                    {session ? (
                      <BlindsMetaLine session={session} textSecondary={c.textSecondary} />
                    ) : (
                      <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={1}>
                        Tap to add blinds
                      </Text>
                    )}
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
                {session && sessionBlindsAreSet(session) ? (
                  <View style={[styles.blindsCard, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={styles.locationTextBlock}>
                      <View style={styles.locationLabelRow}>
                        <MaterialIcons name="payments" size={14} color={c.textHint} />
                        <Text style={[styles.locationLabel, { color: c.textHint }]}>BLINDS</Text>
                      </View>
                      <BlindsMetaLine session={session} textSecondary={c.textSecondary} />
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>
          {session?.amountUnit === 'chips' ? (
            viewerIsHost ? (
              <Pressable
                onPress={openChipValueEditor}
                style={[
                  styles.blindsCard,
                  styles.metaChipValueFullRow,
                  { backgroundColor: c.card, borderColor: c.border },
                ]}>
                <View style={styles.locationTextBlock}>
                  <View style={styles.locationLabelRow}>
                    <MaterialIcons name="attach-money" size={14} color={c.textHint} />
                    <Text style={[styles.locationLabel, { color: c.textHint }]}>DOLLARS PER CHIP</Text>
                  </View>
                  <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={1}>
                    {session.dollarsPerChip != null && Number.isFinite(session.dollarsPerChip)
                      ? formatCompactCurrency(session.dollarsPerChip)
                      : 'Tap to set'}
                  </Text>
                </View>
                <MaterialIcons name="edit" size={18} color={c.textHint} />
              </Pressable>
            ) : (
              <View
                style={[styles.blindsCard, styles.metaChipValueFullRow, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.locationTextBlock}>
                  <View style={styles.locationLabelRow}>
                    <MaterialIcons name="attach-money" size={14} color={c.textHint} />
                    <Text style={[styles.locationLabel, { color: c.textHint }]}>DOLLARS PER CHIP</Text>
                  </View>
                  <Text style={[styles.locationValue, { color: c.textSecondary }]} numberOfLines={1}>
                    {session.dollarsPerChip != null && Number.isFinite(session.dollarsPerChip)
                      ? formatCompactCurrency(session.dollarsPerChip)
                      : '—'}
                  </Text>
                </View>
              </View>
            )
          ) : null}
        </View>
      ) : null}
      {error ? <Text style={[styles.error, { color: c.loss }]}>{error}</Text> : null}
      {session?.status === 'active' && !viewerIsHost && (
        <Text style={[styles.emptyText, { color: c.textMuted }]}>
          View-only mode: only the host can add buy-ins, cash out players, edit location, blinds, dollars per chip, or
          end the session.
        </Text>
      )}

      <View style={styles.ledgerSectionHeader}>
        <View style={styles.ledgerSectionTitle}>
          <Text style={[styles.sectionTitle, { color: c.text }]} numberOfLines={1}>
            Buy-In Ledger ({players.length})
          </Text>
          {players.length > 0 && session?.hostId ? (
            <View style={styles.ledgerLegendRow}>
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
          {viewerIsHost && session?.status === 'active' && players.length > 0 ? (
            <Text style={[styles.ledgerTapHint, { color: c.textHint }]}>
              Tap a player to edit their buy-in.
            </Text>
          ) : null}
        </View>
        {ledgerCanToggleDollars ? (
          <View style={styles.ledgerSwitchRow}>
            <MaterialCommunityIcons name="poker-chip" size={14} color={c.textHint} />
            <Switch
              value={ledgerShowDollars}
              onValueChange={setLedgerShowDollars}
              trackColor={{ false: c.switchTrackOff, true: c.switchTrackOn }}
              thumbColor={c.switchThumb}
              accessibilityLabel={ledgerShowDollars ? 'Show buy-in ledger in chips' : 'Show buy-in ledger in dollars'}
            />
            <Text style={[styles.ledgerSwitchSideLabel, { color: c.textHint }]}>$</Text>
          </View>
        ) : null}
      </View>
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
            const dpc = session?.dollarsPerChip;
            const showLedgerDollars = ledgerCanToggleDollars && ledgerShowDollars;
            const ledgerDisplayUnit: SessionAmountUnit = showLedgerDollars ? 'cash' : sessionAmountUnit;
            const buyInLedgerValue =
              showLedgerDollars && dpc != null ? item.total * dpc : item.total;
            const cashOutLedgerValue =
              cashOut && showLedgerDollars && dpc != null ? cashOut.amount * dpc : cashOut?.amount ?? 0;
            const resultLedgerValue =
              cashOut && showLedgerDollars && dpc != null
                ? (cashOut.amount - item.total) * dpc
                : cashOut
                  ? cashOut.amount - item.total
                  : 0;

            const amountsBlock = (
              <View style={styles.playerAmounts}>
                <SessionAmountDisplay
                  value={buyInLedgerValue}
                  unit={ledgerDisplayUnit}
                  color={isCashedOut ? c.textMuted : c.profit}
                  iconSize={14}
                  valueStyle="ledger"
                  textStyle={[styles.playerAmount, { color: isCashedOut ? c.textMuted : c.profit }]}
                />
                {isCashedOut && cashOut ? (
                  <View style={styles.ledgerCashOutSubline}>
                    <Text style={[styles.cashOutResult, { color: c.textMuted }]}>Out:</Text>
                    <SessionAmountDisplay
                      value={cashOutLedgerValue}
                      unit={ledgerDisplayUnit}
                      color={c.textMuted}
                      iconSize={12}
                      valueStyle="ledger"
                      textStyle={[styles.cashOutResult, { color: c.textMuted }]}
                    />
                    <Text style={[styles.cashOutResult, { color: c.textMuted }]}>(</Text>
                    {resultLedgerValue >= 0 ? (
                      <Text
                        style={[
                          styles.cashOutResult,
                          { color: resultLedgerValue >= 0 ? c.profit : c.lossLight },
                        ]}>
                        +
                      </Text>
                    ) : null}
                    <SessionAmountDisplay
                      value={resultLedgerValue}
                      unit={ledgerDisplayUnit}
                      color={resultLedgerValue >= 0 ? c.profit : c.lossLight}
                      iconSize={12}
                      valueStyle="ledger"
                      textStyle={[
                        styles.cashOutResult,
                        { color: resultLedgerValue >= 0 ? c.profit : c.lossLight },
                      ]}
                    />
                    <Text style={[styles.cashOutResult, { color: c.textMuted }]}>)</Text>
                  </View>
                ) : null}
              </View>
            );

            const rowInner = (
              <>
                <View style={styles.playerRowLeft}>
                  <View style={styles.playerInfo}>
                    {!isCashedOut ? (
                      <View style={styles.playerInfoInline}>
                        <Text style={styles.playerAvatarEmoji}>{getAvatarEmoji(item.playerId)}</Text>
                        <Text
                          style={[styles.playerName, styles.playerNameInline, { color: c.text }]}
                          numberOfLines={1}>
                          {item.name}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.playerInfoInline}>
                          <Text style={styles.playerAvatarEmoji}>{getAvatarEmoji(item.playerId)}</Text>
                          <Text style={[styles.playerName, styles.playerNameInline, { color: c.textMuted }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                        </View>
                        <View style={styles.badges}>
                          <View style={[styles.cashedOutBadge, { backgroundColor: c.badge.cashedOut }]}>
                            <Text style={styles.badgeText}>CASHED OUT</Text>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                  {amountsBlock}
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

            const tapEditRow = viewerIsHost && session?.status === 'active' && !isCashedOut;

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

            if (tapEditRow) {
              return (
                <Pressable
                  key={item.playerId}
                  style={({ pressed }) => [...(Array.isArray(rowStyle) ? rowStyle.flat() : [rowStyle]), pressed && { opacity: 0.85 }]}
                  onPress={() => openEditBuyIn(item.playerId, item.name, item.total)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit buy-in for ${item.name}`}>
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
        {viewerIsHost && session?.status === 'active' && (
          <Pressable
            style={[styles.deleteSessionBtn, { borderColor: c.borderDanger }]}
            onPress={handleDeleteSession}
            disabled={isDeletingSession}>
            {isDeletingSession ? (
              <ActivityIndicator size="small" color={c.lossLight} />
            ) : (
              <Text style={[styles.deleteSessionLabel, { color: c.lossLight }]}>Delete Session</Text>
            )}
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
                <View style={styles.modalBuyInTotalRow}>
                  <Text style={[styles.cashOutFormSub, { color: c.textMuted }]}>Buy-in total: </Text>
                  <SessionAmountDisplay
                    value={cashOutTarget.totalBuyIn}
                    unit={sessionAmountUnit}
                    color={c.textMuted}
                    iconSize={14}
                    valueStyle="ledger"
                    textStyle={[styles.cashOutFormSub, { color: c.textMuted }]}
                  />
                </View>
                <View style={styles.cashOutInputRow}>
                  <SessionAmountInputRow
                    unit={sessionAmountUnit}
                    color={c.textMuted}
                    iconSize={16}
                    style={[
                      styles.amountInputWrap,
                      styles.cashOutModalAmountWrap,
                      { borderColor: c.border, backgroundColor: c.inputBg },
                    ]}>
                    <TextInput
                      value={cashOutAmount}
                      onChangeText={setCashOutAmount}
                      placeholder={sessionAmountUnit === 'chips' ? 'Chips' : '0.00'}
                      placeholderTextColor={c.placeholder}
                      keyboardType="numeric"
                      style={[styles.amountInput, { color: c.text }]}
                    />
                  </SessionAmountInputRow>
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
                {sessionAmountUnit === 'chips'
                  ? 'Enter name and chip amount, or pick a player below.'
                  : 'Enter name and amount, or pick a player below.'}
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
                    <SessionAmountInputRow
                      unit={sessionAmountUnit}
                      color={c.textMuted}
                      iconSize={16}
                      style={[styles.amountInputWrap, { borderColor: c.border, backgroundColor: c.inputBg }]}>
                      <TextInput
                        ref={buyInAmountInputRef}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder={sessionAmountUnit === 'chips' ? 'Chips' : '0.00'}
                        placeholderTextColor={c.placeholder}
                        keyboardType="numeric"
                        style={[styles.amountInput, { color: c.text }]}
                      />
                    </SessionAmountInputRow>
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
                    <View style={styles.cashOutDetailValueCol}>
                      <SessionAmountDisplay
                        value={cashedOutDetailModal.totalBuyIn}
                        unit={sessionAmountUnit}
                        color={c.textSecondary}
                        iconSize={14}
                        valueStyle="ledger"
                        textStyle={[styles.cashOutDetailValue, { color: c.textSecondary }]}
                        rowStyle={styles.cashOutDetailValueRowEnd}
                      />
                    </View>
                  </View>
                  <View style={styles.cashOutDetailRow}>
                    <Text style={[styles.cashOutDetailLabel, { color: c.textMuted }]}>Cashed out</Text>
                    <View style={styles.cashOutDetailValueCol}>
                      <SessionAmountDisplay
                        value={cashedOutDetailModal.cashOut.amount}
                        unit={sessionAmountUnit}
                        color={c.textSecondary}
                        iconSize={14}
                        valueStyle="ledger"
                        textStyle={[styles.cashOutDetailValue, { color: c.textSecondary }]}
                        rowStyle={styles.cashOutDetailValueRowEnd}
                      />
                    </View>
                  </View>
                  <View style={styles.cashOutDetailRow}>
                    <Text style={[styles.cashOutDetailLabel, { color: c.textMuted }]}>Result</Text>
                    <View style={[styles.cashOutDetailValueCol, styles.cashOutDetailResultValue]}>
                      {earlyCashOutResultDelta >= 0 ? (
                        <Text style={[styles.cashOutDetailValue, { color: c.profit }]}>+</Text>
                      ) : null}
                      <SessionAmountDisplay
                        value={earlyCashOutResultDelta}
                        unit={sessionAmountUnit}
                        color={earlyCashOutResultColor}
                        iconSize={14}
                        valueStyle="ledger"
                        textStyle={[styles.cashOutDetailValue, { color: earlyCashOutResultColor }]}
                        rowStyle={styles.cashOutDetailValueRowEnd}
                      />
                    </View>
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
      visible={chipValueEditorVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeChipValueEditor}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
          onPress={closeChipValueEditor}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        />
        <View pointerEvents="box-none" style={styles.modalCenterWrap}>
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            style={[styles.modalKeyboard, styles.sessionModalKav]}>
            <View style={[styles.cashOutForm, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.cashOutFormTitle, { color: c.text }]}>Dollars per chip</Text>
              <Text style={[styles.blindsModalHint, { color: c.textMuted }]}>
                Used to show dollar equivalents for chip stacks, blinds, and the ledger. Buy-ins and cash-outs stay in
                chips.
              </Text>
              <ScrollView
                ref={chipValueScrollRef}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.sessionModalLocationScroll}
                contentContainerStyle={styles.sessionModalFieldsScrollContent}>
                <View style={styles.chipValueModalField}>
                  <View style={styles.blindsModalLabelRow}>
                    <Text style={[styles.blindsModalFieldLabel, { color: c.textHint }]}>Dollar per chip</Text>
                    <Text style={[styles.blindsModalRequiredMark, { color: c.loss }]}>*</Text>
                  </View>
                  <View
                    style={[
                      styles.blindsModalAmountWrap,
                      { borderColor: c.border, backgroundColor: c.inputBg },
                    ]}>
                    <Text style={[styles.chipValueModalDollarSign, { color: c.textMuted }]}>$</Text>
                    <TextInput
                      value={dollarsPerChipDraft}
                      onChangeText={setDollarsPerChipDraft}
                      placeholder="0.50"
                      placeholderTextColor={c.placeholder}
                      keyboardType="decimal-pad"
                      onFocus={() => scrollModalFieldToTop(chipValueScrollRef)}
                      style={[styles.blindsModalTextInput, { color: c.text }]}
                    />
                  </View>
                  <Text style={[styles.chipValueModalExample, { color: c.textHint }]}>
                    Example: 100 chips for a $50 buy-in → $0.50 per chip.
                  </Text>
                </View>
              </ScrollView>
              <View style={styles.cashOutModalActions}>
                <Pressable style={styles.cashOutCancelBtn} onPress={closeChipValueEditor}>
                  <Text style={[styles.removePlayerLabel, { color: c.lossLight }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.cashOutConfirmBtn,
                    { backgroundColor: c.accent },
                    isChipValueSaveDisabled && styles.disabled,
                  ]}
                  onPress={() => void saveChipValue()}
                  disabled={isChipValueSaveDisabled}>
                  {isSavingChipValue ? (
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
      visible={!!editBuyInTarget}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeEditBuyIn}>
      {editBuyInTarget ? (
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={closeEditBuyIn}
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
                  Edit buy-in: {editBuyInTarget.playerName}
                </Text>
                <View style={styles.modalBuyInTotalRow}>
                  <Text style={[styles.cashOutFormSub, { color: c.textMuted }]}>Current total: </Text>
                  <SessionAmountDisplay
                    value={editBuyInTarget.currentTotal}
                    unit={sessionAmountUnit}
                    color={c.textMuted}
                    iconSize={14}
                    valueStyle="ledger"
                    textStyle={[styles.cashOutFormSub, { color: c.textMuted }]}
                  />
                </View>
                <View style={styles.cashOutInputRow}>
                  <SessionAmountInputRow
                    unit={sessionAmountUnit}
                    color={c.textMuted}
                    iconSize={16}
                    style={[
                      styles.amountInputWrap,
                      styles.cashOutModalAmountWrap,
                      { borderColor: c.border, backgroundColor: c.inputBg },
                    ]}>
                    <TextInput
                      value={editBuyInAmount}
                      onChangeText={setEditBuyInAmount}
                      placeholder={sessionAmountUnit === 'chips' ? 'Chips' : '0.00'}
                      placeholderTextColor={c.placeholder}
                      keyboardType="numeric"
                      style={[styles.amountInput, { color: c.text }]}
                      autoFocus
                    />
                  </SessionAmountInputRow>
                </View>
                <View style={styles.cashOutModalActions}>
                  <Pressable style={styles.cashOutCancelBtn} onPress={closeEditBuyIn}>
                    <Text style={[styles.removePlayerLabel, { color: c.lossLight }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.cashOutConfirmBtn,
                      { backgroundColor: c.accent },
                      (isSavingEditBuyIn || !editBuyInAmount.trim()) && styles.disabled,
                    ]}
                    onPress={() => void saveEditBuyIn()}
                    disabled={isSavingEditBuyIn || !editBuyInAmount.trim()}>
                    {isSavingEditBuyIn ? (
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
      ) : null}
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
                {sessionAmountUnit === 'chips'
                  ? 'Enter blinds in chips. Big blind must be at least the small blind.'
                  : 'Small and big blind are required. Big blind must be at least the small blind.'}
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
                    <SessionAmountInputRow
                      unit={sessionAmountUnit}
                      color={c.textMuted}
                      iconSize={16}
                      style={[
                        styles.blindsModalAmountWrap,
                        { borderColor: c.border, backgroundColor: c.inputBg },
                      ]}>
                      <TextInput
                        value={smallBlindDraft}
                        onChangeText={setSmallBlindDraft}
                        placeholder="0"
                        placeholderTextColor={c.placeholder}
                        keyboardType="decimal-pad"
                        onFocus={() => scrollModalFieldToTop(blindsScrollRef)}
                        style={[styles.blindsModalTextInput, { color: c.text }]}
                      />
                    </SessionAmountInputRow>
                  </View>
                  <View style={styles.blindsModalField}>
                    <View style={styles.blindsModalLabelRow}>
                      <Text style={[styles.blindsModalFieldLabel, { color: c.textHint }]}>Big blind</Text>
                      <Text style={[styles.blindsModalRequiredMark, { color: c.loss }]}>*</Text>
                    </View>
                    <SessionAmountInputRow
                      unit={sessionAmountUnit}
                      color={c.textMuted}
                      iconSize={16}
                      style={[
                        styles.blindsModalAmountWrap,
                        { borderColor: c.border, backgroundColor: c.inputBg },
                      ]}>
                      <TextInput
                        value={bigBlindDraft}
                        onChangeText={setBigBlindDraft}
                        placeholder="0"
                        placeholderTextColor={c.placeholder}
                        keyboardType="decimal-pad"
                        onFocus={() => scrollModalFieldToEnd(blindsScrollRef)}
                        style={[styles.blindsModalTextInput, { color: c.text }]}
                      />
                    </SessionAmountInputRow>
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
  metaSessionCards: {
    width: '100%',
    gap: 10,
  },
  metaSecondRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  metaChipValueFullRow: {
    flex: 0,
    alignSelf: 'stretch',
    width: '100%',
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
  chipValueModalField: {
    gap: 6,
    alignSelf: 'stretch',
  },
  chipValueModalDollarSign: {
    fontSize: 15,
    fontWeight: '600',
  },
  chipValueModalExample: {
    fontSize: 11,
    lineHeight: 15,
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
  blindsModalTextInput: {
    flex: 1,
    minWidth: 0,
    minHeight: Platform.OS === 'android' ? 34 : 30,
    paddingVertical: Platform.OS === 'android' ? 4 : 2,
    paddingHorizontal: 4,
    fontSize: 13,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : {}),
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
  potValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  blindsChipsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    minWidth: 0,
  },
  error: {},
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
    marginTop: 6,
  },
  ledgerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  ledgerSectionTitle: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ledgerSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  ledgerSwitchSideLabel: {
    fontSize: 11,
    fontWeight: '600',
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
  amountInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  addButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
  emptyText: {},
  ledgerLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  ledgerTapHint: {
    fontSize: 11,
    fontStyle: 'italic',
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
    gap: 10,
    minWidth: 0,
  },
  playerAvatarEmoji: {
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 0,
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
  ledgerCashOutSubline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
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
  cashOutDetailValueCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '55%',
  },
  cashOutDetailValueRowEnd: {
    justifyContent: 'flex-end',
  },
  cashOutDetailResultValue: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
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
  modalBuyInTotalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 4,
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
  deleteSessionBtn: {
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
  },
  deleteSessionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryButton: {
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
});
