import { useAppColors } from '@/lib/app-theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  /** Host-only actions; omitted for viewers. */
  hostActions?: { micSlot: ReactNode; onBuyIn: () => void } | null;
};

export function SessionHeader({ title, hostActions }: Props) {
  const c = useAppColors();
  return (
    <View style={styles.header}>
      <View style={styles.text}>
        <Text style={[styles.label, { color: c.textHint }]}>SESSION</Text>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
          {title}
        </Text>
      </View>
      {hostActions ? (
        <View style={styles.actions}>
          {hostActions.micSlot}
          <Pressable
            onPress={hostActions.onBuyIn}
            accessibilityRole="button"
            accessibilityLabel="Add buy-in"
            style={({ pressed }) => [
              styles.buyIn,
              {
                backgroundColor: c.accent,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}>
            <MaterialIcons name="add" size={18} color="#fff" importantForAccessibility="no" />
            <Text style={styles.buyInLabel}>Buy-In</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 2,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buyIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
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
  buyInLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
