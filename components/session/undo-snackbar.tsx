import { useAppColors } from '@/lib/app-theme';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const UNDO_WINDOW_MS = 5000;

type Props = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
};

/** Bottom snackbar with an Undo action; dismisses itself after UNDO_WINDOW_MS. Remount (key) per message. */
export function UndoSnackbar({ message, onUndo, onDismiss }: Props) {
  const c = useAppColors();

  useEffect(() => {
    const timer = setTimeout(onDismiss, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={[styles.bar, { backgroundColor: c.card, borderColor: c.border }]}
        accessibilityLiveRegion="polite">
        <Text style={[styles.message, { color: c.text }]} numberOfLines={2}>
          {message}
        </Text>
        <Pressable
          onPress={onUndo}
          style={styles.undoBtn}
          accessibilityRole="button"
          accessibilityLabel={`Undo: ${message}`}>
          <Text style={[styles.undoLabel, { color: c.accentText }]}>UNDO</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  undoBtn: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  undoLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
