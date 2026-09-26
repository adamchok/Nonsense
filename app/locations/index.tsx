import { appAlert } from '@/lib/app-alert';
import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { addSavedLocation, getSavedLocations, removeSavedLocation } from '@/lib/firestore';
import type { SavedLocation } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { userMessage } from '@/lib/user-message';

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
      setError(userMessage(e, 'Failed to load saved locations.'));
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!user) return;
        try {
          setError(null);
          const data = await getSavedLocations(user.uid);
          if (active) setLocations(data);
        } catch (e) {
          if (active) setError(userMessage(e, 'Failed to load saved locations.'));
        }
      })();
      return () => {
        active = false;
      };
    }, [user])
  );

  async function onAddLocation() {
    if (!user || !newLocation.trim()) return;
    try {
      setIsSaving(true);
      await addSavedLocation(user.uid, newLocation);
      setNewLocation('');
      await load();
    } catch (e) {
      appAlert('Unable to save location', userMessage(e, 'Please try again.'));
    } finally {
      setIsSaving(false);
    }
  }

  function onDeleteLocation(item: SavedLocation) {
    if (!user) return;
    appAlert(`Delete "${item.name}"?`, 'This saved location will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeSavedLocation(user.uid, item.id);
            await load();
          } catch (e) {
            appAlert('Error', userMessage(e, 'Failed to delete location.'));
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
            accessibilityLabel="New location name"
            placeholder="e.g. Adam's place"
            placeholderTextColor={c.placeholder}
            style={[
              styles.input,
              { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text },
            ]}
          />
          <Pressable
            style={[styles.addBtn, { backgroundColor: c.accent }, isSaving && styles.disabled]}
            onPress={onAddLocation}
            accessibilityRole="button"
            accessibilityLabel="Save location"
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
          locations.map((item, i) => (
            <View key={item.id} style={[styles.row, i > 0 && styles.rowDivider, { borderColor: c.border }]}>
              <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Delete saved location ${item.name}`}
                onPress={() => onDeleteLocation(item)}>
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
    paddingTop: 16,
    gap: 24,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 12,
    gap: 12,
  },
  rowDivider: {
    borderTopWidth: 1,
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

