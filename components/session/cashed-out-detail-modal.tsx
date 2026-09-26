import { ModalShell } from '@/components/session/modal-shell';
import { SessionAmountDisplay } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { formatCashOutTimestamp } from '@/lib/session-view';
import type { EarlyCashOut, SessionAmountUnit } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type CashedOutDetail = {
  playerId: string;
  name: string;
  totalBuyIn: number;
  cashOut: EarlyCashOut;
};

type Props = {
  detail: CashedOutDetail | null;
  unit: SessionAmountUnit;
  canBuyBack: boolean;
  onClose: () => void;
  onBuyBackIn: (playerId: string, name: string) => void;
};

export function CashedOutDetailModal({ detail, unit, canBuyBack, onClose, onBuyBackIn }: Props) {
  const c = useAppColors();
  const delta = detail ? detail.cashOut.amount - detail.totalBuyIn : 0;
  const resultColor = delta >= 0 ? c.profit : c.lossLight;

  return (
    <ModalShell
      visible={detail != null}
      onClose={onClose}
      title={detail?.name}
      avoidKeyboard={false}
      cardStyle={styles.card}>
      {detail ? (
        <>
          <Text style={[styles.subtitle, { color: c.textHint }]}>Early cash-out</Text>
          <View style={styles.rows}>
            <DetailRow label="Total buy-in">
              <Amount value={detail.totalBuyIn} unit={unit} color={c.textSecondary} />
            </DetailRow>
            <DetailRow label="Cashed out">
              <Amount value={detail.cashOut.amount} unit={unit} color={c.textSecondary} />
            </DetailRow>
            <DetailRow label="Result" valueStyle={styles.resultValue}>
              {delta >= 0 ? <Text style={[styles.value, { color: c.profit }]}>+</Text> : null}
              <Amount value={delta} unit={unit} color={resultColor} />
            </DetailRow>
            <View style={styles.row}>
              <Text style={[styles.label, { color: c.textMuted }]}>Cashed out at</Text>
              <Text style={[styles.valueMuted, { color: c.textMuted }]}>
                {formatCashOutTimestamp(detail.cashOut.cashedOutAt)}
              </Text>
            </View>
          </View>

          {canBuyBack ? (
            <Pressable
              style={[styles.buyBackBtn, { backgroundColor: c.chipBg, borderColor: c.borderAmber }]}
              onPress={() => onBuyBackIn(detail.playerId, detail.name)}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${detail.name} back in`}
              accessibilityHint="Opens the buy-in form for their new chips">
              <MaterialIcons name="replay" size={18} color={c.warning} />
              <Text style={[styles.buyBackLabel, { color: c.warning }]}>Buy Back In</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </ModalShell>
  );
}

function DetailRow({
  label,
  children,
  valueStyle,
}: {
  label: string;
  children: ReactNode;
  valueStyle?: StyleProp<ViewStyle>;
}) {
  const c = useAppColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text>
      <View style={[styles.valueCol, valueStyle]}>{children}</View>
    </View>
  );
}

function Amount({ value, unit, color }: { value: number; unit: SessionAmountUnit; color: string }) {
  return (
    <SessionAmountDisplay
      value={value}
      unit={unit}
      color={color}
      iconSize={14}
      valueStyle="ledger"
      textStyle={[styles.value, { color }]}
      rowStyle={styles.valueRowEnd}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 360,
    borderRadius: 12,
    gap: 14,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: -6,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  label: {
    fontSize: 14,
    flex: 1,
  },
  valueCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '55%',
  },
  valueRowEnd: {
    justifyContent: 'flex-end',
  },
  resultValue: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  value: {
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'right',
  },
  valueMuted: {
    fontSize: 13,
    textAlign: 'right',
  },
  buyBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    minHeight: 48,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  buyBackLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
