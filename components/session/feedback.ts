import * as Haptics from 'expo-haptics';
import { AccessibilityInfo } from 'react-native';

/** Confirms a write the host can't otherwise feel in a loud room (buy-in added, cash-out saved). */
export function hapticSuccess() {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Lighter tap for reversing an action (undo). */
export function hapticTap() {
  if (process.env.EXPO_OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}
