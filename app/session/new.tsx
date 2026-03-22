import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { addBuyIn, createSession } from '@/lib/firestore';

export default function NewSessionScreen() {
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const [label, setLabel] = useState('');
  const [location, setLocation] = useState('');
  const [joinSelf, setJoinSelf] = useState(true);
  const [buyInAmount, setBuyInAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function onCreate() {
    if (!playerProfile) {
      Alert.alert('Setup required', 'Please complete your display name first.');
      router.replace('../../(auth)/name');
      return;
    }

    if (joinSelf) {
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
        label,
        location,
      });

      if (joinSelf) {
        await addBuyIn(sessionId, {
          playerId: playerProfile.id,
          playerName: playerProfile.name,
          amount: parseFloat(buyInAmount),
        });
      }

      router.replace(`../${sessionId}`);
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
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Text style={[styles.title, { color: c.text }]}>Start a Session</Text>

      <View
        style={[
          styles.hostCard,
          { backgroundColor: c.card, borderColor: c.borderAccent },
        ]}>
        <Text style={[styles.hostLabel, { backgroundColor: c.badge.host, color: '#fff' }]}>
          HOST
        </Text>
        <Text style={[styles.hostName, { color: c.text }]}>
          {playerProfile?.name ?? 'Unknown'}
        </Text>
        <Text style={[styles.hostHint, { color: c.textMuted }]}>You are the host for this session.</Text>
      </View>

      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Session name (e.g. Friday Night Poker)"
        placeholderTextColor={c.placeholder}
        style={[
          styles.input,
          { borderColor: c.border, backgroundColor: c.inputBg, color: c.text },
        ]}
      />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
    paddingTop: 12,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  hostCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 2,
  },
  hostLabel: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hostName: {
    fontSize: 18,
    fontWeight: '700',
  },
  hostHint: {
    fontSize: 12,
    marginTop: 2,
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
    fontSize: 16,
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
});
