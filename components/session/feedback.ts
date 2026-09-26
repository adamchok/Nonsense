import * as Haptics from 'expo-haptics';
import { AccessibilityInfo } from 'react-native';

export function hapticSuccess() {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticTap() {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}
