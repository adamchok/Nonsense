import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { CommonActions, useLinkBuilder } from '@react-navigation/native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Animated, SPRING } from '@/components/motion';

import { useAppColors } from '@/lib/app-theme';
import { radius, sidebarWidth } from '@/lib/spacing';
import { useResolvedColorScheme } from '@/lib/theme-context';

const ICON_SIZE = 20;
const ACTIVE_BG_ALPHA = 0.16;
const HOVER_BG_ALPHA = 0.07;
const ITEM_HEIGHT = 42;
const ITEM_GAP = 2;

/** `#rrggbb` + alpha -> `rgba(...)`; theme accents are all 6-digit hex. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Tablet/desktop web navigation: a full-height left sidebar rendered as the bottom-tabs
 * `tabBar` with `tabBarPosition: 'left'`. Mirrors BottomTabBar's press semantics
 * (tabPress event, preventDefault, links with real hrefs).
 */
export function WebSidebar({ state, descriptors, navigation }: BottomTabBarProps) {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const { buildHref } = useLinkBuilder();
  const pillY = useSharedValue(state.index * (ITEM_HEIGHT + ITEM_GAP));
  const isFirstRender = useRef(true);

  // The active pill springs between items instead of the highlight jumping.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    pillY.value = withSpring(state.index * (ITEM_HEIGHT + ITEM_GAP), SPRING);
  }, [state.index, pillY]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pillY.value }] }));

  return (
    <View
      style={[styles.sidebar, { backgroundColor: c.card, borderRightColor: c.border }]}
      role="navigation"
      aria-label="Main">
      <View style={styles.brand}>
        <Image
          source={
            scheme === 'dark'
              ? require('@/assets/images/logo-mark.png')
              : require('@/assets/images/logo-mark-light.png')
          }
          style={styles.logo}
          resizeMode="contain"
          accessible={false}
        />
        <Text style={[styles.brandName, { color: c.text }]}>Nonsense</Text>
      </View>

      <View style={styles.items}>
        <Animated.View
          pointerEvents="none"
          style={[styles.activePill, { backgroundColor: withAlpha(c.accentText, ACTIVE_BG_ALPHA) }, pillStyle]}
        />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = typeof options.title === 'string' ? options.title : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.dispatch({
                ...CommonActions.navigate(route),
                target: state.key,
              });
            }
          };

          return (
            <SidebarItem
              key={route.key}
              label={label}
              focused={focused}
              href={buildHref(route.name, route.params)}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              renderIcon={(color) =>
                options.tabBarIcon?.({ focused, color, size: ICON_SIZE }) ?? null
              }
            />
          );
        })}
      </View>
    </View>
  );
}

type SidebarItemProps = {
  label: string;
  focused: boolean;
  href: string | undefined;
  onPress: () => void;
  onLongPress: () => void;
  renderIcon: (color: string) => ReactNode;
};

function SidebarItem({ label, focused, href, onPress, onLongPress, renderIcon }: SidebarItemProps) {
  const c = useAppColors();
  const [hovered, setHovered] = useState(false);
  const color = focused || hovered ? (focused ? c.accentText : c.text) : c.textMuted;
  // The focused item's tint is the sliding pill drawn behind the items.
  const backgroundColor = !focused && hovered ? withAlpha(c.textMuted, HOVER_BG_ALPHA) : 'transparent';

  return (
    <PlatformPressable
      href={href}
      onPress={onPress}
      onLongPress={onLongPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityState={{ selected: focused }}
      aria-current={focused ? 'page' : undefined}
      pressOpacity={0.7}
      style={[styles.item, { backgroundColor }]}>
      {renderIcon(color)}
      <Text style={[styles.itemLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </PlatformPressable>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: sidebarWidth,
    height: '100%',
    borderRightWidth: 1,
    paddingTop: 20,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    marginBottom: 22,
  },
  logo: {
    width: 40,
    height: 40,
  },
  brandName: {
    fontSize: 17,
    fontWeight: '700',
  },
  items: {
    gap: ITEM_GAP,
  },
  activePill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: radius.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: ITEM_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '550' as '500',
  },
});
