import { Icon, type IconName } from '@/components/icon';
import { ModalBackdrop } from '@/components/modal-backdrop';
import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { SHEET_BREAKPOINT, radius, rowMinHeight, space } from '@/lib/spacing';
import { pressBg, text } from '@/lib/ui';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

const IS_WEB = Platform.OS === 'web';
const MENU_WIDTH = 220;
const POPOVER_ITEM_HEIGHT = 40;
const ANCHOR_GAP = 4;
const EDGE_GAP = 8;
const MENU_HEIGHT_ESTIMATE = POPOVER_ITEM_HEIGHT * 3 + space.sm * 3;

export type MenuAnchor = { x: number; y: number; width: number; height: number };

export type PlayerMenuAction = {
  key: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  actions: PlayerMenuAction[];
  anchor: MenuAnchor | null;
  onClose: () => void;
};

type WebKeyEvent = { key: string; preventDefault: () => void };
type WebNode = { querySelectorAll: (selector: string) => ArrayLike<{ focus: () => void }> };

function menuItems(node: unknown): { focus: () => void }[] {
  if (!IS_WEB || !node) return [];
  return Array.from((node as WebNode).querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])'));
}

function nextIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

function popoverPosition(anchor: MenuAnchor, winW: number, winH: number): ViewStyle {
  const right = Math.max(EDGE_GAP, winW - (anchor.x + anchor.width));
  const below = anchor.y + anchor.height + ANCHOR_GAP;
  if (below + MENU_HEIGHT_ESTIMATE > winH - EDGE_GAP) {
    return { position: 'absolute', right, bottom: Math.max(EDGE_GAP, winH - anchor.y + ANCHOR_GAP) };
  }
  return { position: 'absolute', right, top: below };
}

export function PlayerActionMenu({ visible, title, actions, anchor, onClose }: Props) {
  const c = useAppColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const menuRef = useRef<View>(null);
  const popoverAnchor = width >= SHEET_BREAKPOINT ? anchor : null;
  const isSheet = popoverAnchor == null;

  useEffect(() => {
    if (!IS_WEB || !visible) return;
    const frame = requestAnimationFrame(() => menuItems(menuRef.current)[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const onKeyDown = (e: WebKeyEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      onClose();
      return;
    }
    const items = menuItems(menuRef.current);
    if (items.length === 0) return;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    const current = items.findIndex((el) => (el as unknown) === active);
    const next = nextIndex(e.key, current, items.length);
    if (next == null) return;
    e.preventDefault();
    items[next].focus();
  };

  const webMenuProps: object = IS_WEB ? { onKeyDown, 'aria-label': `Actions for ${title}` } : {};
  const frame: ViewStyle[] = popoverAnchor
    ? [styles.popover, popoverPosition(popoverAnchor, width, height)]
    : [styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom + space.sm) }];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => onClose()}>
      <View style={styles.root}>
        {isSheet ? (
          <ModalBackdrop onPress={() => onClose()} importantForAccessibility="no" accessibilityElementsHidden />
        ) : (
          <Pressable
            accessible={false}
            {...(IS_WEB ? ({ tabIndex: -1 } as object) : {})}
            onPress={() => onClose()}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          ref={menuRef}
          accessibilityRole="menu"
          accessibilityViewIsModal
          onAccessibilityEscape={() => onClose()}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, ...frame]}
          {...webMenuProps}>
          {isSheet ? (
            <>
              <View style={[styles.grabber, { backgroundColor: c.border }]} />
              <Text style={[text.heading, styles.sheetTitle, { color: c.text }]} numberOfLines={1}>
                {title}
              </Text>
            </>
          ) : null}
          {actions.map((action, index) => {
            const startsDanger = action.destructive && index > 0 && !actions[index - 1].destructive;
            const color = action.destructive ? c.lossLight : c.text;
            return (
              <View key={action.key}>
                {startsDanger ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                <PressableScale
                  pressedScale={0.98}
                  disabled={action.disabled}
                  accessibilityRole="menuitem"
                  accessibilityState={{ disabled: !!action.disabled }}
                  {...(IS_WEB ? ({ tabIndex: -1 } as object) : {})}
                  onPress={() => {
                    onClose();
                    action.onSelect();
                  }}
                  style={(state) => [
                    styles.item,
                    !isSheet && styles.popoverItem,
                    pressBg(c, state),
                    action.disabled && styles.disabled,
                  ]}>
                  <Icon
                    name={action.icon}
                    size={isSheet ? 20 : 18}
                    color={action.destructive ? c.lossLight : c.textSecondary}
                  />
                  <Text style={[text.body, { color }]}>{action.label}</Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    padding: space.sm,
    gap: space.xxs,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomWidth: 0,
    paddingTop: space.sm,
    paddingHorizontal: space.md,
  },
  popover: {
    width: MENU_WIDTH,
    borderRadius: radius.md,
    boxShadow: '0 8px 24px rgba(5, 7, 10, 0.35)',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: space.sm,
  },
  sheetTitle: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  item: {
    minHeight: rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  popoverItem: {
    minHeight: POPOVER_ITEM_HEIGHT,
    gap: space.sm + 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: space.xs,
    marginHorizontal: space.sm,
  },
  disabled: {
    opacity: 0.4,
  },
});
