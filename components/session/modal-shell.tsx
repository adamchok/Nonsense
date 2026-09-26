import { Animated, PressableScale, SPRING } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { pressBg } from '@/lib/ui';
import { BREAKPOINT_MD, SHEET_BREAKPOINT, gutterFor } from '@/lib/spacing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, type ReactNode } from 'react';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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

/** Phones: how far below its resting place the sheet starts before springing up. */
const PHONE_RISE_PX = 48;
/** Wide screens: the card grows from this scale while the Modal fades in. */
const WIDE_START_SCALE = 0.96;

/**
 * Card entrance on open. The RN Modal's own fade drives backdrop + card opacity (and the
 * exit, since the Modal unmounts its content on close); this only adds the card's motion.
 */
function useCardEntrance(visible: boolean, isWide: boolean) {
  const progress = useSharedValue(visible ? 0 : 1);
  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    progress.value = withSpring(1, SPRING);
  }, [visible, progress]);
  return useAnimatedStyle(() =>
    isWide
      ? { transform: [{ scale: WIDE_START_SCALE + (1 - WIDE_START_SCALE) * progress.value }] }
      : { transform: [{ translateY: (1 - progress.value) * PHONE_RISE_PX }] }
  );
}

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
  const insets = useSafeAreaInsets();
  // Phones: a bottom sheet, like the filters and confirmations; wider: a centred card.
  const isSheet = width < SHEET_BREAKPOINT;
  const isWide = width >= BREAKPOINT_MD;
  const frame = { maxWidth: isSheet ? undefined : isWide ? 480 : 400 };
  const primaryDisabled = Boolean(primary?.disabled || primary?.busy);
  const entrance = useCardEntrance(visible, isWide);

  const card = (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: c.card, borderColor: c.border },
        isSheet && [styles.sheet, { paddingBottom: Math.max(20, insets.bottom + 12) }],
        cardStyle,
        entrance,
      ]}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}>
      {isSheet ? <View style={[styles.grabber, { backgroundColor: c.border }]} /> : null}
      {title != null ? (
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
      <View style={[styles.actions, isSheet && styles.actionsSheet]}>
        {/* Sheets dismiss by tapping outside (or back / VoiceOver escape), so Cancel only
            shows on the centred card, or as Close when there is no primary action. */}
        {isSheet && primary ? null : (
          <PressableScale
            style={(state) => [
              styles.cancelBtn,
              isSheet && styles.flexBtn,
              { borderColor: c.inputBorder },
              pressBg(c, state, c.card),
            ]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={primary ? 'Cancel' : 'Close'}>
            <Text style={[styles.cancelLabel, { color: c.text }]}>
              {primary ? 'Cancel' : 'Close'}
            </Text>
          </PressableScale>
        )}
        {primary ? (
          <PressableScale
            style={[
              styles.primaryBtn,
              isSheet && styles.flexBtn,
              { backgroundColor: c.accent },
              primaryDisabled && styles.disabled,
            ]}
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
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
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
        <View
          pointerEvents="box-none"
          style={[styles.centerWrap, isSheet ? styles.sheetWrap : { paddingHorizontal: gutterFor(width) }]}>
          {avoidKeyboard ? (
            <KeyboardAvoidingView
              // Fills the screen; let taps outside the card reach the backdrop (tap to dismiss).
              pointerEvents="box-none"
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' && !isSheet ? 64 : 0}
              style={[styles.keyboard, frame, styles.kav, isSheet && styles.kavSheet]}>
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
  sheetWrap: {
    justifyContent: 'flex-end',
  },
  keyboard: {
    width: '100%',
  },
  kavSheet: {
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
  actionsSheet: {
    justifyContent: 'space-between',
  },
  flexBtn: {
    flex: 1,
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
