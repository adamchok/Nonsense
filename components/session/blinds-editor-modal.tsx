import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { SessionAmountInputRow } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { scrollModalFieldToEnd, scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import { parseAmount } from '@/lib/parse-amount';
import { isValidBlinds } from '@/lib/session-view';
import type { SessionAmountUnit } from '@/types';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  visible: boolean;
  initialSmallBlind: string;
  initialBigBlind: string;
  unit: SessionAmountUnit;
  onClose: () => void;
  onSubmit: (smallBlind: string, bigBlind: string) => Promise<void>;
};

export function BlindsEditorModal({
  visible,
  initialSmallBlind,
  initialBigBlind,
  unit,
  onClose,
  onSubmit,
}: Props) {
  const c = useAppColors();
  const [smallBlind, setSmallBlind] = useState(initialSmallBlind);
  const [bigBlind, setBigBlind] = useState(initialBigBlind);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isValid = isValidBlinds(parseAmount(smallBlind), parseAmount(bigBlind));

  async function save() {
    setIsSaving(true);
    try {
      await onSubmit(smallBlind, bigBlind);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Edit blinds"
      primary={{
        label: 'Save',
        onPress: () => void save(),
        disabled: isSaving || !isValid,
        busy: isSaving,
      }}>
      <Text style={[formStyles.hint, { color: c.textMuted }]}>
        {unit === 'chips'
          ? 'Enter blinds in chips. Big blind must be at least the small blind.'
          : 'Small and big blind are required. Big blind must be at least the small blind.'}
      </Text>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={formStyles.fieldsScrollCapped}
        contentContainerStyle={formStyles.fieldsScrollContent}>
        <View style={styles.inputs}>
          <BlindField
            label="Small blind"
            value={smallBlind}
            onChange={setSmallBlind}
            unit={unit}
            onFocus={() => scrollModalFieldToTop(scrollRef)}
          />
          <BlindField
            label="Big blind"
            value={bigBlind}
            onChange={setBigBlind}
            unit={unit}
            onFocus={() => scrollModalFieldToEnd(scrollRef)}
          />
        </View>
      </ScrollView>
    </ModalShell>
  );
}

function BlindField({
  label,
  value,
  onChange,
  unit,
  onFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: SessionAmountUnit;
  onFocus: () => void;
}) {
  const c = useAppColors();
  return (
    <View style={styles.field}>
      <View style={formStyles.fieldLabelRow}>
        <Text style={[formStyles.fieldLabel, { color: c.textHint }]}>{label}</Text>
        <Text style={[formStyles.requiredMark, { color: c.loss }]}>*</Text>
      </View>
      <SessionAmountInputRow
        unit={unit}
        color={c.textMuted}
        iconSize={16}
        style={[formStyles.compactAmountWrap, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="0"
          accessibilityLabel={unit === 'chips' ? `${label} in chips` : label}
          placeholderTextColor={c.placeholder}
          keyboardType="decimal-pad"
          onFocus={onFocus}
          style={[formStyles.compactTextInput, { color: c.text }]}
        />
      </SessionAmountInputRow>
    </View>
  );
}

const styles = StyleSheet.create({
  inputs: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  field: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
});
