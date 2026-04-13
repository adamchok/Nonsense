import { GroupMemberAvatar } from '@/components/group-member-avatar';
import { SessionAmountInputRow } from '@/components/session-amount-ui';
import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { addBuyIn, createSession, getGroupMembers, getSavedLocations, subscribeGroups } from '@/lib/firestore';
import type { GroupMember, PokerGroup, SavedLocation, SessionAmountUnit } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_CONTENT_PADDING_BOTTOM = 32;

export default function NewSessionScreen() {
  const c = useAppColors();
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

  /**
   * ScrollView does not auto-scroll to focused inputs. `scrollToEnd` is only for fields near the bottom
   * (group / join buy-in). Do not use it for upper fields like “Dollars per chip” — it jumps past them.
   */
  function scrollLowerFormIntoView() {
    requestAnimationFrame(() => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    });
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
    setSelectedGroup(group);
    setShowGroupPicker(false);
    try {
      const members = await getGroupMembers(playerProfile!.id, group.id);
      setGroupMembers(members);
    } catch {
      setGroupMembers([]);
    }
  }

  function clearGroup() {
    setSelectedGroup(null);
    setGroupMembers([]);
    setGroupBuyIn('');
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
        /* keep previous membersForCreate */
      }
    }

    const userInGroupForCreate =
      Boolean(selectedGroup && playerProfile) &&
      membersForCreate.some((m) => m.id === playerProfile.id);

    const shouldAddGroupMembers = Boolean(selectedGroup && membersForCreate.length > 0);
    const shouldAddSelf = joinSelf && (!selectedGroup || !userInGroupForCreate);

    if (shouldAddGroupMembers) {
      const parsed = parseFloat(groupBuyIn);
      if (!groupBuyIn.trim() || isNaN(parsed) || parsed <= 0) {
        appAlert(
          'Invalid buy-in',
          isChipsMode ? 'Enter a valid chip buy-in for the group.' : 'Enter a valid buy-in amount for the group.'
        );
        return;
      }
    }

    if (shouldAddSelf) {
      const parsed = parseFloat(buyInAmount);
      if (!buyInAmount.trim() || isNaN(parsed) || parsed <= 0) {
        appAlert(
          'Invalid buy-in',
          isChipsMode ? 'Enter a valid chip amount to join the session.' : 'Enter a valid buy-in amount to join the session.'
        );
        return;
      }
    }

    const selectedLocation =
      hasSavedLocations && locationMode === 'saved'
        ? (getSelectedSavedLocationName() ?? '')
        : otherLocation.trim();

    const sbTrim = smallBlindStr.trim();
    const bbTrim = bigBlindStr.trim();
    const sb = parseFloat(sbTrim);
    const bb = parseFloat(bbTrim);
    if (!sbTrim || !bbTrim || Number.isNaN(sb) || Number.isNaN(bb) || sb <= 0 || bb < sb) {
      appAlert(
        'Blinds required',
        'Enter small and big blind amounts, with big blind at least equal to the small blind.'
      );
      return;
    }

    let dollarsPerChip: number | undefined;
    if (isChipsMode) {
      const dpc = parseFloat(dollarsPerChipStr.trim());
      if (!dollarsPerChipStr.trim() || Number.isNaN(dpc) || dpc <= 0) {
        appAlert(
          'Chip value',
          'Enter how much each chip is worth in dollars (e.g. 0.50 for a $50 buy-in of 100 chips).'
        );
        return;
      }
      dollarsPerChip = dpc;
    }

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
      });

      if (shouldAddGroupMembers) {
        const amount = parseFloat(groupBuyIn);
        await Promise.all(
          membersForCreate.map((member) =>
            addBuyIn(sessionId, {
              playerId: member.id,
              playerName: member.name,
              amount,
            })
          )
        );
      }

      if (shouldAddSelf) {
        await addBuyIn(sessionId, {
          playerId: playerProfile.id,
          playerName: playerProfile.name,
          amount: parseFloat(buyInAmount),
        });
      }

      router.replace(`/session/${sessionId}`);
    } catch (error) {
      appAlert(
        'Unable to create session',
        error instanceof Error ? error.message : 'Please try again.'
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
              paddingBottom: SCREEN_CONTENT_PADDING_BOTTOM + keyboardHeight + insets.bottom,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
            <View style={styles.locationSection}>
              <MaterialIcons name="place" size={20} color={c.textMuted} style={styles.icons} />
              <Text style={[styles.locationSectionTitle, { color: c.textMuted }]}>Location (Optional)</Text>
            </View>
            {hasSavedLocations ? (
              <Pressable
                style={[styles.locationPickerBtn, { borderColor: c.border, backgroundColor: c.inputBg }]}
                onPress={() => setShowLocationPicker(true)}>
                <MaterialIcons name="place" size={18} color={c.textMuted} />
                <Text style={[styles.locationPickerText, { color: c.text }]}>
                  {locationMode === 'saved'
                    ? getSelectedSavedLocationName() ?? 'Select a saved location'
                    : 'Other'}
                </Text>
                <MaterialIcons name="expand-more" size={20} color={c.textMuted} />
              </Pressable>
            ) : null}

            {(locationMode === 'other' || !hasSavedLocations) && (
              <View style={styles.locationInputGroup}>
                <TextInput
                  value={otherLocation}
                  onChangeText={setOtherLocation}
                  placeholder="Location (e.g. Adam's place)"
                  placeholderTextColor={c.placeholder}
                  style={[
                    styles.input,
                    { borderColor: c.border, backgroundColor: c.inputBg, color: c.text },
                  ]}
                />
                {!hasSavedLocations ? (
                  <Text style={[styles.groupSectionHint, { color: c.textMuted }]}>
                    No saved locations yet. Enter the session location above.
                  </Text>
                ) : null}
              </View>
            )}

            <View style={[styles.amountModeCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.amountModeHeader}>
                <MaterialIcons name="tune" size={20} color={c.textMuted} style={styles.icons} />
                <Text style={[styles.amountModeTitle, { color: c.textMuted }]}>Amounts</Text>
              </View>
              <Text style={[styles.groupSectionHint, { color: c.textMuted }]}>
                Cash: track dollars. Chips: track chip stacks; set how much each chip is worth.
              </Text>
              <View style={styles.amountModeRow}>
                <Pressable
                  style={[
                    styles.amountModeOption,
                    { borderColor: c.border, backgroundColor: c.inputBg },
                    !isChipsMode && { borderColor: c.accent, backgroundColor: c.accentBg },
                  ]}
                  onPress={() => setAmountUnit('cash')}>
                  <Text style={[styles.amountModeOptionText, { color: c.text }]}>Cash</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.amountModeOption,
                    { borderColor: c.border, backgroundColor: c.inputBg },
                    isChipsMode && { borderColor: c.accent, backgroundColor: c.accentBg },
                  ]}
                  onPress={() => setAmountUnit('chips')}>
                  <Text style={[styles.amountModeOptionText, { color: c.text }]}>Chips</Text>
                </Pressable>
              </View>
              {isChipsMode ? (
                <View style={styles.chipValueBlock}>
                  <View style={styles.labelWithRequired}>
                    <Text style={[styles.blindFieldLabel, { color: c.textHint }]}>Dollars per chip</Text>
                    <Text style={[styles.requiredMark, { color: c.loss }]}>*</Text>
                  </View>
                  <View style={styles.buyInRow}>
                    <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
                    <TextInput
                      value={dollarsPerChipStr}
                      onChangeText={setDollarsPerChipStr}
                      placeholder="0.50"
                      placeholderTextColor={c.placeholder}
                      keyboardType="decimal-pad"
                      style={[styles.buyInInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                    />
                  </View>
                  <Text style={[styles.groupSectionHint, { color: c.textHint }]}>
                    Example: 100 chips for a $50 buy-in → $0.50 per chip.
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.blindsSection}>
              <MaterialIcons name="payments" size={20} color={c.textMuted} style={styles.icons} />
              <View style={styles.labelWithRequired}>
                <Text style={[styles.blindsSectionTitle, { color: c.textMuted }]}>
                  Blinds{isChipsMode ? ' (chips)' : ''}
                </Text>
              </View>
            </View>
            <View style={styles.blindsRow}>
              <View style={styles.blindField}>
                <View style={styles.labelWithRequired}>
                  <Text style={[styles.blindFieldLabel, { color: c.textHint }]}>Small</Text>
                  <Text style={[styles.requiredMark, { color: c.loss }]}>*</Text>
                </View>
                <SessionAmountInputRow unit={amountUnit} color={c.textMuted} iconSize={18} style={styles.buyInRow}>
                  <TextInput
                    value={smallBlindStr}
                    onChangeText={setSmallBlindStr}
                    placeholder="0"
                    placeholderTextColor={c.placeholder}
                    keyboardType="decimal-pad"
                    style={[styles.buyInInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                  />
                </SessionAmountInputRow>
              </View>
              <View style={styles.blindField}>
                <View style={styles.labelWithRequired}>
                  <Text style={[styles.blindFieldLabel, { color: c.textHint }]}>Big</Text>
                  <Text style={[styles.requiredMark, { color: c.loss }]}>*</Text>
                </View>
                <SessionAmountInputRow unit={amountUnit} color={c.textMuted} iconSize={18} style={styles.buyInRow}>
                  <TextInput
                    value={bigBlindStr}
                    onChangeText={setBigBlindStr}
                    placeholder="0"
                    placeholderTextColor={c.placeholder}
                    keyboardType="decimal-pad"
                    style={[styles.buyInInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                  />
                </SessionAmountInputRow>
              </View>
            </View>

            {/* ---- Group picker ---- */}
            {groups.length > 0 && (
              <View style={[styles.groupSection, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.groupSectionHeader}>
                  <MaterialIcons name="group" size={20} color={c.textMuted} style={styles.icons} />
                  <Text style={[styles.groupSectionTitle, { color: c.textMuted }]}>Play with a group (Optional)</Text>
                </View>
                <Text style={[styles.groupSectionHint, { color: c.textMuted }]}>
                  Select a group to auto-add all members with a uniform buy-in.
                </Text>

                {selectedGroup ? (
                  <View style={styles.selectedGroupRow}>
                    <View style={styles.selectedGroupInfo}>
                      <MaterialIcons name="group" size={20} color={c.profit} />
                      <Text style={[styles.selectedGroupName, { color: c.text }]}>
                        {selectedGroup.name}
                      </Text>
                      <Text style={[styles.selectedGroupCount, { color: c.textHint }]}>
                        ({groupMembers.length} {groupMembers.length === 1 ? 'player' : 'players'})
                      </Text>
                    </View>
                    <Pressable hitSlop={8} onPress={clearGroup}>
                      <MaterialIcons name="close" size={20} color={c.textHint} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.groupPickerBtn, { borderColor: c.border, backgroundColor: c.inputBg }]}
                    onPress={() => setShowGroupPicker(true)}>
                    <MaterialIcons name="group" size={18} color={c.textMuted} />
                    <Text style={[styles.groupPickerLabel, { color: c.textMuted }]}>Select group...</Text>
                  </Pressable>
                )}

                {selectedGroup && groupMembers.length > 0 && (
                  <>
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
                        onChangeText={setGroupBuyIn}
                        placeholder={isChipsMode ? 'Chips per player' : 'Buy-in per player'}
                        placeholderTextColor={c.placeholder}
                        keyboardType="numeric"
                        onFocus={scrollLowerFormIntoView}
                        style={[styles.buyInInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                      />
                    </SessionAmountInputRow>
                  </>
                )}
              </View>
            )}

            {/* ---- Solo join (hidden only when user is already in the selected group) ---- */}
            {shouldShowJoinAsPlayer && (
              <View style={[styles.joinCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.joinRow}>
                  <View style={styles.joinTextCol}>
                    <View style={styles.joinTextRow}>
                      <MaterialIcons name="person" size={20} color={c.textMuted} style={styles.icons} />
                      <Text style={[styles.joinTitle, { color: c.textMuted }]}>Join as player</Text>
                      {joinSelf ? (
                        <Text style={[styles.requiredMark, { color: c.loss }]}>*</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.joinHint, { color: c.textMuted }]}>
                      {isChipsMode ? 'Add yourself with chips bought in' : 'Add yourself with an initial buy-in'}
                    </Text>
                  </View>
                  <Switch
                    value={joinSelf}
                    onValueChange={setJoinSelf}
                    trackColor={{ false: c.switchTrackOff, true: c.switchTrackOn }}
                    thumbColor={c.switchThumb}
                  />
                </View>
                {joinSelf && (
                  <SessionAmountInputRow unit={amountUnit} color={c.textMuted} iconSize={18} style={styles.buyInRow}>
                    <TextInput
                      value={buyInAmount}
                      onChangeText={setBuyInAmount}
                      placeholder={isChipsMode ? 'Chips' : '0.00'}
                      placeholderTextColor={c.placeholder}
                      keyboardType="numeric"
                      onFocus={scrollLowerFormIntoView}
                      style={[
                        styles.buyInInput,
                        { borderColor: c.border, backgroundColor: c.inputBg, color: c.text },
                      ]}
                    />
                  </SessionAmountInputRow>
                )}
              </View>
            )}

            <Pressable
              onPress={onCreate}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: c.accent },
                isSaving && styles.disabled,
                pressed && !isSaving && styles.pressed,
              ]}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonLabel}>Start Session</Text>
                )}
            </Pressable>
        </ScrollView>

      {/* ---- Group picker modal ---- */}
      <Modal
        visible={showGroupPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowGroupPicker(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={() => setShowGroupPicker(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View style={[styles.pickerCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.pickerTitle, { color: c.text }]}>Select Group</Text>
              {groups.map((g) => (
                <Pressable
                  key={g.id}
                  style={[styles.pickerRow, { borderColor: c.border }]}
                  onPress={() => handleSelectGroup(g)}>
                  <MaterialIcons name="group" size={20} color={c.textMuted} />
                  <Text style={[styles.pickerRowText, { color: c.text }]}>{g.name}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.pickerCancel}
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
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
            onPress={() => setShowLocationPicker(false)}
          />
          <View pointerEvents="box-none" style={styles.modalCenter}>
            <View style={[styles.pickerCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.pickerTitle, { color: c.text }]}>Select Location</Text>
              {savedLocations.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.pickerRow, { borderColor: c.border }]}
                  onPress={() => onSelectSavedLocation(item)}>
                  <MaterialIcons name="place" size={18} color={c.textMuted} />
                  <Text style={[styles.pickerRowText, { color: c.text }]}>{item.name}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.pickerRow, { borderColor: c.border }]}
                onPress={onSelectOtherLocation}>
                <MaterialIcons name="edit-location-alt" size={18} color={c.textMuted} />
                <Text style={[styles.pickerRowText, { color: c.text }]}>Other</Text>
              </Pressable>
              <Pressable
                style={styles.pickerCancel}
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
    padding: 16,
    paddingTop: 12,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationInputGroup: {
    gap: 4,
    paddingBottom: 6,
  },
  savedLocationsLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  locationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  blindsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  blindsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  icons: {
    marginTop: 1,
  },
  locationPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationPickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  joinCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
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
    fontSize: 14,
    fontWeight: '600',
  },
  joinHint: {
    fontSize: 12,
  },
  blindsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  blindField: {
    flex: 1,
    gap: 4,
  },
  blindFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
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
    gap: 4,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: '600',
  },
  buyInInput: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    marginTop: 8,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.85,
  },
  groupSection: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  groupSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  groupSectionHint: {
    fontSize: 12,
  },
  amountModeCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  amountModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountModeTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  amountModeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  amountModeOption: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  amountModeOptionText: {
    fontWeight: '700',
    fontSize: 15,
  },
  chipValueBlock: {
    gap: 6,
  },
  groupPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  groupPickerLabel: {
    fontSize: 14,
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
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  pickerTitle: {
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerRowText: {
    fontWeight: '600',
    fontSize: 15,
  },
  pickerCancel: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  pickerCancelText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
