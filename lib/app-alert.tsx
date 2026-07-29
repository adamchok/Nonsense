import { useAppColors } from '@/lib/app-theme';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

export type AppAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AppAlertButton = {
  text: string;
  style?: AppAlertButtonStyle;
  onPress?: () => void;
};

type AlertPayload = {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
};

type ShowAlert = (payload: AlertPayload) => void;

let globalShowAlert: ShowAlert | null = null;
/** Alerts fired while the provider is unmounted (startup, fast refresh) — flushed on mount. */
let pendingAlerts: AlertPayload[] = [];
const MAX_PENDING_ALERTS = 5;

/**
 * Imperative API matching `Alert.alert` overloads so you can replace calls in place.
 */
export function appAlert(title: string, message?: string, buttons?: AppAlertButton[]): void;
export function appAlert(title: string, buttons?: AppAlertButton[]): void;
export function appAlert(
  title: string,
  messageOrButtons?: string | AppAlertButton[],
  buttons?: AppAlertButton[]
): void {
  let message: string | undefined;
  let resolvedButtons: AppAlertButton[];

  if (messageOrButtons === undefined) {
    message = undefined;
    resolvedButtons = [{ text: 'OK', style: 'default' }];
  } else if (typeof messageOrButtons === 'string') {
    message = messageOrButtons;
    resolvedButtons =
      buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }];
  } else {
    message = undefined;
    resolvedButtons =
      messageOrButtons.length > 0 ? messageOrButtons : [{ text: 'OK', style: 'default' }];
  }

  if (!globalShowAlert) {
    console.warn('[appAlert] AppAlertProvider is not mounted; alert buffered:', title);
    if (pendingAlerts.length < MAX_PENDING_ALERTS) {
      pendingAlerts.push({ title, message, buttons: resolvedButtons });
    }
    return;
  }

  globalShowAlert({ title, message, buttons: resolvedButtons });
}

/** Same as importing `appAlert` directly; useful if you prefer hook-style access in a component. */
export function useAppAlert(): { alert: typeof appAlert } {
  return { alert: appAlert };
}

function buttonTextStyle(
  style: AppAlertButtonStyle | undefined,
  c: ReturnType<typeof useAppColors>
): StyleProp<TextStyle> {
  switch (style) {
    case 'destructive':
      return { color: c.lossLight };
    case 'cancel':
      return { color: c.textMuted };
    default:
      return { color: c.accent };
  }
}

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const c = useAppColors();
  const [payload, setPayload] = useState<AlertPayload | null>(null);

  const show = useCallback((next: AlertPayload) => {
    setPayload(next);
  }, []);

  useEffect(() => {
    globalShowAlert = show;
    if (pendingAlerts.length > 0) {
      // The modal shows one payload at a time; surface the most recent buffered alert.
      const latest = pendingAlerts[pendingAlerts.length - 1];
      pendingAlerts = [];
      show(latest);
    }
    return () => {
      globalShowAlert = null;
    };
  }, [show]);

  const close = useCallback(() => {
    setPayload(null);
  }, []);

  const onButtonPress = useCallback(
    (btn: AppAlertButton) => {
      try {
        btn.onPress?.();
      } finally {
        close();
      }
    },
    [close]
  );

  const visible = payload != null;
  const buttons = payload?.buttons ?? [];
  const isStacked = buttons.length > 2;

  return (
    <>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}>
        <View style={styles.root}>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]} />
          <View pointerEvents="box-none" style={styles.center}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
                {payload?.title ?? ''}
              </Text>
              {payload?.message ? (
                <Text style={[styles.message, { color: c.textSecondary }]}>{payload.message}</Text>
              ) : null}

              {isStacked ? (
                <View style={styles.buttonColumn}>
                  {buttons.map((btn, i) => (
                    <Pressable
                      key={`${btn.text}-${i}`}
                      onPress={() => onButtonPress(btn)}
                      style={({ pressed }) => [
                        styles.stackedBtn,
                        { borderColor: c.border, backgroundColor: pressed ? c.pressedRow : c.cardAlt },
                      ]}>
                      <Text style={[styles.stackedBtnLabel, buttonTextStyle(btn.style, c)]}>{btn.text}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View
                  style={[
                    styles.buttonRow,
                    buttons.length === 2 && styles.buttonRowOne,
                    buttons.length === 1 && styles.buttonRowOne,
                  ]}>
                  {buttons.map((btn, i) => (
                    <Pressable
                      key={`${btn.text}-${i}`}
                      onPress={() => onButtonPress(btn)}
                      style={({ pressed }) => [
                        styles.rowBtn,
                        { backgroundColor: pressed ? c.pressedRow : 'transparent' },
                      ]}>
                      <Text style={[styles.rowBtnLabel, buttonTextStyle(btn.style, c)]}>{btn.text}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 14,
    borderWidth: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 8,
    alignSelf: 'stretch',
  },
  buttonRowOne: {
    justifyContent: 'flex-end',
  },
  buttonRowTwo: {
    justifyContent: 'space-between',
  },
  rowBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  rowBtnLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonColumn: {
    marginTop: 4,
    gap: 8,
  },
  stackedBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  stackedBtnLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
