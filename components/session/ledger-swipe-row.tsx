import { PressableScale } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { Icon } from '@/components/icon';
import { useCallback, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

const ACTION_WIDTH = 76;
const CLICK_AFTER_DRAG_MS = 250;

type Props = {
  isRemoving: boolean;
  onCashOut: () => void;
  onRemove: () => void;
  children: (canPress: () => boolean) => ReactNode;
};

export function LedgerSwipeRow({ isRemoving, onCashOut, onRemove, children }: Props) {
  const c = useAppColors();
  const ref = useRef<SwipeableMethods | null>(null);
  const blockUntil = useRef(0);
  const canPress = useCallback(() => Date.now() >= blockUntil.current, []);
  const onDragStart = useCallback(() => {
    blockUntil.current = Number.POSITIVE_INFINITY;
  }, []);
  const onSettle = useCallback(() => {
    blockUntil.current = Date.now() + CLICK_AFTER_DRAG_MS;
  }, []);

  const run = (action: () => void) => () => {
    ref.current?.close();
    action();
  };

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.4}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      dragOffsetFromRightEdge={12}
      onSwipeableOpenStartDrag={onDragStart}
      onSwipeableCloseStartDrag={onDragStart}
      onSwipeableWillOpen={onSettle}
      onSwipeableWillClose={onSettle}
      renderRightActions={() => (
        <View
          style={styles.actions}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden>
          <PressableScale
            focusable={false}
            tabIndex={-1}
            style={[styles.action, { backgroundColor: c.blueBg }]}
            onPress={run(onCashOut)}>
            <Icon name="account-balance-wallet" size={20} color={c.blue} />
            <Text style={[styles.actionLabel, { color: c.blue }]}>Cash out</Text>
          </PressableScale>
          <PressableScale
            focusable={false}
            tabIndex={-1}
            style={[styles.action, { backgroundColor: c.destructive }]}
            disabled={isRemoving}
            onPress={run(onRemove)}>
            <Icon name="delete-outline" size={20} color="#fff" />
            <Text style={[styles.actionLabel, styles.removeLabel]}>Remove</Text>
          </PressableScale>
        </View>
      )}>
      <SwipeRowContent render={children} canPress={canPress} />
    </ReanimatedSwipeable>
  );
}

// Calls the render prop from its own component so the ref-reading canPress is
// only passed down as a prop, never invoked while LedgerSwipeRow renders.
function SwipeRowContent({
  render,
  canPress,
}: {
  render: Props['children'];
  canPress: () => boolean;
}) {
  return render(canPress);
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    width: ACTION_WIDTH * 2,
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  removeLabel: {
    color: '#fff',
  },
});
