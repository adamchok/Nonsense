import { errorBorder, FieldError, invalidProps } from '@/components/field-error';
import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { SessionAmountInputRow } from '@/components/session-amount-ui';
import { useAppColors } from '@/lib/app-theme';
import { scrollModalFieldToEnd, scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import { parseAmount, sanitizeAmountInput } from '@/lib/parse-amount';
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
  const [smallBlindError, setSmallBlindError] = useState<string | null>(null);
  const [bigBlindError, setBigBlindError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  async function save() {
    const sbError = blindError(smallBlind, 'small');
    const bb = parseAmount(bigBlind);
    const sb = parseAmount(smallBlind);
    const bbError =
      blindError(bigBlind, 'big') ??
      (sb != null && bb != null && bb < sb ? 'Big blind must be at least the small blind' : null);
    setSmallBlindError(sbError);
    setBigBlindError(bbError);
    if (sbError || bbError) return;
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
        disabled: isSaving,
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
            onChange={(v) => {
              setSmallBlind(v);
              setSmallBlindError(null);
              // "Big blind must be at least the small blind" may no longer hold.
              setBigBlindError(null);
            }}
            error={smallBlindError}
            unit={unit}
            onFocus={() => scrollModalFieldToTop(scrollRef)}
          />
          <BlindField
            label="Big blind"
            value={bigBlind}
            onChange={(v) => {
              setBigBlind(v);
              setBigBlindError(null);
            }}
            error={bigBlindError}
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
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: SessionAmountUnit;
  onFocus: () => void;
  error: string | null;
}) {
  const c = useAppColors();
  return (
    <View style={styles.field}>
      <View style={formStyles.fieldLabelRow}>
        <Text style={[formStyles.fieldLabel, { color: c.textMuted }]}>{label}</Text>
        <Text style={[formStyles.requiredMark, { color: c.loss }]}>*</Text>
      </View>
      <SessionAmountInputRow
        unit={unit}
        color={c.textMuted}
        iconSize={16}
        style={[
          formStyles.compactAmountWrap,
          { borderColor: c.inputBorder, backgroundColor: c.inputBg },
          errorBorder(c, error),
        ]}>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(sanitizeAmountInput(t))}
          placeholder="0"
          accessibilityLabel={unit === 'chips' ? `${label} in chips` : label}
          placeholderTextColor={c.placeholder}
          keyboardType="decimal-pad"
          onFocus={onFocus}
          style={[formStyles.compactTextInput, { color: c.text }]}
          {...invalidProps(error)}
        />
      </SessionAmountInputRow>
      <FieldError message={error} />
    </View>
  );
}

function blindError(value: string, which: 'small' | 'big'): string | null {
  if (!value.trim()) return `Enter the ${which} blind`;
  const parsed = parseAmount(value);
  if (parsed == null) return 'Enter a number';
  return parsed > 0 ? null : 'Must be more than 0';
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
    gap: 7,
  },
});
