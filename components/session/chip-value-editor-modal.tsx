import { errorBorder, FieldError, invalidProps } from '@/components/field-error';
import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { useAppColors } from '@/lib/app-theme';
import { scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import { parseAmount, sanitizeAmountInput } from '@/lib/parse-amount';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
};

export function ChipValueEditorModal({ visible, initialValue, onClose, onSubmit }: Props) {
  const c = useAppColors();
  const [draft, setDraft] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  async function save() {
    const parsed = parseAmount(draft);
    const nextError = !draft.trim()
      ? 'Enter a chip value'
      : parsed == null
        ? 'Enter a number'
        : parsed <= 0
          ? 'Must be more than 0'
          : null;
    setError(nextError);
    if (nextError) return;
    setIsSaving(true);
    try {
      await onSubmit(draft);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Dollars per chip"
      primary={{
        label: 'Save',
        onPress: () => void save(),
        disabled: isSaving,
        busy: isSaving,
      }}>
      <Text style={[formStyles.hint, { color: c.textMuted }]}>
        Used to show dollar equivalents for chip stacks, blinds, and the ledger. Buy-ins and cash-outs stay in
        chips.
      </Text>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        style={formStyles.fieldsScroll}
        contentContainerStyle={formStyles.fieldsScrollContent}>
        <View style={styles.field}>
          <View style={formStyles.fieldLabelRow}>
            <Text style={[formStyles.fieldLabel, { color: c.textMuted }]}>Dollar per chip</Text>
            <Text style={[formStyles.requiredMark, { color: c.loss }]}>*</Text>
          </View>
          <View>
            <View
              style={[
                formStyles.compactAmountWrap,
                { borderColor: c.inputBorder, backgroundColor: c.inputBg },
                errorBorder(c, error),
              ]}>
              <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
              <TextInput
                value={draft}
                onChangeText={(t) => {
                  setDraft(sanitizeAmountInput(t));
                  setError(null);
                }}
                placeholder="0.50"
                accessibilityLabel="Dollars per chip"
                placeholderTextColor={c.placeholder}
                keyboardType="decimal-pad"
                onFocus={() => scrollModalFieldToTop(scrollRef)}
                style={[formStyles.compactTextInput, { color: c.text }]}
                {...invalidProps(error)}
              />
            </View>
            <FieldError message={error} />
          </View>
          <Text style={[styles.example, { color: c.textHint }]}>
            Example: 100 chips for a $50 buy-in → $0.50 per chip.
          </Text>
        </View>
      </ScrollView>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 7,
    alignSelf: 'stretch',
  },
  dollarSign: {
    fontSize: 15,
    fontWeight: '600',
  },
  example: {
    fontSize: 11,
    lineHeight: 15,
  },
});
