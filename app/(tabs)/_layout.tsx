import { HapticTab } from '@/components/haptic-tab';
import { Icon } from '@/components/icon';
import { WebContentColumn } from '@/components/web/web-app-frame';
import { WebSidebar } from '@/components/web/web-sidebar';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useAppColors } from '@/lib/app-theme';
import { BottomTabBar, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const isWeb = Platform.OS === 'web';

export default function TabLayout() {
  const c = useAppColors();
  const { isMd } = useBreakpoint();
  const reduceMotion = useReducedMotion();

  const tabBarColors = {
    backgroundColor: c.card,
    borderTopColor: c.border,
  };
  const screenOptions: BottomTabNavigationOptions = {
    tabBarActiveTintColor: c.accentText,
    tabBarInactiveTintColor: c.textMuted,
    tabBarStyle: tabBarColors,
    headerShown: false,
    tabBarButton: HapticTab,
    animation: reduceMotion ? 'none' : 'fade',
  };

  if (!isWeb) {
    return <Tabs screenOptions={screenOptions}>{tabScreens}</Tabs>;
  }

  return (
    <Tabs
      screenOptions={{
        ...screenOptions,
        tabBarPosition: isMd ? 'left' : 'bottom',
        tabBarLabelPosition: 'below-icon',
        tabBarItemStyle: { minHeight: 52, borderRadius: 14, marginHorizontal: 6 },
        tabBarStyle: {
          ...tabBarColors,
          height: 'auto',
          paddingTop: 6,
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))' as unknown as number,
        },
      }}
      tabBar={(props) => (isMd ? <WebSidebar {...props} /> : <BottomTabBar {...props} />)}
      screenLayout={({ children }) => <WebContentColumn besideSidebar>{children}</WebContentColumn>}>
      {tabScreens}
    </Tabs>
  );
}

const tabScreens = [
  <Tabs.Screen
    key="index"
    name="index"
    options={{
      title: 'Home',
      tabBarIcon: ({ color, size, focused }) => (
        <Icon size={isWeb ? size : 28} name="home" color={color} weight={focused ? 'fill' : 'regular'} />
      ),
    }}
  />,
  <Tabs.Screen
    key="history"
    name="history"
    options={{
      title: 'History',
      tabBarIcon: ({ color, size, focused }) => (
        <Icon size={isWeb ? size : 28} name="history" color={color} weight={focused ? 'fill' : 'regular'} />
      ),
    }}
  />,
  <Tabs.Screen
    key="friends"
    name="friends"
    options={{
      title: 'Friends',
      tabBarIcon: ({ color, size, focused }) => (
        <Icon size={isWeb ? size : 28} name="people" color={color} weight={focused ? 'fill' : 'regular'} />
      ),
    }}
  />,
  <Tabs.Screen
    key="settings"
    name="settings"
    options={{
      title: 'Settings',
      tabBarIcon: ({ color, size, focused }) => (
        <Icon size={isWeb ? size : 28} name="settings" color={color} weight={focused ? 'fill' : 'regular'} />
      ),
    }}
  />,
];
