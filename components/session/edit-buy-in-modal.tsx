import { errorBorder, FieldError, invalidProps } from '@/components/field-error';
import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { SessionAmountDisplay, SessionAmountInputRow } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import type { SessionAmountUnit } from '@/types';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { amountFieldError, sanitizeAmountInput } from '@/lib/parse-amount';

export type EditBuyInTarget = {
  playerId: string;
  playerName: string;
  currentTotal: number;
};

type Props = {
  visible: boolean;
  target: EditBuyInTarget | null;
  unit: SessionAmountUnit;
  onClose: () => void;
  onSubmit: (target: EditBuyInTarget, amount: string) => Promise<void>;
};

export function EditBuyInModal({ visible, target, unit, onClose, onSubmit }: Props) {
  const c = useAppColors();
  const [amount, setAmount] = useState(target ? String(target.currentTotal) : '');
  const [isSaving, setIsSaving] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  async function save() {
    if (!target) return;
    const error = amountFieldError(amount, { empty: 'Enter an amount' });
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
      title={target ? `Correct total: ${target.playerName}` : undefined}
      titleIcon={{ name: 'edit', color: c.textMuted }}
      primary={{
        label: 'Save',
        onPress: () => void save(),
        disabled: isSaving,
        busy: isSaving,
        icon: 'check',
      }}>
      {target ? (
        <>
          <Text style={[formStyles.sub, { color: c.warning }]}>
            Replaces all of {target.playerName}&apos;s buy-ins with one entry. To add a rebuy, cancel and tap
            their row instead.
          </Text>
          <View style={formStyles.totalRow}>
            <Text style={[formStyles.sub, { color: c.textMuted }]}>Current total: </Text>
            <SessionAmountDisplay
              value={target.currentTotal}
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
                  style={[formStyles.amountInput, { color: c.text }]}
                  autoFocus
                  selectTextOnFocus
                  accessibilityLabel={`New buy-in total for ${target.playerName}`}
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
