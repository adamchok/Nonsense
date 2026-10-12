import { Icon, type IconName } from '@/components/icon';
import { ModalBackdrop } from '@/components/modal-backdrop';
import { Animated, PressableScale, SPRING } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { pressBg, text, pointer } from '@/lib/ui';
import { BREAKPOINT_MD, SHEET_BREAKPOINT, gutterFor } from '@/lib/spacing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useId, useMemo, type ReactNode } from 'react';
import { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
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
  busyLabel?: string;
  destructive?: boolean;
  icon?: IconName;
};

export const DANGER_FILL = '#dc2626';

const MODAL_MAX_WIDTH = 480;

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  primary?: ModalPrimaryAction;
  avoidKeyboard?: boolean;
  cardStyle?: StyleProp<ViewStyle>;
  cancelLabel?: string;
  dialogProps?: object;
  titleIcon?: { name: IconName; color: string };
  secondary?: { label: string; onPress: () => void; disabled?: boolean; icon?: IconName };
  headerAction?: ReactNode;
};

const PHONE_RISE_PX = 48;
const WIDE_START_SCALE = 0.96;

const DISMISS_DRAG_PX = 80;
const DISMISS_VELOCITY = 0.8;

function useCardEntrance(visible: boolean, isWide: boolean) {
  const progress = useSharedValue(visible ? 0 : 1);
  const dragY = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    dragY.value = 0;
    progress.value = 0;
    progress.value = withSpring(1, SPRING);
  }, [visible, progress, dragY]);
  const style = useAnimatedStyle(() =>
    isWide
      ? { transform: [{ scale: WIDE_START_SCALE + (1 - WIDE_START_SCALE) * progress.value }] }
      : { transform: [{ translateY: (1 - progress.value) * PHONE_RISE_PX + dragY.value }] },
  );
  return { style, dragY };
}

function useSwipeToClose(dragY: SharedValue<number>, onClose: () => void, enabled: boolean) {
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => enabled && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          dragY.set(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_DRAG_PX || g.vy > DISMISS_VELOCITY) onClose();
          else dragY.set(withSpring(0, SPRING));
        },
        onPanResponderTerminate: () => {
          dragY.set(withSpring(0, SPRING));
        },
      }),
    [dragY, onClose, enabled],
  );
}

export function ModalShell({
  visible,
  onClose,
  title,
  children,
  primary,
  avoidKeyboard = true,
  cardStyle,
  cancelLabel,
  dialogProps,
  titleIcon,
  headerAction,
  secondary,
}: Props) {
  const c = useAppColors();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSheet = width < SHEET_BREAKPOINT;
  const isWide = width >= BREAKPOINT_MD;
  const frame = { maxWidth: isSheet ? undefined : MODAL_MAX_WIDTH };
  const primaryDisabled = Boolean(primary?.disabled || primary?.busy);
  const { style: entrance, dragY } = useCardEntrance(visible, isWide);
  const swipe = useSwipeToClose(dragY, onClose, isSheet);
  const idBase = useId();
  const titleId = `${idBase}-modal-title`;
  const hasTitle = title != null;
  const webDialogProps: object =
    Platform.OS === 'web' ? { ...(hasTitle ? { 'aria-labelledby': titleId } : {}), ...dialogProps } : {};
  const cancelText = cancelLabel ?? (primary ? 'Cancel' : 'Close');

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
      <View {...(isSheet ? swipe.panHandlers : {})} style={styles.dragZone}>
        {isSheet ? <View style={[styles.grabber, { backgroundColor: c.border }]} /> : null}
        <View style={styles.header}>
          {titleIcon ? <Icon name={titleIcon.name} size={isWide ? 26 : 22} color={titleIcon.color} /> : null}
          {hasTitle ? (
            <Text
              nativeID={titleId}
              style={[styles.title, isWide && styles.titleWide, styles.titleText, { color: c.text }]}
              accessibilityRole="header">
              {title}
            </Text>
          ) : (
            <View style={styles.titleText} />
          )}
          {headerAction}
          <PressableScale
            pressedScale={0.9}
            onPress={onClose}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={(state) => [styles.closeBtn, pressBg(c, state, c.card)]}>
            <Icon name="close" size={20} color={c.textMuted} />
          </PressableScale>
        </View>
      </View>
      {children}
      <View style={[styles.actions, isSheet && styles.actionsSheet]}>
        <PressableScale
          style={(state) => [
            styles.cancelBtn,
            isSheet && styles.flexBtn,
            { borderColor: c.border },
            pressBg(c, state, c.chipBg),
            secondary?.disabled && styles.disabled,
          ]}
          onPress={secondary?.onPress ?? onClose}
          disabled={secondary?.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(secondary?.disabled) }}
          accessibilityLabel={secondary?.label ?? cancelText}>
          <View style={styles.primaryContent}>
            {secondary?.icon ? <Icon name={secondary.icon} size={18} color={c.text} /> : null}
            <Text style={[styles.cancelLabel, { color: c.text }]}>{secondary?.label ?? cancelText}</Text>
          </View>
        </PressableScale>
        {primary ? (
          <PressableScale
            style={[
              styles.primaryBtn,
              isSheet && styles.flexBtn,
              { backgroundColor: primary.destructive ? DANGER_FILL : c.accent },
              primaryDisabled && styles.disabled,
            ]}
            onPress={primary.onPress}
            disabled={primaryDisabled}
            accessibilityRole="button"
            accessibilityLabel={primary.busy ? (primary.busyLabel ?? `${primary.label}, saving`) : primary.label}
            accessibilityState={{ disabled: primaryDisabled, busy: Boolean(primary.busy) }}>
            {primary.busy ? (
              <ActivityIndicator size="small" color={primary.destructive ? '#fff' : c.onAccent} />
            ) : (
              <View style={styles.primaryContent}>
                {primary.icon ? (
                  <Icon name={primary.icon} size={18} color={primary.destructive ? '#fff' : c.onAccent} weight="bold" />
                ) : null}
                <Text style={[styles.primaryLabel, { color: primary.destructive ? '#fff' : c.onAccent }]}>
                  {primary.label}
                </Text>
              </View>
            )}
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      {...webDialogProps}>
      <View style={styles.root}>
        <ModalBackdrop onPress={onClose} importantForAccessibility="no" accessibilityElementsHidden />
        <View
          style={[
            styles.centerWrap,
            isSheet ? styles.sheetWrap : { paddingHorizontal: gutterFor(width) },
            pointer.boxNone,
          ]}>
          {avoidKeyboard ? (
            <KeyboardAvoidingView
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' && !isSheet ? 64 : 0}
              style={[styles.keyboard, frame, styles.kav, isSheet && styles.kavSheet, pointer.boxNone]}>
              {card}
            </KeyboardAvoidingView>
          ) : (
            <View style={[styles.keyboard, frame, styles.kav, isSheet && styles.kavSheet, pointer.boxNone]}>
              {card}
            </View>
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
    ...StyleSheet.absoluteFill,
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
    maxHeight: '85%',
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
    maxHeight: '90%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  title: text.modalTitle,
  dragZone: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleWide: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
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
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
});
