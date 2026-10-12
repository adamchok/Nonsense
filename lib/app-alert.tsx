import { text } from '@/lib/ui';
import { ModalShell } from '@/components/session/modal-shell';
import type { IconName } from '@/components/icon';
import { useAppColors } from '@/lib/app-theme';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Platform, Text } from 'react-native';

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
  buttons?: AppAlertButton[],
): void {
  let message: string | undefined;
  let resolvedButtons: AppAlertButton[];

  if (messageOrButtons === undefined) {
    message = undefined;
    resolvedButtons = [{ text: 'OK', style: 'default' }];
  } else if (typeof messageOrButtons === 'string') {
    message = messageOrButtons;
    resolvedButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }];
  } else {
    message = undefined;
    resolvedButtons = messageOrButtons.length > 0 ? messageOrButtons : [{ text: 'OK', style: 'default' }];
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

const ACTION_ICONS: [RegExp, IconName][] = [
  [/^(delete|discard)/i, 'delete-outline'],
  [/^remove/i, 'person-remove'],
  [/^(leave|sign out)/i, 'logout'],
  [/^(decline|cancel request)/i, 'close'],
  [/^(accept|settle|confirm)/i, 'check'],
];

function actionIcon(label: string): IconName | undefined {
  return ACTION_ICONS.find(([re]) => re.test(label))?.[1];
}

const FAILURE_TITLE = /fail|error|could not|couldn't|unavailable|not available/i;

function alertIcon(
  payload: AlertPayload | null,
  primary: AppAlertButton | undefined,
  c: ReturnType<typeof useAppColors>,
): { name: IconName; color: string } | undefined {
  if (!payload) return undefined;
  if (primary?.style === 'destructive') return { name: 'warning', color: c.loss };
  if (FAILURE_TITLE.test(payload.title)) return { name: 'error-outline', color: c.loss };
  return { name: 'info', color: c.textMuted };
}

function useAlertDialogRoleRef(isAlertDialog: boolean) {
  return useCallback(
    (node: unknown) => {
      if (Platform.OS !== 'web' || !isAlertDialog || typeof MutationObserver === 'undefined') return;
      if (!(node instanceof HTMLElement)) return;
      const enforce = () => {
        if (node.getAttribute('role') === 'dialog') node.setAttribute('role', 'alertdialog');
      };
      enforce();
      const observer = new MutationObserver(enforce);
      observer.observe(node, { attributes: true, attributeFilter: ['role'] });
      return () => {
        observer.disconnect();
        if (node.getAttribute('role') === 'alertdialog') node.setAttribute('role', 'dialog');
      };
    },
    [isAlertDialog],
  );
}

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const c = useAppColors();
  const [payload, setPayload] = useState<AlertPayload | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((next: AlertPayload) => {
    setPayload(next);
    setOpen(true);
  }, []);

  useEffect(() => {
    globalShowAlert = show;
    if (pendingAlerts.length > 0) {
      const latest = pendingAlerts[pendingAlerts.length - 1];
      pendingAlerts = [];
      queueMicrotask(() => show(latest));
    }
    return () => {
      globalShowAlert = null;
    };
  }, [show]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const onButtonPress = useCallback(
    (btn: AppAlertButton) => {
      try {
        btn.onPress?.();
      } finally {
        close();
      }
    },
    [close],
  );

  const buttons = payload?.buttons ?? [];
  const primaryBtn = buttons.length > 1 ? (buttons.find((b) => b.style !== 'cancel') ?? buttons[1]) : undefined;
  const cancelBtn = buttons.find((b) => b !== primaryBtn) ?? buttons[0];
  const idBase = useId();
  const messageId = `${idBase}-alert-message`;
  const hasMessage = Boolean(payload?.message);
  const dialogRoleRef = useAlertDialogRoleRef(primaryBtn != null);
  const titleIcon = alertIcon(payload, primaryBtn, c);

  return (
    <>
      {children}
      <ModalShell
        visible={open}
        onClose={() => (cancelBtn ? onButtonPress(cancelBtn) : close())}
        title={payload?.title ?? ''}
        avoidKeyboard={false}
        cancelLabel={cancelBtn?.text}
        titleIcon={titleIcon}
        dialogProps={{ ref: dialogRoleRef, ...(hasMessage ? { 'aria-describedby': messageId } : {}) }}
        primary={
          primaryBtn
            ? {
                label: primaryBtn.text,
                onPress: () => onButtonPress(primaryBtn),
                destructive: primaryBtn.style === 'destructive',
                icon: actionIcon(primaryBtn.text),
              }
            : undefined
        }>
        {payload?.message ? (
          <Text nativeID={messageId} style={[text.body, { color: c.textSecondary }]}>
            {payload.message}
          </Text>
        ) : null}
      </ModalShell>
    </>
  );
}
