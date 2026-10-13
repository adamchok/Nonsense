import { errorBorder, FieldError, invalidProps } from '@/components/field-error';
import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { SessionAmountDisplay, SessionAmountInputRow } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import type { SessionAmountUnit } from '@/types';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { amountFieldError, sanitizeAmountInput } from '@/lib/parse-amount';

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
  const [amountError, setAmountError] = useState<string | null>(null);

  async function confirm() {
    if (!target || isSaving) return;
    const error = amountFieldError(amount, { empty: 'Enter an amount (0 if they lost it all)', allowZero: true });
    setAmountError(error);
    if (error) return;
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
      titleIcon={{ name: 'money-out', color: c.textMuted }}
      primary={{
        label: 'Confirm',
        onPress: () => void confirm(),
        busy: isSaving,
        icon: 'check',
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
          <View>
            <View style={formStyles.inputRow}>
              <SessionAmountInputRow
                unit={unit}
                color={c.textMuted}
                iconSize={16}
                style={[
                  formStyles.amountInputWrap,
                  formStyles.amountInputWrapFull,
                  { borderColor: c.inputBorder, backgroundColor: c.inputBg },
                  errorBorder(c, amountError),
                ]}>
                <TextInput
                  value={amount}
                  onChangeText={(t) => {
                    setAmount(sanitizeAmountInput(t));
                    setAmountError(null);
                  }}
                  placeholder={unit === 'chips' ? 'Chips' : '0.00'}
                  placeholderTextColor={c.placeholder}
                  keyboardType="decimal-pad"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => void confirm()}
                  accessibilityLabel={`Cash-out ${unit === 'chips' ? 'chips' : 'amount'} for ${target.playerName}`}
                  style={[formStyles.amountInput, { color: c.text }]}
                  {...invalidProps(amountError)}
                />
              </SessionAmountInputRow>
            </View>
            <FieldError message={amountError} />
          </View>
        </>
      ) : null}
    </ModalShell>
  );
}
