import { SessionAmountDisplay } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { formatSessionAmountValue } from '@/lib/currency-format';
import { text as type, pressBg, ui } from '@/lib/ui';
import { ledgerRowValues, type LedgerPlayer } from '@/lib/session-view';
import type { EarlyCashOut, SessionAmountUnit } from '@/types';
import { Icon } from '@/components/icon';
import { memo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type ViewStyle,
} from 'react-native';

export type LedgerRowHandlers = {
  /** Row tap: add a rebuy for this player. */
  onRebuy: (player: LedgerPlayer) => void;
  /** Row long-press: replace the player's total. */
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
  /** Host viewing an active session. */
  canAct: boolean;
  isRemoving: boolean;
  /** Rows after the first draw a divider above themselves. */
  showDivider: boolean;
  displayUnit: SessionAmountUnit;
  /** Set when the ledger is converting chips to dollars. */
  dollarsPerChip: number | undefined;
};

function spoken(value: number, unit: SessionAmountUnit): string {
  const text = formatSessionAmountValue(value, unit, 'ledger');
  return unit === 'chips' ? `${text} chips` : text;
}

/** One screen-reader stop per row: name, role and every amount the row shows. */
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

  const rowBg = isHostRow ? c.accentBg : c.card;
  const rowStyle: ViewStyle[] = [ui.row, styles.row, { backgroundColor: rowBg, borderColor: c.border }];
  if (showDivider) rowStyle.push(ui.rowDivider);

  const inner = (
    <>
      <View
        style={[ui.tile, { backgroundColor: isHostRow ? c.card : c.cardAlt, borderColor: c.border }, styles.tile]}
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
                  <Text style={styles.badgeText}>HOST</Text>
                </View>
              ) : null}
              {isCashedOut ? (
                <View style={[styles.badge, { backgroundColor: c.badge.cashedOut }]}>
                  <Text style={styles.badgeText}>CASHED OUT</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.amounts}>
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
              <Text style={[styles.cashOutResult, { color: c.textMuted }]}>Out:</Text>
              <SessionAmountDisplay
                value={values.cashOut}
                unit={displayUnit}
                color={c.textMuted}
                iconSize={12}
                valueStyle="ledger"
                textStyle={[styles.cashOutResult, { color: c.textMuted }]}
              />
              <Text style={[styles.cashOutResult, { color: c.textMuted }]}>(</Text>
              {values.result >= 0 ? (
                <Text style={[styles.cashOutResult, { color: resultColor }]}>+</Text>
              ) : null}
              <SessionAmountDisplay
                value={values.result}
                unit={displayUnit}
                color={resultColor}
                iconSize={12}
                valueStyle="ledger"
                textStyle={[styles.cashOutResult, { color: resultColor }]}
              />
              <Text style={[styles.cashOutResult, { color: c.textMuted }]}>)</Text>
            </View>
          ) : null}
        </View>
      </View>
      {canAct && !isCashedOut ? (
        // Hidden from screen readers: the same actions are on the row's accessibilityActions.
        <View style={styles.actions} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: c.blueBg }]}
            hitSlop={4}
            onPress={() => onCashOut(player)}>
            <Icon name="account-balance-wallet" size={20} color={c.blue} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { borderColor: c.borderDanger }, styles.iconBtnOutline]}
            disabled={isRemoving}
            hitSlop={4}
            onPress={() => onRemove(player)}>
            {isRemoving ? (
              <Text style={[styles.removeLabel, { color: c.lossLight }]}>…</Text>
            ) : (
              <Icon name="delete-outline" size={20} color={c.lossLight} />
            )}
          </Pressable>
        </View>
      ) : null}
      {canAct && isCashedOut ? (
        <Icon name="chevron-right" size={22} color={c.textMuted} importantForAccessibility="no" />
      ) : null}
    </>
  );

  if (canAct && isCashedOut) {
    return (
      <Pressable
        style={(state) => [...rowStyle, pressBg(c, state, rowBg)]}
        onPress={() => onOpenCashedOut(player.playerId)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens early cash-out details">
        {inner}
      </Pressable>
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
    return (
      <Pressable
        style={(state) => [...rowStyle, pressBg(c, state, rowBg)]}
        onPress={() => onRebuy(player)}
        onLongPress={() => onCorrectTotal(player)}
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
      </Pressable>
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
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  amounts: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 80,
  },
  cashOutSubline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  cashOutResult: {
    fontSize: 12,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnOutline: {
    borderWidth: 1,
  },
  removeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
