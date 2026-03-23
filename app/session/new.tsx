import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { addBuyIn, createSession, getGroupMembers, subscribeGroups } from '@/lib/firestore';
import type { GroupMember, PokerGroup } from '@/types';

export default function NewSessionScreen() {
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const [location, setLocation] = useState('');
  const [joinSelf, setJoinSelf] = useState(true);
  const [buyInAmount, setBuyInAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [groups, setGroups] = useState<PokerGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<PokerGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupBuyIn, setGroupBuyIn] = useState('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  useEffect(() => {
    if (!playerProfile) return;
    return subscribeGroups(playerProfile.id, setGroups, () => {});
  }, [playerProfile]);

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
      Alert.alert('Setup required', 'Please complete your display name first.');
      router.replace('../../(auth)/name');
      return;
    }

    if (selectedGroup && groupMembers.length > 0) {
      const parsed = parseFloat(groupBuyIn);
      if (!groupBuyIn.trim() || isNaN(parsed) || parsed <= 0) {
        Alert.alert('Invalid buy-in', 'Enter a valid buy-in amount for the group.');
        return;
      }
    } else if (joinSelf) {
      const parsed = parseFloat(buyInAmount);
      if (!buyInAmount.trim() || isNaN(parsed) || parsed <= 0) {
        Alert.alert('Invalid buy-in', 'Enter a valid buy-in amount to join the session.');
        return;
      }
    }

    try {
      setIsSaving(true);
      const sessionId = await createSession({
        hostId: playerProfile.id,
        location,
      });

      if (selectedGroup && groupMembers.length > 0) {
        const amount = parseFloat(groupBuyIn);
        await Promise.all(
          groupMembers.map((member) =>
            addBuyIn(sessionId, {
              playerId: member.id,
              playerName: member.name,
              amount,
            })
          )
        );
      } else if (joinSelf) {
        await addBuyIn(sessionId, {
          playerId: playerProfile.id,
          playerName: playerProfile.name,
          amount: parseFloat(buyInAmount),
        });
      }

      router.replace(`/session/${sessionId}`);
    } catch (error) {
      Alert.alert(
        'Unable to create session',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: c.text }]}>Start a Session</Text>

      <TextInput
        value={location}
        onChangeText={setLocation}
        placeholder="Location (e.g. Adam's place)"
        placeholderTextColor={c.placeholder}
        style={[
          styles.input,
          { borderColor: c.border, backgroundColor: c.inputBg, color: c.text },
        ]}
      />

      {/* ---- Group picker ---- */}
      {groups.length > 0 && (
        <View style={[styles.groupSection, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.groupSectionTitle, { color: c.text }]}>Play with a group</Text>
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
                  <View key={m.id} style={[styles.groupMemberChip, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
                    <Text style={[styles.groupMemberChipText, { color: c.chipText }]}>{m.name}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.buyInRow}>
                <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
                <TextInput
                  value={groupBuyIn}
                  onChangeText={setGroupBuyIn}
                  placeholder="Buy-in per player"
                  placeholderTextColor={c.placeholder}
                  keyboardType="numeric"
                  style={[styles.buyInInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                />
              </View>
            </>
          )}
        </View>
      )}

      {/* ---- Solo join (hidden when group is selected) ---- */}
      {!selectedGroup && (
        <View style={[styles.joinCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.joinRow}>
            <View style={styles.joinTextCol}>
              <Text style={[styles.joinTitle, { color: c.text }]}>Join as player</Text>
              <Text style={[styles.joinHint, { color: c.textMuted }]}>
                Add yourself with an initial buy-in
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
            <View style={styles.buyInRow}>
              <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
              <TextInput
                value={buyInAmount}
                onChangeText={setBuyInAmount}
                placeholder="0.00"
                placeholderTextColor={c.placeholder}
                keyboardType="numeric"
                style={[
                  styles.buyInInput,
                  { borderColor: c.border, backgroundColor: c.inputBg, color: c.text },
                ]}
              />
            </View>
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
        <Text style={styles.buttonLabel}>{isSaving ? 'Creating...' : 'Create Session'}</Text>
      </Pressable>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 32,
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
  joinTitle: {
    fontWeight: '600',
  },
  joinHint: {
    fontSize: 12,
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
  groupSectionTitle: {
    fontWeight: '600',
  },
  groupSectionHint: {
    fontSize: 12,
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
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
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
