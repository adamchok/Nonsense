import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { addSavedLocation, getSavedLocations, removeSavedLocation } from '@/lib/firestore';
import type { SavedLocation } from '@/types';

export default function SavedLocationsScreen() {
  const c = useAppColors();
  const { user } = useAuth();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const data = await getSavedLocations(user.uid);
      setLocations(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load saved locations.');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onAddLocation() {
    if (!user || !newLocation.trim()) return;
    try {
      setIsSaving(true);
      await addSavedLocation(user.uid, newLocation);
      setNewLocation('');
      await load();
    } catch (e) {
      Alert.alert('Unable to save location', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  function onDeleteLocation(item: SavedLocation) {
    if (!user) return;
    Alert.alert(`Delete "${item.name}"?`, 'This saved location will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeSavedLocation(user.uid, item.id);
            await load();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete location.');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.label, { color: c.textMuted }]}>SAVE A LOCATION ({locations.length}/10)</Text>
        <View style={styles.addRow}>
          <TextInput
            value={newLocation}
            onChangeText={setNewLocation}
            placeholder="e.g. Adam's place"
            placeholderTextColor={c.placeholder}
            style={[
              styles.input,
              { borderColor: c.border, backgroundColor: c.inputBg, color: c.text },
            ]}
          />
          <Pressable
            style={[styles.addBtn, { backgroundColor: c.accent }, isSaving && styles.disabled]}
            onPress={onAddLocation}
            disabled={isSaving || !newLocation.trim()}>
            <MaterialIcons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      {error ? <Text style={{ color: c.loss }}>{error}</Text> : null}

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.label, { color: c.textMuted }]}>SAVED LOCATIONS</Text>
        {locations.length === 0 ? (
          <Text style={[styles.empty, { color: c.textHint }]}>No saved locations yet.</Text>
        ) : (
          locations.map((item) => (
            <View key={item.id} style={[styles.row, { borderColor: c.border }]}>
              <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable hitSlop={8} onPress={() => onDeleteLocation(item)}>
                <MaterialIcons name="delete-outline" size={20} color={c.lossLight} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
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
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addBtn: {
    width: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    gap: 10,
  },
  name: {
    flex: 1,
    fontWeight: '600',
    fontSize: 15,
  },
  empty: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.5,
  },
});

