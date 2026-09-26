import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { SessionAmountDisplay, SessionAmountInputRow } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import type { SessionAmountUnit } from '@/types';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

export type CashOutTarget = {
  playerId: string;
  playerName: string;
  totalBuyIn: number;
};

type Props = {
  visible: boolean;
  target: CashOutTarget | null;
  initialAmount: string;
  unit: SessionAmountUnit;
  onClose: () => void;
  onSubmit: (target: CashOutTarget, amount: string) => Promise<void>;
};

export function EarlyCashOutModal({ visible, target, initialAmount, unit, onClose, onSubmit }: Props) {
  const c = useAppColors();
  const [amount, setAmount] = useState(initialAmount);
  const [isSaving, setIsSaving] = useState(false);

  async function confirm() {
    if (!target || isSaving || !amount.trim()) return;
    setIsSaving(true);
    try {
      await onSubmit(target, amount);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell
      visible={visible && target != null}
      onClose={onClose}
      title={target ? `Cash out: ${target.playerName}` : undefined}
      primary={{
        label: 'Confirm',
        onPress: () => void confirm(),
        disabled: !amount.trim(),
        busy: isSaving,
      }}>
      {target ? (
        <>
          <View style={formStyles.totalRow}>
            <Text style={[formStyles.sub, { color: c.textMuted }]}>Buy-in total: </Text>
            <SessionAmountDisplay
              value={target.totalBuyIn}
              unit={unit}
              color={c.textMuted}
              iconSize={14}
              valueStyle="ledger"
              textStyle={[formStyles.sub, { color: c.textMuted }]}
            />
          </View>
          <View style={formStyles.inputRow}>
            <SessionAmountInputRow
              unit={unit}
              color={c.textMuted}
              iconSize={16}
              style={[
                formStyles.amountInputWrap,
                formStyles.amountInputWrapFull,
                { borderColor: c.inputBorder, backgroundColor: c.inputBg },
              ]}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder={unit === 'chips' ? 'Chips' : '0.00'}
                placeholderTextColor={c.placeholder}
                keyboardType="numeric"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void confirm()}
                accessibilityLabel={`Cash-out ${unit === 'chips' ? 'chips' : 'amount'} for ${target.playerName}`}
                style={[formStyles.amountInput, { color: c.text }]}
              />
            </SessionAmountInputRow>
          </View>
        </>
      ) : null}
    </ModalShell>
  );
}
