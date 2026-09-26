import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { WebContentColumn } from '@/components/web/web-app-frame';
import { WebSidebar } from '@/components/web/web-sidebar';
import { Colors } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppColors } from '@/lib/app-theme';
import { BottomTabBar, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const c = useAppColors();
  const { isMd } = useBreakpoint();

  const screenOptions: BottomTabNavigationOptions = {
    tabBarActiveTintColor: Colors[colorScheme].tint,
    tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
    tabBarStyle: {
      backgroundColor: isDark ? '#151718' : '#ffffff',
      borderTopColor: isDark ? '#2f3542' : '#e2e8f0',
    },
    headerShown: false,
    tabBarButton: HapticTab,
  };

  if (!isWeb) {
    return <Tabs screenOptions={screenOptions}>{tabScreens}</Tabs>;
  }

  // Web: bottom tabs (icon above label) on phones, a left sidebar from BREAKPOINT_MD up.
  return (
    <Tabs
      screenOptions={{
        ...screenOptions,
        tabBarPosition: isMd ? 'left' : 'bottom',
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: c.accentText,
        tabBarInactiveTintColor: c.textMuted,
        tabBarItemStyle: { minHeight: 52 },
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
      tabBarIcon: ({ color, size }) => <IconSymbol size={isWeb ? size : 28} name="house.fill" color={color} />,
    }}
  />,
  <Tabs.Screen
    key="history"
    name="history"
    options={{
      title: 'History',
      tabBarIcon: ({ color, size }) => <IconSymbol size={isWeb ? size : 28} name="clock.fill" color={color} />,
    }}
  />,
  <Tabs.Screen
    key="friends"
    name="friends"
    options={{
      title: 'Friends',
      tabBarIcon: ({ color, size }) => <IconSymbol size={isWeb ? size : 28} name="person.2.fill" color={color} />,
    }}
  />,
  <Tabs.Screen
    key="settings"
    name="settings"
    options={{
      title: 'Settings',
      tabBarIcon: ({ color, size }) => <IconSymbol size={isWeb ? size : 28} name="gearshape.fill" color={color} />,
    }}
  />,
];
