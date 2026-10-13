import { PlayerAvatar } from '@/components/player-avatar';
import { PlatformPressable } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname, useRouter, type Href } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { Animated, SPRING } from '@/components/motion';

import { useAppColors } from '@/lib/app-theme';
import { useAuth } from '@/lib/auth-context';
import { radius, rowMinHeight, sidebarWidth, space, tapTarget } from '@/lib/spacing';
import { useResolvedColorScheme } from '@/lib/theme-context';
import { pointer, text } from '@/lib/ui';

const ICON_SIZE = 20;
const ACTIVE_BG_ALPHA = 0.16;
const ITEM_HEIGHT = 44;
const AVATAR_SIZE = 32;
const DEFAULT_AVATAR = '🙂';
const ITEM_GAP = 2;
const COLLAPSED_WIDTH = 72;
const SIDEBAR_PAD_TOP = 20;
const SIDEBAR_PAD_BOTTOM = 12;
const SIDEBAR_PAD_X = 14;
const COLLAPSE_STORAGE_KEY = 'nonsense.sidebarCollapsed';
const COLLAPSE_TIMING = { duration: 220, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

type LabelStyle = AnimatedStyle<{ opacity: number }>;

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(COLLAPSE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage?.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
  }
}

type NavItem = { label: string; href: string; icon: IconName };

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: 'home' },
  { label: 'History', href: '/history', icon: 'history' },
  { label: 'Friends', href: '/friends', icon: 'people' },
  { label: 'Profile', href: '/profile', icon: 'person' },
];
const PROFILE_INDEX = 3;

function activeIndexFor(pathname: string): number {
  if (pathname === '/' || (pathname.startsWith('/session/') && !pathname.startsWith('/session/summary'))) return 0;
  if (pathname.startsWith('/history') || pathname.startsWith('/session/summary')) return 1;
  if (pathname.startsWith('/friends')) return 2;
  if (pathname.startsWith('/profile') || pathname.startsWith('/locations') || pathname.startsWith('/qr-code') ||
    pathname.startsWith('/change-password') ||
    pathname.startsWith('/delete-account')) {
    return PROFILE_INDEX;
  }
  return -1;
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function WebSidebar() {
  const c = useAppColors();
  const scheme = useResolvedColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const activeIndex = activeIndexFor(pathname);
  const pillY = useSharedValue(Math.max(0, activeIndex) * (ITEM_HEIGHT + ITEM_GAP));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (activeIndex < 0) return;
    const y = activeIndex * (ITEM_HEIGHT + ITEM_GAP);
    if (isFirstRender.current) {
      isFirstRender.current = false;
      pillY.value = y;
      return;
    }
    pillY.value = withSpring(y, SPRING);
  }, [activeIndex, pillY]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pillY.value }] }));
  const go = (href: string) => router.navigate(href as Href);

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const width = useSharedValue(collapsed ? COLLAPSED_WIDTH : sidebarWidth);
  const labelOpacity = useSharedValue(collapsed ? 0 : 1);
  useEffect(() => {
    width.value = withTiming(collapsed ? COLLAPSED_WIDTH : sidebarWidth, COLLAPSE_TIMING);
    labelOpacity.value = withTiming(collapsed ? 0 : 1, { ...COLLAPSE_TIMING, duration: collapsed ? 120 : 260 });
  }, [collapsed, width, labelOpacity]);
  const widthStyle = useAnimatedStyle(() => ({ width: width.value }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      writeCollapsed(!prev);
      return !prev;
    });
  };

  return (
    <Animated.View
      style={[
        styles.sidebar,
        {
          backgroundColor: c.card,
          borderRightColor: c.border,
          paddingTop: SIDEBAR_PAD_TOP + insets.top,
          paddingLeft: SIDEBAR_PAD_X + insets.left,
        },
        widthStyle,
      ]}
      role="navigation"
      aria-label="App">
      <Link href="/" asChild>
        <Pressable
          role="link"
          aria-label="Nonsense home"
          {...({ dataSet: { plainLink: 'true' } } as object)}
          style={StyleSheet.flatten(styles.brand)}>
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
          <Animated.Text style={[styles.brandName, { color: c.text }, labelStyle]} numberOfLines={1}>
            Nonsense
          </Animated.Text>
        </Pressable>
      </Link>

      <NewSessionButton collapsed={collapsed} labelStyle={labelStyle} />

      <View style={styles.items}>
        <Animated.View
          style={[
            styles.activePill,
            { backgroundColor: withAlpha(c.accentText, ACTIVE_BG_ALPHA), opacity: activeIndex < 0 ? 0 : 1 },
            pillStyle,
            pointer.none,
          ]}
        />
        {NAV_ITEMS.map((item, index) => (
          <SidebarItem
            key={item.href}
            item={item}
            focused={activeIndex === index}
            isCurrentPage={pathname === item.href}
            onPress={() => go(item.href)}
            labelStyle={labelStyle}
          />
        ))}
      </View>

      <CollapseToggle collapsed={collapsed} onPress={toggleCollapsed} labelStyle={labelStyle} />
      <ProfileRow
        href={NAV_ITEMS[PROFILE_INDEX].href}
        onPress={() => go(NAV_ITEMS[PROFILE_INDEX].href)}
        labelStyle={labelStyle}
      />
    </Animated.View>
  );
}

function CollapseToggle({
  collapsed,
  onPress,
  labelStyle,
}: {
  collapsed: boolean;
  onPress: () => void;
  labelStyle: LabelStyle;
}) {
  const c = useAppColors();
  const [hovered, setHovered] = useState(false);
  const color = hovered ? c.text : c.textMuted;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!collapsed}
      style={[styles.item, styles.collapseToggle]}>
      <Icon name="sidebar" size={ICON_SIZE} color={color} style={styles.noShrink} />
      <Animated.Text style={[styles.itemLabel, { color }, labelStyle]} numberOfLines={1}>
        Collapse
      </Animated.Text>
    </Pressable>
  );
}

function NewSessionButton({ collapsed, labelStyle }: { collapsed: boolean; labelStyle: LabelStyle }) {
  const c = useAppColors();
  return (
    <Link href="/session/new" asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="New session"
        style={StyleSheet.flatten([styles.newSession, { backgroundColor: c.accent }])}>
        <Icon name="add" size={ICON_SIZE} color={c.onAccent} weight="bold" style={styles.noShrink} />
        {collapsed ? null : (
          <Animated.Text style={[text.button, { color: c.onAccent }, labelStyle]} numberOfLines={1}>
            New session
          </Animated.Text>
        )}
      </Pressable>
    </Link>
  );
}

function ProfileRow({ href, onPress, labelStyle }: { href: string; onPress: () => void; labelStyle: LabelStyle }) {
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
        accessibilityLabel={`${name}, profile`}
        pressOpacity={0.7}
        style={styles.profileRow}>
        <View style={[styles.avatar, { backgroundColor: c.bg, borderColor: c.border }]}>
          <PlayerAvatar value={avatar} size={AVATAR_SIZE - 2} />
        </View>
        <Animated.View style={[styles.profileText, labelStyle]}>
          <Text style={[text.rowTitle, { color: c.text }]} numberOfLines={1}>
            {name}
          </Text>
        </Animated.View>
      </PlatformPressable>
    </View>
  );
}

type SidebarItemProps = {
  item: NavItem;
  focused: boolean;
  isCurrentPage: boolean;
  onPress: () => void;
  labelStyle: LabelStyle;
};

function SidebarItem({ item, focused, isCurrentPage, onPress, labelStyle }: SidebarItemProps) {
  const c = useAppColors();
  const [hovered, setHovered] = useState(false);
  const color = focused ? c.accentText : hovered ? c.text : c.textMuted;

  return (
    <PlatformPressable
      href={item.href}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: focused }}
      aria-current={isCurrentPage ? 'page' : undefined}
      pressOpacity={0.7}
      style={styles.item}>
      <Icon name={item.icon} size={ICON_SIZE} color={color} weight={focused ? 'fill' : 'regular'} style={styles.noShrink} />
      <Animated.Text style={[styles.itemLabel, { color }, labelStyle]} numberOfLines={1}>
        {item.label}
      </Animated.Text>
    </PlatformPressable>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: sidebarWidth,
    height: '100%',
    borderRightWidth: 1,
    paddingHorizontal: SIDEBAR_PAD_X,
    paddingBottom: SIDEBAR_PAD_BOTTOM,
    overflow: 'hidden',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
    marginBottom: 18,
    borderRadius: radius.sm,
  },
  collapseToggle: {
    marginBottom: space.xs,
  },
  newSession: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: tapTarget,
    borderRadius: radius.sm,
    marginBottom: space.lg,
    overflow: 'hidden',
  },
  noShrink: {
    flexShrink: 0,
  },
  logo: {
    flexShrink: 0,
    width: 40,
    height: 40,
  },
  brandName: {
    flexShrink: 1,
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
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  avatar: {
    flexShrink: 0,
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
    overflow: 'hidden',
  },
  itemLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '550' as '500',
  },
});
