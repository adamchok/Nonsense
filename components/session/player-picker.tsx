import { useAppColors } from '@/lib/app-theme';
import type { LedgerPlayer } from '@/lib/session-view';
import type { FriendRecord } from '@/types';
import { Icon } from '@/components/icon';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  /** Seated players who haven't cashed out. */
  activePlayers: LedgerPlayer[];
  friendsNotInSession: FriendRecord[];
  selfId: string | undefined;
  pickedPlayerId: string | null;
  onPick: (playerId: string, name: string) => void;
};

/** Rebuy chips for seated players and add-chips for friends not yet in the session. */
export function PlayerPicker({ activePlayers, friendsNotInSession, selfId, pickedPlayerId, onPick }: Props) {
  const c = useAppColors();
  if (activePlayers.length === 0 && friendsNotInSession.length === 0) return null;

  return (
    <View style={styles.block}>
      {activePlayers.length > 0 ? (
        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: c.textHint }]}>IN THIS SESSION</Text>
          <View style={styles.chips}>
            {activePlayers.map((p) => {
              const isMe = p.playerId === selfId;
              const picked = pickedPlayerId === p.playerId;
              return (
                <Pressable
                  key={p.playerId}
                  accessibilityRole="button"
                  accessibilityLabel={`Rebuy ${p.name}${isMe ? ', you' : ''}`}
                  accessibilityState={{ selected: picked }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: picked ? c.accentBg : c.chipBg,
                      borderColor: picked ? c.accentBorder : c.chipBorder,
                    },
                  ]}
                  onPress={() => onPick(p.playerId, p.name)}>
                  {picked ? <Icon name="check" size={14} color={c.accentText} /> : null}
                  <Text style={[styles.chipText, { color: picked ? c.accentText : c.chipText }]}>
                    {p.name}
                    {isMe ? ' (You)' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {friendsNotInSession.length > 0 ? (
        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: c.textHint }]}>ADD A FRIEND</Text>
          <View style={styles.chips}>
            {friendsNotInSession.map((f) => {
              const picked = pickedPlayerId === f.playerId;
              return (
                <Pressable
                  key={f.playerId}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${f.name}`}
                  accessibilityState={{ selected: picked }}
                  style={[
                    styles.chip,
                    styles.friendChip,
                    {
                      backgroundColor: picked ? c.accentBg : c.friendChipBg,
                      borderColor: picked ? c.accentBorder : c.friendChipBorder,
                    },
                  ]}
                  onPress={() => onPick(f.playerId, f.name)}>
                  <Icon
                    name={picked ? 'check' : 'person-add'}
                    size={14}
                    color={picked ? c.accentText : c.blue}
                  />
                  <Text style={[styles.chipText, { color: picked ? c.accentText : c.blue }]}>{f.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 10,
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.66,
  },
  /** Wraps rather than scrolling: a horizontal strip hides players past the fourth. */
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  friendChip: {
    borderStyle: 'dashed',
  },
  chipText: {
    fontWeight: '600',
    fontSize: 13,
  },
});
