import { text } from '@/lib/ui';
import { ModalBackdrop } from '@/components/modal-backdrop';
import { useAppColors } from '@/lib/app-theme';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SHEET_BREAKPOINT } from '@/lib/spacing';

const DANGER_FILL = '#dc2626';

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
let pendingAlerts: AlertPayload[] = [];
const MAX_PENDING_ALERTS = 5;

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
      return { color: c.accentText };
  }
}

function sheetButtonStyle(
  style: AppAlertButtonStyle | undefined,
  c: ReturnType<typeof useAppColors>
): { box: StyleProp<ViewStyle>; text: StyleProp<TextStyle> } {
  switch (style) {
    case 'destructive':
      return { box: { backgroundColor: DANGER_FILL }, text: { color: '#fff' } };
    case 'cancel':
      return { box: { borderWidth: 1, borderColor: c.border }, text: { color: c.text } };
    default:
      return { box: { backgroundColor: c.accent }, text: { color: c.onAccent } };
  }
}

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const c = useAppColors();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [payload, setPayload] = useState<AlertPayload | null>(null);

  const show = useCallback((next: AlertPayload) => {
    setPayload(next);
  }, []);

  useEffect(() => {
    globalShowAlert = show;
    if (pendingAlerts.length > 0) {
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
  const isSheet = width < SHEET_BREAKPOINT && buttons.length > 1;
  const isStacked = buttons.length > 2;
  const cancelButton = buttons.find((b) => b.style === 'cancel');

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
          {isSheet && cancelButton ? (
            <ModalBackdrop
              onPress={() => onButtonPress(cancelButton)}
              accessible={false}
              tabIndex={-1}
            />
          ) : (
            <ModalBackdrop />
          )}
          {isSheet ? (
            <View pointerEvents="box-none" style={styles.sheetFrame}>
              <View
                accessibilityViewIsModal
                style={[
                  styles.sheet,
                  { backgroundColor: c.card, borderColor: c.border, paddingBottom: Math.max(20, insets.bottom + 12) },
                ]}>
                <View style={[styles.grabber, { backgroundColor: c.border }]} />
                <Text style={[styles.sheetTitle, { color: c.text }]} accessibilityRole="header">
                  {payload?.title ?? ''}
                </Text>
                {payload?.message ? (
                  <Text style={[styles.sheetMessage, { color: c.textSecondary }]}>{payload.message}</Text>
                ) : null}
                <View style={isStacked ? styles.sheetColumn : styles.sheetRow}>
                  {buttons.map((btn, i) => {
                    const look = sheetButtonStyle(btn.style, c);
                    return (
                      <Pressable
                        key={`${btn.text}-${i}`}
                        onPress={() => onButtonPress(btn)}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.sheetBtn,
                          !isStacked && styles.sheetBtnFlex,
                          look.box,
                          pressed && styles.sheetBtnPressed,
                        ]}>
                        <Text style={[styles.sheetBtnLabel, look.text]}>{btn.text}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : (
          <View pointerEvents="box-none" style={styles.center}>
            <View
              accessibilityViewIsModal
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
                      accessibilityRole="button"
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
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.rowBtn,
                        { backgroundColor: pressed ? c.pressedRow : 'transparent' },
                      ]}>
                      <Text style={[styles.rowBtnLabel, buttonTextStyle(btn.style, c)]}>{btn.text}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  sheetFrame: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 10,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  sheetTitle: text.modalTitle,
  sheetMessage: { fontSize: 15, lineHeight: 22 },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  sheetColumn: { gap: 10, marginTop: 10 },
  sheetBtn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  sheetBtnFlex: { flex: 1 },
  sheetBtnPressed: { opacity: 0.85 },
  sheetBtnLabel: { fontSize: 16, fontWeight: '700' },
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
  title: text.modalTitle,
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackedBtnLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
