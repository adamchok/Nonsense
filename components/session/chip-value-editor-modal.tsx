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
  const scrollRef = useRef<ScrollView>(null);

  const parsed = parseAmount(draft);
  const isValid = parsed != null && parsed > 0;

  async function save() {
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
        disabled: isSaving || !isValid,
        busy: isSaving,
      }}>
      <Text style={[formStyles.hint, { color: c.textMuted }]}>
        Used to show dollar equivalents for chip stacks, blinds, and the ledger. Buy-ins and cash-outs stay in
        chips.
      </Text>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={formStyles.fieldsScroll}
        contentContainerStyle={formStyles.fieldsScrollContent}>
        <View style={styles.field}>
          <View style={formStyles.fieldLabelRow}>
            <Text style={[formStyles.fieldLabel, { color: c.textMuted }]}>Dollar per chip</Text>
            <Text style={[formStyles.requiredMark, { color: c.loss }]}>*</Text>
          </View>
          <View style={[formStyles.compactAmountWrap, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
            <Text style={[styles.dollarSign, { color: c.textMuted }]}>$</Text>
            <TextInput
              value={draft}
              onChangeText={(t) => setDraft(sanitizeAmountInput(t))}
              placeholder="0.50"
              accessibilityLabel="Dollars per chip"
              placeholderTextColor={c.placeholder}
              keyboardType="decimal-pad"
              onFocus={() => scrollModalFieldToTop(scrollRef)}
              style={[formStyles.compactTextInput, { color: c.text }]}
            />
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
