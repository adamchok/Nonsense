import { text } from '@/lib/ui';
import { ModalBackdrop } from '@/components/modal-backdrop';
import { GroupMemberAvatar } from '@/components/group-member-avatar';
import { SessionAmountInputRow } from '@/components/session-amount-ui';
import { appAlert } from '@/lib/app-alert';
import { FieldError, errorBorder, invalidProps } from '@/components/field-error';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { createSession, getGroupMembers, getSavedLocations, subscribeGroups } from '@/lib/firestore';
import { parseAmount, sanitizeAmountInput } from '@/lib/parse-amount';
import type { GroupMember, PokerGroup, SavedLocation, SessionAmountUnit } from '@/types';
import { Icon } from '@/components/icon';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userMessage } from '@/lib/user-message';
import { SegmentedTabs, type SegmentedTab } from '@/components/segmented-tabs';
import { AppSwitch } from '@/components/app-switch';
import { Animated, PressableScale, fadeIn, fadeOut, layoutTransition, listItemEntering } from '@/components/motion';

const AMOUNT_UNIT_TABS: readonly SegmentedTab<SessionAmountUnit>[] = [
  { key: 'cash', label: 'Cash', icon: 'payments' },
  { key: 'chips', label: 'Chips', icon: 'poker-chip' },
];

const SCREEN_CONTENT_PADDING_BOTTOM = 32;

type FormErrors = {
  dollarsPerChip?: string;
  smallBlind?: string;
  bigBlind?: string;
  groupBuyIn?: string;
  buyIn?: string;
};

export default function NewSessionScreen() {
  const c = useAppColors();
  const { gutter } = usePageLayout();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { playerProfile } = useAuth();
  const [otherLocation, setOtherLocation] = useState('');
  const [joinSelf, setJoinSelf] = useState(true);
  const [buyInAmount, setBuyInAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [groups, setGroups] = useState<PokerGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<PokerGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupBuyIn, setGroupBuyIn] = useState('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [selectedSavedLocationId, setSelectedSavedLocationId] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationMode, setLocationMode] = useState<'saved' | 'other'>('saved');
  const [smallBlindStr, setSmallBlindStr] = useState('');
  const [bigBlindStr, setBigBlindStr] = useState('');
  const [amountUnit, setAmountUnit] = useState<SessionAmountUnit>('cash');
  const [dollarsPerChipStr, setDollarsPerChipStr] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const hasSavedLocations = savedLocations.length > 0;
  const isChipsMode = amountUnit === 'chips';

  const userInSelectedGroup =
    Boolean(selectedGroup && playerProfile) &&
    groupMembers.some((m) => m.id === playerProfile?.id);

  const shouldShowJoinAsPlayer = !selectedGroup || !userInSelectedGroup;

  useEffect(() => {
    if (!playerProfile) return;
    return subscribeGroups(playerProfile.id, setGroups, () => {});
  }, [playerProfile]);

  useEffect(() => {
    if (!playerProfile) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getSavedLocations(playerProfile.id);
        if (!cancelled) setSavedLocations(data);
      } catch {
        if (!cancelled) setSavedLocations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerProfile]);

  useEffect(() => {
    if (!hasSavedLocations) {
      setLocationMode('saved');
      setSelectedSavedLocationId(null);
    }
  }, [hasSavedLocations]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardHeight(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardHeight(0);
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  function scrollLowerFormIntoView() {
    requestAnimationFrame(() => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    });
  }

  function clearError(key: keyof FormErrors) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function onChangeAmountUnit(unit: SessionAmountUnit) {
    setAmountUnit(unit);
    setErrors({});
  }

  function onSelectSavedLocation(item: SavedLocation) {
    setLocationMode('saved');
    setSelectedSavedLocationId(item.id);
    setShowLocationPicker(false);
  }

  function onSelectOtherLocation() {
    setLocationMode('other');
    setSelectedSavedLocationId(null);
    setShowLocationPicker(false);
  }

  function getSelectedSavedLocationName(): string | undefined {
    if (!selectedSavedLocationId) return undefined;
    return savedLocations.find((l) => l.id === selectedSavedLocationId)?.name;
  }

  async function handleSelectGroup(group: PokerGroup) {
    if (!playerProfile) return;
    setSelectedGroup(group);
    setShowGroupPicker(false);
    try {
      const members = await getGroupMembers(playerProfile.id, group.id);
      setGroupMembers(members);
    } catch {
      setGroupMembers([]);
    }
  }

  function clearGroup() {
    setSelectedGroup(null);
    setGroupMembers([]);
    setGroupBuyIn('');
    clearError('groupBuyIn');
  }

  async function onCreate() {
    if (!playerProfile) {
      appAlert('Setup required', 'Please complete your display name first.');
      router.replace('../../(auth)/name');
      return;
    }

    let membersForCreate = groupMembers;
    if (selectedGroup && playerProfile) {
      try {
        membersForCreate = await getGroupMembers(playerProfile.id, selectedGroup.id);
        setGroupMembers(membersForCreate);
      } catch {
      }
    }

    const userInGroupForCreate =
      Boolean(selectedGroup && playerProfile) &&
      membersForCreate.some((m) => m.id === playerProfile.id);

    const shouldAddGroupMembers = Boolean(selectedGroup && membersForCreate.length > 0);
    const shouldAddSelf = joinSelf && (!selectedGroup || !userInGroupForCreate);

    const initialBuyIns: { playerId: string; playerName: string; amount: number }[] = [];
    const nextErrors: FormErrors = {};

    let dollarsPerChip: number | undefined;
    if (isChipsMode) {
      const dpc = parseAmount(dollarsPerChipStr.trim());
      if (dpc == null || dpc <= 0) {
        nextErrors.dollarsPerChip = 'Enter what one chip is worth';
      } else {
        dollarsPerChip = dpc;
      }
    }

    const sb = parseAmount(smallBlindStr.trim());
    const bb = parseAmount(bigBlindStr.trim());
    if (sb == null || sb <= 0) {
      nextErrors.smallBlind = 'Enter the small blind';
    }
    if (bb == null || bb <= 0) {
      nextErrors.bigBlind = 'Enter the big blind';
    } else if (sb != null && sb > 0 && bb < sb) {
      nextErrors.bigBlind = 'Big blind must be at least the small blind';
    }

    if (shouldAddGroupMembers) {
      const parsed = parseAmount(groupBuyIn);
      if (parsed == null || parsed <= 0) {
        nextErrors.groupBuyIn = isChipsMode
          ? 'Enter the chips each player buys in for'
          : 'Enter the buy-in per player';
      } else {
        for (const member of membersForCreate) {
          initialBuyIns.push({ playerId: member.id, playerName: member.name, amount: parsed });
        }
      }
    }

    if (shouldAddSelf) {
      const parsed = parseAmount(buyInAmount);
      if (parsed == null || parsed <= 0) {
        nextErrors.buyIn = isChipsMode ? 'Enter your chip buy-in' : 'Enter your buy-in';
      } else {
        initialBuyIns.push({
          playerId: playerProfile.id,
          playerName: playerProfile.name,
          amount: parsed,
        });
      }
    }

    setErrors(nextErrors);
    if (sb == null || bb == null || Object.keys(nextErrors).length > 0) {
      if (nextErrors.dollarsPerChip || nextErrors.smallBlind || nextErrors.bigBlind) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        scrollLowerFormIntoView();
      }
      return;
    }

    const selectedLocation =
      hasSavedLocations && locationMode === 'saved'
        ? (getSelectedSavedLocationName() ?? '')
        : otherLocation.trim();

    try {
      setIsSaving(true);
      const sessionId = await createSession({
        hostId: playerProfile.id,
        hostName: playerProfile.name,
        location: selectedLocation,
        smallBlind: sb,
        bigBlind: bb,
        amountUnit,
        ...(isChipsMode && dollarsPerChip != null ? { dollarsPerChip } : {}),
        initialBuyIns,
      });

      router.replace(`/session/${sessionId}`);
    } catch (error) {
      appAlert(
        'Unable to create session',
        userMessage(error, 'Please try again.')
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
        <ScrollView
          ref={scrollRef}
          style={[styles.screen, { backgroundColor: c.bg }]}
          contentContainerStyle={[
            styles.screenContent,
            {
              paddingHorizontal: gutter,
              paddingBottom: SCREEN_CONTENT_PADDING_BOTTOM + keyboardHeight + insets.bottom,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
            <Animated.View
              entering={listItemEntering(0)}
              layout={layoutTransition}
              style={[styles.amountModeCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.amountModeHeader}>
                <Icon name="tune" size={20} color={c.textMuted} style={styles.icons} />
                <Text style={[styles.amountModeTitle, { color: c.text }]}>Amounts</Text>
              </View>
              <Text style={[styles.groupSectionHint, { color: c.textMuted }]}>
                Cash: track dollars. Chips: track chip stacks; set how much each chip is worth.
              </Text>
              <SegmentedTabs
                variant="radio"
                tabs={AMOUNT_UNIT_TABS}
                value={amountUnit}
                onChange={onChangeAmountUnit}
              />
              {isChipsMode ? (
                <Animated.View entering={fadeIn} exiting={fadeOut} layout={layoutTransition} style={styles.chipValueBlock}>
                  <View style={styles.labelWithRequired}>
                    <Text style={[styles.blindFieldLabel, { color: c.textHint }]}>Dollars per chip</Text>
                    <Text style={[styles.requiredMark, { color: c.loss }]}>*</Text>
                  </View>
                  <View>
                    <View style={styles.buyInRow}>
                    <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
                    <TextInput
                      value={dollarsPerChipStr}
                      onChangeText={(t) => {
                        setDollarsPerChipStr(sanitizeAmountInput(t));
                        clearError('dollarsPerChip');
                      }}
                      accessibilityLabel="Dollars per chip"
                      placeholder="0.50"
                      placeholderTextColor={c.placeholder}
                      keyboardType="decimal-pad"
                      {...invalidProps(errors.dollarsPerChip)}
                      style={[
                        styles.buyInInput,
                        { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
                        errorBorder(c, errors.dollarsPerChip),
                      ]}
                    />
                  </View>
                    <FieldError message={errors.dollarsPerChip} />
                  </View>
                  <Text style={[styles.groupSectionHint, { color: c.textHint }]}>
                    Example: 100 chips for a $50 buy-in → $0.50 per chip.
                  </Text>
                </Animated.View>
              ) : null}
            </Animated.View>

            <Animated.View
              entering={listItemEntering(1)}
              layout={layoutTransition}
              style={[styles.amountModeCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.amountModeHeader}>
              <Icon name="payments" size={20} color={c.textMuted} style={styles.icons} />
              <Text style={[styles.amountModeTitle, { color: c.text }]}>
                Blinds{isChipsMode ? ' (chips)' : ''}
              </Text>
            </View>
            <View style={styles.blindsRow}>
              <View style={styles.blindField}>
                <View style={styles.labelWithRequired}>
                  <Text style={[styles.blindFieldLabel, { color: c.textHint }]}>Small</Text>
                  <Text style={[styles.requiredMark, { color: c.loss }]}>*</Text>
                </View>
                <View>
                <SessionAmountInputRow unit={amountUnit} color={c.textMuted} iconSize={18} style={styles.buyInRow}>
                  <TextInput
                    value={smallBlindStr}
                    onChangeText={(t) => {
                      setSmallBlindStr(sanitizeAmountInput(t));
                      clearError('smallBlind');
                    }}
                    accessibilityLabel="Small blind"
                    placeholder="0"
                    placeholderTextColor={c.placeholder}
                    keyboardType="decimal-pad"
                    {...invalidProps(errors.smallBlind)}
                    style={[
                      styles.buyInInput,
                      { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
                      errorBorder(c, errors.smallBlind),
                    ]}
                  />
                </SessionAmountInputRow>
                <FieldError message={errors.smallBlind} />
                </View>
              </View>
              <View style={styles.blindField}>
                <View style={styles.labelWithRequired}>
                  <Text style={[styles.blindFieldLabel, { color: c.textHint }]}>Big</Text>
                  <Text style={[styles.requiredMark, { color: c.loss }]}>*</Text>
                </View>
                <View>
                <SessionAmountInputRow unit={amountUnit} color={c.textMuted} iconSize={18} style={styles.buyInRow}>
                  <TextInput
                    value={bigBlindStr}
                    onChangeText={(t) => {
                      setBigBlindStr(sanitizeAmountInput(t));
                      clearError('bigBlind');
                    }}
                    accessibilityLabel="Big blind"
                    placeholder="0"
                    placeholderTextColor={c.placeholder}
                    keyboardType="decimal-pad"
                    {...invalidProps(errors.bigBlind)}
                    style={[
                      styles.buyInInput,
                      { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
                      errorBorder(c, errors.bigBlind),
                    ]}
                  />
                </SessionAmountInputRow>
                <FieldError message={errors.bigBlind} />
                </View>
              </View>
            </View>
            </Animated.View>

            {groups.length > 0 && (
              <Animated.View
                entering={listItemEntering(2)}
                layout={layoutTransition}
                style={[styles.groupSection, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.groupSectionHeader}>
                  <Icon name="group" size={20} color={c.textMuted} style={styles.icons} />
                  <Text style={[styles.groupSectionTitle, { color: c.text }]}>Play with a group</Text>
                  <Text style={[styles.optionalTag, { color: c.textHint }]}>Optional</Text>
                </View>
                <Text style={[styles.groupSectionHint, { color: c.textMuted }]}>
                  Select a group to auto-add all members with a uniform buy-in.
                </Text>

                {selectedGroup ? (
                  <Animated.View key="selected" entering={fadeIn} layout={layoutTransition} style={styles.selectedGroupRow}>
                    <View style={styles.selectedGroupInfo}>
                      <Icon name="group" size={20} color={c.accentText} />
                      <Text style={[styles.selectedGroupName, { color: c.text }]}>
                        {selectedGroup.name}
                      </Text>
                      <Text style={[styles.selectedGroupCount, { color: c.textHint }]}>
                        ({groupMembers.length} {groupMembers.length === 1 ? 'player' : 'players'})
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={clearGroup}
                      accessibilityRole="button"
                      accessibilityLabel="Remove selected group">
                      <Icon name="close" size={20} color={c.textHint} />
                    </Pressable>
                  </Animated.View>
                ) : (
                  <Animated.View key="picker" entering={fadeIn} layout={layoutTransition}>
                    <Pressable
                      style={[styles.groupPickerBtn, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}
                      accessibilityRole="button"
                      accessibilityLabel="Select group"
                      onPress={() => setShowGroupPicker(true)}>
                      <Icon name="group" size={18} color={c.textMuted} />
                      <Text style={[styles.groupPickerLabel, { color: c.textMuted }]}>Select group...</Text>
                    </Pressable>
                  </Animated.View>
                )}

                {selectedGroup && groupMembers.length > 0 && (
                  <Animated.View entering={fadeIn} exiting={fadeOut} layout={layoutTransition} style={styles.groupMembersBlock}>
                    <View style={styles.groupMemberList}>
                      {groupMembers.map((m) => (
                        <View
                          key={m.id}
                          style={[styles.groupMemberChip, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
                          <GroupMemberAvatar member={m} viewerProfile={playerProfile} size="compact" />
                          <Text style={[styles.groupMemberChipText, { color: c.chipText }]}>{m.name}</Text>
                        </View>
                      ))}
                    </View>
                    <SessionAmountInputRow unit={amountUnit} color={c.textMuted} iconSize={18} style={styles.buyInRow}>
                      <TextInput
                        value={groupBuyIn}
                        onChangeText={(t) => {
                          setGroupBuyIn(sanitizeAmountInput(t));
                          clearError('groupBuyIn');
                        }}
                        accessibilityLabel={isChipsMode ? 'Chip buy-in per group player' : 'Buy-in per group player'}
                        placeholder={isChipsMode ? 'Chips per player' : 'Buy-in per player'}
                        placeholderTextColor={c.placeholder}
                        keyboardType="numeric"
                        onFocus={scrollLowerFormIntoView}
                        {...invalidProps(errors.groupBuyIn)}
                        style={[
                          styles.buyInInput,
                          { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
                          errorBorder(c, errors.groupBuyIn),
                        ]}
                      />
                    </SessionAmountInputRow>
                    <FieldError message={errors.groupBuyIn} />
                  </Animated.View>
                )}
              </Animated.View>
            )}

            {shouldShowJoinAsPlayer && (
              <Animated.View
                entering={listItemEntering(3)}
                exiting={fadeOut}
                layout={layoutTransition}
                style={[styles.joinCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.joinRow}>
                  <View style={styles.joinTextCol}>
                    <View style={styles.joinTextRow}>
                      <Icon name="person" size={20} color={c.textMuted} style={styles.icons} />
                      <Text style={[styles.joinTitle, { color: c.text }]}>Join as player</Text>
                      {joinSelf ? (
                        <Text style={[styles.requiredMark, { color: c.loss }]}>*</Text>
                      ) : null}
                    </View>
                  </View>
                  <AppSwitch
                    accessibilityLabel="Join as player"
                    value={joinSelf}
                    onValueChange={(value) => {
                      setJoinSelf(value);
                      clearError('buyIn');
                    }}
                  />
                </View>
                {joinSelf && (
                  <Animated.View entering={fadeIn} exiting={fadeOut} layout={layoutTransition}>
                  <SessionAmountInputRow unit={amountUnit} color={c.textMuted} iconSize={18} style={styles.buyInRow}>
                    <TextInput
                      value={buyInAmount}
                      onChangeText={(t) => {
                        setBuyInAmount(sanitizeAmountInput(t));
                        clearError('buyIn');
                      }}
                      accessibilityLabel={isChipsMode ? 'Your chip buy-in' : 'Your buy-in amount'}
                      placeholder={isChipsMode ? 'Chips' : '0.00'}
                      placeholderTextColor={c.placeholder}
                      keyboardType="numeric"
                      onFocus={scrollLowerFormIntoView}
                      {...invalidProps(errors.buyIn)}
                      style={[
                        styles.buyInInput,
                        { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
                        errorBorder(c, errors.buyIn),
                      ]}
                    />
                  </SessionAmountInputRow>
                  <FieldError message={errors.buyIn} />
                  </Animated.View>
                )}
              </Animated.View>
            )}

            <Animated.View
              entering={listItemEntering(4)}
              layout={layoutTransition}
              style={[styles.amountModeCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.amountModeHeader}>
              <Icon name="place" size={20} color={c.textMuted} style={styles.icons} />
              <Text style={[styles.amountModeTitle, { color: c.text }]}>Location</Text>
              <Text style={[styles.optionalTag, { color: c.textHint }]}>Optional</Text>
            </View>
            {hasSavedLocations ? (
              <Pressable
                style={[styles.locationPickerBtn, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}
                accessibilityRole="button"
                accessibilityLabel={`Location: ${locationMode === 'saved' ? getSelectedSavedLocationName() ?? 'not selected' : 'Other'}. Change`}
                onPress={() => setShowLocationPicker(true)}>
                <Icon name="place" size={18} color={c.textMuted} />
                <Text style={[styles.locationPickerText, { color: c.text }]}>
                  {locationMode === 'saved'
                    ? getSelectedSavedLocationName() ?? 'Select a saved location'
                    : 'Other'}
                </Text>
                <Icon name="expand-more" size={20} color={c.textMuted} />
              </Pressable>
            ) : null}

            {(locationMode === 'other' || !hasSavedLocations) && (
              <Animated.View entering={fadeIn} exiting={fadeOut} layout={layoutTransition} style={styles.locationInputGroup}>
                <TextInput
                  value={otherLocation}
                  onChangeText={setOtherLocation}
                  accessibilityLabel="Session location"
                  placeholder="Location (e.g. Adam's place)"
                  onFocus={scrollLowerFormIntoView}
                  placeholderTextColor={c.placeholder}
                  style={[
                    styles.input,
                    { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
                  ]}
                />
                {!hasSavedLocations ? (
                  <Text style={[styles.groupSectionHint, { color: c.textMuted }]}>
                    No saved locations yet. Enter the session location above.
                  </Text>
                ) : null}
              </Animated.View>
            )}
            </Animated.View>

            <Animated.View entering={listItemEntering(5)} layout={layoutTransition}>
            <PressableScale
              onPress={onCreate}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Start Session"
              accessibilityState={{ disabled: isSaving, busy: isSaving }}
              style={[styles.button, { backgroundColor: c.accent }, isSaving && styles.disabled]}>
                {isSaving ? (
                  <ActivityIndicator size="small" color={c.onAccent} />
                ) : (
                  <Text style={[styles.buttonLabel, { color: c.onAccent }]}>Start Session</Text>
                )}
            </PressableScale>
            </Animated.View>
        </ScrollView>

      <Modal
        visible={showGroupPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowGroupPicker(false)}>
        <View style={styles.modalRoot}>
          <ModalBackdrop
                        importantForAccessibility="no"
            onPress={() => setShowGroupPicker(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View style={[styles.pickerCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.pickerTitle, { color: c.text }]} accessibilityRole="header">
                Select Group
              </Text>
              <ScrollView style={styles.pickerList}>
                {groups.map((g) => (
                  <Pressable
                    key={g.id}
                    style={[styles.pickerRow, { borderColor: c.border }]}
                    accessibilityRole="button"
                    onPress={() => handleSelectGroup(g)}>
                    <Icon name="group" size={20} color={c.textMuted} />
                    <Text style={[styles.pickerRowText, { color: c.text }]}>{g.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                style={styles.pickerCancel}
                accessibilityRole="button"
                onPress={() => setShowGroupPicker(false)}>
                <Text style={[styles.pickerCancelText, { color: c.lossLight }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showLocationPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowLocationPicker(false)}>
        <View style={styles.modalRoot}>
          <ModalBackdrop
                        importantForAccessibility="no"
            onPress={() => setShowLocationPicker(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View style={[styles.pickerCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.pickerTitle, { color: c.text }]} accessibilityRole="header">
                Select Location
              </Text>
              <ScrollView style={styles.pickerList}>
                {savedLocations.map((item) => (
                  <Pressable
                    key={item.id}
                    style={[styles.pickerRow, { borderColor: c.border }]}
                    accessibilityRole="button"
                    onPress={() => onSelectSavedLocation(item)}>
                    <Icon name="place" size={18} color={c.textMuted} />
                    <Text style={[styles.pickerRowText, { color: c.text }]}>{item.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                style={[styles.pickerRow, { borderColor: c.border }]}
                accessibilityRole="button"
                onPress={onSelectOtherLocation}>
                <Icon name="edit-location-alt" size={18} color={c.textMuted} />
                <Text style={[styles.pickerRowText, { color: c.text }]}>Other</Text>
              </Pressable>
              <Pressable
                style={styles.pickerCancel}
                accessibilityRole="button"
                onPress={() => setShowLocationPicker(false)}>
                <Text style={[styles.pickerCancelText, { color: c.lossLight }]}>Cancel</Text>
              </Pressable>
            </View>
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
  screenContent: {
    paddingTop: 16,
    gap: 16,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  locationInputGroup: {
    gap: 7,
  },
  savedLocationsLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  icons: {
    marginTop: 1,
  },
  locationPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  locationPickerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  joinCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  joinTextCol: {
    flex: 1,
    gap: 2,
  },
  joinTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  joinTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  blindsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  blindField: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  blindFieldLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  labelWithRequired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  requiredMark: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
  },
  buyInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: '600',
  },
  buyInInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  button: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.7,
  },
  groupSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  groupSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  groupSectionHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  optionalTag: {
    fontSize: 12,
    marginLeft: 'auto',
  },
  amountModeCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  amountModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountModeTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  chipValueBlock: {
    gap: 7,
  },
  groupPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  groupPickerLabel: {
    fontSize: 15,
  },
  selectedGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedGroupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  selectedGroupName: {
    fontWeight: '600',
  },
  selectedGroupCount: {
    fontSize: 12,
  },
  groupMembersBlock: {
    gap: 10,
  },
  groupMemberList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  groupMemberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    paddingRight: 10,
  },
  groupMemberChipText: {
    fontSize: 12,
    fontWeight: '600',
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
    gap: 4,
  },
  pickerTitle: text.modalTitle,
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerRowText: {
    fontWeight: '600',
    fontSize: 15,
  },
  pickerList: {
    maxHeight: 360,
  },
  pickerCancel: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  pickerCancelText: {
    fontWeight: '600',
    fontSize: 15,
  },
});
