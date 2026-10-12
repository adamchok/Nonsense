import { Icon, type IconName } from '@/components/icon';
import { Animated, PressableScale, SPRING } from '@/components/motion';
import { useAppColors } from '@/lib/app-theme';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export type SegmentedTab<K extends string> = { key: K; label: string; icon: IconName };

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

type WebKeyEvent = {
  key: string;
  preventDefault: () => void;
  currentTarget: unknown;
};

type FocusableParent = {
  parentElement?: { querySelectorAll: (selector: string) => ArrayLike<{ focus: () => void }> } | null;
};

function focusRadioAt(target: unknown, index: number): void {
  const radios = (target as FocusableParent).parentElement?.querySelectorAll('[role="radio"]');
  radios?.[index]?.focus();
}

type Props<K extends string> = {
  tabs: readonly SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  variant?: 'tabs' | 'radio';
};

export function SegmentedTabs<K extends string>({ tabs, value, onChange, variant = 'tabs' }: Props<K>) {
  const isRadio = variant === 'radio';
  const c = useAppColors();
  const [layouts, setLayouts] = useState<Partial<Record<K, LayoutRectangle>>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const placed = useRef(false);
  const selectedLayout = layouts[value];
  const isWebRadio = isRadio && Platform.OS === 'web';
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === value),
  );

  // Web radio groups use a roving tabindex: one tab stop, arrows move and select.
  const radioKeyDown = (e: WebKeyEvent, index: number) => {
    const step = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0;
    if (step === 0 || tabs.length === 0) return;
    e.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    focusRadioAt(e.currentTarget, next);
  };

  useEffect(() => {
    if (!selectedLayout) return;
    if (!placed.current) {
      x.value = selectedLayout.x;
      width.value = selectedLayout.width;
      placed.current = true;
      return;
    }
    x.value = withSpring(selectedLayout.x, SPRING);
    width.value = withSpring(selectedLayout.width, SPRING);
  }, [selectedLayout, x, width]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: x.value }],
  }));

  return (
    <View style={[styles.track, { backgroundColor: c.inputBg, borderColor: c.border }]} accessibilityRole={isRadio ? 'radiogroup' : 'tablist'}>
      {selectedLayout ? (
        <Animated.View
          style={[styles.indicator, { backgroundColor: c.accentBg, top: selectedLayout.y, height: selectedLayout.height }, indicatorStyle, { pointerEvents: 'none' }]}
        />
      ) : null}
      {tabs.map((tab, index) => {
        const selected = tab.key === value;
        const color = selected ? c.accentText : c.textMuted;
        const webRadioProps = isWebRadio
          ? ({
              tabIndex: index === selectedIndex ? 0 : -1,
              onKeyDown: (e: WebKeyEvent) => radioKeyDown(e, index),
            } as object)
          : {};
        return (
          <PressableScale
            key={tab.key}
            pressedScale={0.97}
            onLayout={(e) => {
              const next = e.nativeEvent.layout;
              setLayouts((prev) => {
                const cur = prev[tab.key];
                if (cur && cur.x === next.x && cur.width === next.width && cur.y === next.y && cur.height === next.height) return prev;
                return { ...prev, [tab.key]: next };
              });
            }}
            accessibilityRole={isRadio ? 'radio' : 'tab'}
            accessibilityState={isRadio ? { checked: selected } : { selected }}
            aria-selected={isRadio ? undefined : selected}
            aria-checked={isRadio ? selected : undefined}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            {...webRadioProps}
            style={[styles.tab, selected && !selectedLayout && { backgroundColor: c.accentBg }]}>
            <Icon name={tab.icon} size={18} color={color} weight={selected ? 'fill' : 'regular'} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    borderRadius: 10,
  },
  tab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
