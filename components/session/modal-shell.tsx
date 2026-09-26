import { useAppColors } from '@/lib/app-theme';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type ModalPrimaryAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Screen-reader label while busy (the button shows a spinner). */
  busyLabel?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Cancel + primary row. Without it, a single Close button is shown. */
  primary?: ModalPrimaryAction;
  /** Wraps the card in a KeyboardAvoidingView (every editor modal). */
  avoidKeyboard?: boolean;
  cardStyle?: StyleProp<ViewStyle>;
};

/** Overlay, keyboard handling, card and Cancel / primary row shared by the live-session modals. */
export function ModalShell({
  visible,
  onClose,
  title,
  children,
  primary,
  avoidKeyboard = true,
  cardStyle,
}: Props) {
  const c = useAppColors();
  const primaryDisabled = Boolean(primary?.disabled || primary?.busy);

  const card = (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, cardStyle]}>
      {title != null ? (
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
      <View style={styles.actions}>
        <Pressable
          style={styles.cancelBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={primary ? 'Cancel' : 'Close'}>
          <Text style={[styles.cancelLabel, { color: primary ? c.lossLight : c.textSecondary }]}>
            {primary ? 'Cancel' : 'Close'}
          </Text>
        </Pressable>
        {primary ? (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: c.accent }, primaryDisabled && styles.disabled]}
            onPress={primary.onPress}
            disabled={primaryDisabled}
            accessibilityRole="button"
            accessibilityLabel={primary.busy ? (primary.busyLabel ?? `${primary.label}, saving`) : primary.label}
            accessibilityState={{ disabled: primaryDisabled, busy: Boolean(primary.busy) }}>
            {primary.busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryLabel}>{primary.label}</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Hidden from screen readers so focus starts in the card; back and Cancel still dismiss. */}
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
          onPress={onClose}
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
        <View pointerEvents="box-none" style={styles.centerWrap}>
          {avoidKeyboard ? (
            <KeyboardAvoidingView
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
              style={[styles.keyboard, styles.kav]}>
              {card}
            </KeyboardAvoidingView>
          ) : (
            <View style={styles.keyboard}>{card}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  keyboard: {
    width: '100%',
    maxWidth: 360,
  },
  kav: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  title: {
    fontWeight: '700',
    fontSize: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: 44,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 18,
  },
  primaryLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
});
