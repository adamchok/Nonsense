import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { SessionAmountDisplay, SessionAmountInputRow } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import type { SessionAmountUnit } from '@/types';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { sanitizeAmountInput } from '@/lib/parse-amount';

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

/** "Correct total": replaces every buy-in entry for a player with one entry at the new total. */
export function EditBuyInModal({ visible, target, unit, onClose, onSubmit }: Props) {
  const c = useAppColors();
  const [amount, setAmount] = useState(target ? String(target.currentTotal) : '');
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (!target) return;
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
      primary={{
        label: 'Save',
        onPress: () => void save(),
        disabled: isSaving || !amount.trim(),
        busy: isSaving,
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
                onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
                placeholder={unit === 'chips' ? 'Chips' : '0.00'}
                placeholderTextColor={c.placeholder}
                keyboardType="numeric"
                style={[formStyles.amountInput, { color: c.text }]}
                autoFocus
                selectTextOnFocus
                accessibilityLabel={`New buy-in total for ${target.playerName}`}
              />
            </SessionAmountInputRow>
          </View>
        </>
      ) : null}
    </ModalShell>
  );
}
