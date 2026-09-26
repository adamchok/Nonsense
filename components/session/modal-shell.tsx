import { useAppColors } from '@/lib/app-theme';
import { pressBg } from '@/lib/ui';
import { BREAKPOINT_MD, gutterFor } from '@/lib/spacing';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
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
  const { width } = useWindowDimensions();
  // Phones: near full width inside the gutter; tablet/desktop: a centred 480 column.
  const frame = { maxWidth: width >= BREAKPOINT_MD ? 480 : 400 };
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
          style={(state) => [styles.cancelBtn, { borderColor: c.inputBorder }, pressBg(c, state, c.card)]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={primary ? 'Cancel' : 'Close'}>
          <Text style={[styles.cancelLabel, { color: c.text }]}>
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
              <ActivityIndicator size="small" color={c.onAccent} />
            ) : (
              <Text style={[styles.primaryLabel, { color: c.onAccent }]}>{primary.label}</Text>
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
        <View pointerEvents="box-none" style={[styles.centerWrap, { paddingHorizontal: gutterFor(width) }]}>
          {avoidKeyboard ? (
            <KeyboardAvoidingView
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
              style={[styles.keyboard, frame, styles.kav]}>
              {card}
            </KeyboardAvoidingView>
          ) : (
            <View style={[styles.keyboard, frame]}>{card}</View>
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
  },
  keyboard: {
    width: '100%',
  },
  kav: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  cancelBtn: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: 48,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 18,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
});
