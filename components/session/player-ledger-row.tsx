import { SessionAmountDisplay } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { formatSessionAmountValue } from '@/lib/currency-format';
import { text as type, pressBg, ui } from '@/lib/ui';
import { ledgerRowValues, type LedgerPlayer } from '@/lib/session-view';
import type { EarlyCashOut, SessionAmountUnit } from '@/types';
import { Icon } from '@/components/icon';
import { Animated, PressableScale } from '@/components/motion';
import { LedgerSwipeRow } from '@/components/session/ledger-swipe-row';
import { useAmountFlash } from '@/components/session/use-amount-flash';
import { PlayerActionMenu, type MenuAnchor, type PlayerMenuAction } from '@/components/session/player-action-menu';
import { space, tapTarget } from '@/lib/spacing';
import { memo, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type ViewStyle,
} from 'react-native';

// Native screen readers reach the row's actions through accessibilityActions, so the visual
// "more" button stays hidden there to avoid a duplicate focus stop. Web has no accessibility
// actions, so the button must stay reachable and labeled.
const IS_WEB = Platform.OS === 'web';
const ACTIONS_A11Y_HIDDEN =
  IS_WEB
    ? {}
    : ({ importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const);

export type LedgerRowHandlers = {
  onRebuy: (player: LedgerPlayer) => void;
  onCorrectTotal: (player: LedgerPlayer) => void;
  onOpenCashedOut: (playerId: string) => void;
  onCashOut: (player: LedgerPlayer) => void;
  onRemove: (player: LedgerPlayer) => void;
};

type Props = LedgerRowHandlers & {
  player: LedgerPlayer;
  cashOut: EarlyCashOut | undefined;
  avatar: string;
  isHostRow: boolean;
  canAct: boolean;
  isRemoving: boolean;
  showDivider: boolean;
  displayUnit: SessionAmountUnit;
  dollarsPerChip: number | undefined;
};

const ROW_PRESSED_SCALE = 0.985;

function spoken(value: number, unit: SessionAmountUnit): string {
  const text = formatSessionAmountValue(value, unit, 'ledger');
  return unit === 'chips' ? `${text} chips` : text;
}

function rowLabel(
  player: LedgerPlayer,
  isHostRow: boolean,
  values: ReturnType<typeof ledgerRowValues>,
  isCashedOut: boolean,
  unit: SessionAmountUnit
): string {
  const parts = [player.name];
  if (isHostRow) parts.push('host');
  parts.push(`bought in ${spoken(values.buyIn, unit)}`);
  if (isCashedOut) {
    parts.push(`cashed out ${spoken(values.cashOut, unit)}`);
    parts.push(`${values.result >= 0 ? 'up' : 'down'} ${spoken(Math.abs(values.result), unit)}`);
  }
  return parts.join(', ');
}

export const PlayerLedgerRow = memo(function PlayerLedgerRow({
  player,
  cashOut,
  avatar,
  isHostRow,
  canAct,
  isRemoving,
  showDivider,
  displayUnit,
  dollarsPerChip,
  onRebuy,
  onCorrectTotal,
  onOpenCashedOut,
  onCashOut,
  onRemove,
}: Props) {
  const c = useAppColors();
  const isCashedOut = !!cashOut;
  const values = ledgerRowValues(player.total, cashOut?.amount, dollarsPerChip);
  const resultColor = values.result >= 0 ? c.profit : c.lossLight;
  const label = rowLabel(player, isHostRow, values, isCashedOut, displayUnit);
  const flashStyle = useAmountFlash(player.total);

  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<View>(null);
  const moreId = `ledger-more-${useId().replace(/:/g, '')}`;

  const openMenu = () => {
    const node = moreRef.current;
    if (!node) {
      setMenuAnchor(null);
      setMenuOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  };
  const closeMenu = () => {
    setMenuOpen(false);
    if (IS_WEB && typeof document !== 'undefined') document.getElementById(moreId)?.focus();
  };
  const menuActions: PlayerMenuAction[] = [
    { key: 'cashOut', label: 'Cash out', icon: 'account-balance-wallet', onSelect: () => onCashOut(player) },
    { key: 'correctTotal', label: 'Correct total', icon: 'edit', onSelect: () => onCorrectTotal(player) },
    {
      key: 'remove',
      label: 'Remove',
      icon: 'delete-outline',
      destructive: true,
      disabled: isRemoving,
      onSelect: () => onRemove(player),
    },
  ];

  const rowBg = c.card;
  const rowStyle: ViewStyle[] = [ui.row, styles.row, { backgroundColor: rowBg, borderColor: c.border }];
  if (showDivider) rowStyle.push(ui.rowDivider);

  const summary = (
    <>
      <View
        style={[ui.tile, { backgroundColor: c.cardAlt, borderColor: c.border }, styles.tile]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden>
        <Text style={styles.avatar}>{avatar}</Text>
      </View>
      <View style={styles.left}>
        <View style={styles.info}>
          <View style={styles.infoInline}>
            <Text
              style={[type.rowTitle, styles.name, { color: isCashedOut ? c.textMuted : c.text }]}
              numberOfLines={1}>
              {player.name}
            </Text>
          </View>
          {isHostRow || isCashedOut ? (
            <View style={styles.badges}>
              {isHostRow ? (
                <View style={[styles.badge, { backgroundColor: c.badge.host }]}>
                  <Text style={[type.micro, styles.badgeText]}>HOST</Text>
                </View>
              ) : null}
              {isCashedOut ? (
                <View style={[styles.badge, { backgroundColor: c.badge.cashedOut }]}>
                  <Text style={[type.micro, styles.badgeText]}>CASHED OUT</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.amounts}>
          <Animated.View
            pointerEvents="none"
            style={[styles.flash, { backgroundColor: c.accent }, flashStyle]}
          />
          <SessionAmountDisplay
            value={values.buyIn}
            unit={displayUnit}
            color={isCashedOut ? c.textMuted : c.text}
            iconSize={14}
            valueStyle="ledger"
            textStyle={[type.amount, { color: isCashedOut ? c.textMuted : c.text }]}
          />
          {isCashedOut ? (
            <View style={styles.cashOutSubline}>
              <Text style={[type.caption, styles.cashOutResult, { color: c.textMuted }]}>Out:</Text>
              <SessionAmountDisplay
                value={values.cashOut}
                unit={displayUnit}
                color={c.textMuted}
                iconSize={12}
                valueStyle="ledger"
                textStyle={[type.caption, styles.cashOutResult, { color: c.textMuted }]}
              />
              <Text style={[type.caption, styles.cashOutResult, { color: c.textMuted }]}>(</Text>
              {values.result >= 0 ? (
                <Text style={[type.caption, styles.cashOutResult, { color: resultColor }]}>+</Text>
              ) : null}
              <SessionAmountDisplay
                value={values.result}
                unit={displayUnit}
                color={resultColor}
                iconSize={12}
                valueStyle="ledger"
                textStyle={[type.caption, styles.cashOutResult, { color: resultColor }]}
              />
              <Text style={[type.caption, styles.cashOutResult, { color: c.textMuted }]}>)</Text>
            </View>
          ) : null}
        </View>
      </View>
    </>
  );

  const webTriggerProps: object = IS_WEB
    ? { 'aria-haspopup': 'menu', 'aria-expanded': menuOpen }
    : {};

  const trailing = (
    <>
      {canAct && !isCashedOut ? (
        <View ref={moreRef} collapsable={false} style={styles.actions} {...ACTIONS_A11Y_HIDDEN}>
          <PressableScale
            nativeID={moreId}
            pressedScale={0.92}
            style={(state) => [styles.moreBtn, { borderColor: c.border }, pressBg(c, state)]}
            disabled={isRemoving}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${player.name}`}
            accessibilityState={{ disabled: isRemoving, busy: isRemoving, expanded: menuOpen }}
            {...webTriggerProps}
            onPress={openMenu}>
            {isRemoving ? (
              <ActivityIndicator size="small" color={c.textSecondary} />
            ) : (
              <Icon name="more-vert" size={20} color={c.textSecondary} weight="bold" />
            )}
          </PressableScale>
        </View>
      ) : null}
      {canAct && !isCashedOut ? (
        <PlayerActionMenu
          visible={menuOpen}
          title={player.name}
          actions={menuActions}
          anchor={menuAnchor}
          onClose={closeMenu}
        />
      ) : null}
      {canAct && isCashedOut ? (
        <Icon name="chevron-right" size={22} color={c.textMuted} importantForAccessibility="no" />
      ) : null}
    </>
  );

  const inner = (
    <>
      {summary}
      {trailing}
    </>
  );

  if (canAct && isCashedOut) {
    return (
      <PressableScale
        pressedScale={ROW_PRESSED_SCALE}
        style={(state) => [...rowStyle, pressBg(c, state, rowBg)]}
        onPress={() => onOpenCashedOut(player.playerId)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens early cash-out details">
        {inner}
      </PressableScale>
    );
  }

  if (canAct) {
    const onAction = (e: AccessibilityActionEvent) => {
      switch (e.nativeEvent.actionName) {
        case 'cashOut':
          onCashOut(player);
          break;
        case 'remove':
          onRemove(player);
          break;
        case 'correctTotal':
        case 'longpress':
          onCorrectTotal(player);
          break;
      }
    };
    if (IS_WEB) {
      // Web: the row is a labelled group, not a button, so the rebuy action and the
      // "more" menu trigger (Cash out / Correct total / Remove) are siblings instead of nested.
      // The rebuy button stretches under the summary so the whole row stays clickable.
      return (
        <LedgerSwipeRow
          isRemoving={isRemoving}
          onCashOut={() => onCashOut(player)}
          onRemove={() => onRemove(player)}>
          {(canPress) => (
            <View style={[...rowStyle, styles.webRow]} role="group" aria-label={label}>
              <PressableScale
                pressedScale={1}
                style={(state) => [StyleSheet.absoluteFill, pressBg(c, state, rowBg)]}
                onPress={() => {
                  if (canPress()) onRebuy(player);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Rebuy ${player.name}`}
              />
              <View style={styles.webSummary} pointerEvents="none">
                {summary}
              </View>
              {trailing}
            </View>
          )}
        </LedgerSwipeRow>
      );
    }
    return (
      <LedgerSwipeRow
        isRemoving={isRemoving}
        onCashOut={() => onCashOut(player)}
        onRemove={() => onRemove(player)}>
        {(canPress) => (
          <PressableScale
            pressedScale={ROW_PRESSED_SCALE}
            style={(state) => [...rowStyle, pressBg(c, state, rowBg)]}
            onPress={() => {
              if (canPress()) onRebuy(player);
            }}
            onLongPress={() => {
              if (canPress()) onCorrectTotal(player);
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Double tap to add a rebuy"
            accessibilityActions={[
              { name: 'cashOut', label: `Cash out ${player.name}` },
              { name: 'remove', label: `Remove ${player.name}` },
              { name: 'correctTotal', label: 'Correct total' },
            ]}
            onAccessibilityAction={onAction}>
            {inner}
          </PressableScale>
        )}
      </LedgerSwipeRow>
    );
  }

  return (
    <View style={rowStyle} accessible accessibilityLabel={label}>
      {inner}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    gap: 12,
  },
  webRow: {
    position: 'relative',
  },
  webSummary: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tile: {
    borderWidth: 1,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  infoInline: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  avatar: {
    fontSize: 16,
    lineHeight: 20,
  },
  name: {
    flexShrink: 1,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    // Badge fills are dark in both themes, so the label stays white.
    color: '#fff',
    letterSpacing: 0.5,
  },
  amounts: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 80,
  },
  flash: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -8,
    right: -8,
    borderRadius: 8,
    opacity: 0,
  },
  cashOutSubline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  cashOutResult: {
    marginTop: space.xxs,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moreBtn: {
    width: tapTarget,
    height: tapTarget,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
