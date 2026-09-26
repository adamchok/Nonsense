import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { CommonActions, useLinkBuilder } from '@react-navigation/native';
import { useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '@/lib/app-theme';
import { radius, sidebarWidth } from '@/lib/spacing';
import { useResolvedColorScheme } from '@/lib/theme-context';

const ICON_SIZE = 20;
const ACTIVE_BG_ALPHA = 0.16;
const HOVER_BG_ALPHA = 0.07;

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
  const backgroundColor = focused
    ? withAlpha(c.accentText, ACTIVE_BG_ALPHA)
    : hovered
      ? withAlpha(c.textMuted, HOVER_BG_ALPHA)
      : 'transparent';

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
    gap: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '550' as '500',
  },
});
