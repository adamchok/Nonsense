import type { BottomTabBarProps } from "expo-router/js-tabs";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlatformPressable, CommonActions, useLinkBuilder } from "expo-router/react-navigation";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Animated, SPRING } from '@/components/motion';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { radius, rowMinHeight, sidebarWidth, space, tapTarget } from '@/lib/spacing';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { text } from '@/lib/ui';

const ICON_SIZE = 20;
const ACTIVE_BG_ALPHA = 0.16;
const HOVER_BG_ALPHA = 0.07;
const ITEM_HEIGHT = 44;
const AVATAR_SIZE = 32;
const DEFAULT_AVATAR = '🙂';
const SETTINGS_ROUTE = 'settings';
const ITEM_GAP = 2;

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function WebSidebar({ state, descriptors, navigation }: BottomTabBarProps) {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const { buildHref } = useLinkBuilder();
  const pillY = useSharedValue(state.index * (ITEM_HEIGHT + ITEM_GAP));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    pillY.value = withSpring(state.index * (ITEM_HEIGHT + ITEM_GAP), SPRING);
  }, [state.index, pillY]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pillY.value }] }));

  const navigateToRoute = (route: (typeof state.routes)[number], focused: boolean) => {
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

  const settingsIndex = state.routes.findIndex((r) => r.name === SETTINGS_ROUTE);
  const settingsRoute = settingsIndex >= 0 ? state.routes[settingsIndex] : undefined;

  return (
    <View
      style={[styles.sidebar, { backgroundColor: c.card, borderRightColor: c.border }]}
      role="navigation"
      aria-label="App">
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

      <NewSessionButton />

      <View style={styles.items}>
        <Animated.View
          style={[styles.activePill, { backgroundColor: withAlpha(c.accentText, ACTIVE_BG_ALPHA) }, pillStyle, { pointerEvents: 'none' }]}
        />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = typeof options.title === 'string' ? options.title : route.name;

          return (
            <SidebarItem
              key={route.key}
              label={label}
              focused={focused}
              href={buildHref(route.name, route.params)}
              onPress={() => navigateToRoute(route, focused)}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              renderIcon={(color) =>
                options.tabBarIcon?.({ focused, color, size: ICON_SIZE }) ?? null
              }
            />
          );
        })}
      </View>

      {settingsRoute ? (
        <ProfileRow
          href={buildHref(settingsRoute.name, settingsRoute.params)}
          onPress={() => navigateToRoute(settingsRoute, state.index === settingsIndex)}
        />
      ) : null}
    </View>
  );
}

function NewSessionButton() {
  const c = useAppColors();
  return (
    <Link href="/session/new" asChild>
      <Pressable
        accessibilityRole="link"
        style={({ pressed }) => [styles.newSession, { backgroundColor: c.accent }, pressed && styles.pressed]}>
        <Icon name="add" size={ICON_SIZE} color={c.onAccent} weight="bold" />
        <Text style={[text.button, { color: c.onAccent }]}>New session</Text>
      </Pressable>
    </Link>
  );
}

function ProfileRow({ href, onPress }: { href: string | undefined; onPress: () => void }) {
  const c = useAppColors();
  const { playerProfile } = useAuth();
  const name = playerProfile?.name?.trim() || 'Your profile';
  const avatar = playerProfile?.avatarEmoji || DEFAULT_AVATAR;

  return (
    <View style={[styles.profileWrap, { borderTopColor: c.border }]}>
      <PlatformPressable
        href={href}
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={`${name}, account settings`}
        pressOpacity={0.7}
        style={styles.profileRow}>
        <View style={[styles.avatar, { backgroundColor: c.bg, borderColor: c.border }]}>
          <PlayerAvatar value={avatar} size={AVATAR_SIZE - 2} />
        </View>
        <View style={styles.profileText}>
          <Text style={[text.rowTitle, { color: c.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[text.caption, { color: c.textMuted }]} numberOfLines={1}>
            Account settings
          </Text>
        </View>
      </PlatformPressable>
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
  // Items with an href get the global hover overlay from web-interactions.css; only
  // href-less items (which that CSS skips) need their own hover background.
  const backgroundColor = !focused && hovered && !href ? withAlpha(c.textMuted, HOVER_BG_ALPHA) : 'transparent';

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
    paddingBottom: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    marginBottom: 18,
  },
  newSession: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: tapTarget,
    borderRadius: radius.sm,
    marginBottom: space.lg,
  },
  pressed: {
    opacity: 0.85,
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
    flex: 1,
  },
  profileWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: rowMinHeight,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 17,
    lineHeight: 22,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
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
    fontSize: 15,
    fontWeight: '550' as '500',
  },
});
