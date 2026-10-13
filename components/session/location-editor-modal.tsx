import { ModalShell } from '@/components/session/modal-shell';
import { formStyles } from '@/components/session/session-form-styles';
import { useAppColors } from '@/lib/app-theme';
import { MAX_LOCATION_LENGTH } from '@/lib/firestore-coerce';
import { scrollModalFieldToTop } from '@/lib/modal-keyboard-scroll';
import { useRef, useState } from 'react';
import { ScrollView, TextInput } from 'react-native';

type Props = {
  visible: boolean;
  initialLocation: string;
  onClose: () => void;
  onSubmit: (location: string) => Promise<void>;
};

export function LocationEditorModal({ visible, initialLocation, onClose, onSubmit }: Props) {
  const c = useAppColors();
  const [draft, setDraft] = useState(initialLocation);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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
      title="Edit location"
      titleIcon={{ name: 'place', color: c.textMuted }}
      primary={{ label: 'Save', onPress: () => void save(), disabled: isSaving, busy: isSaving, icon: 'check' }}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        style={formStyles.fieldsScroll}
        contentContainerStyle={formStyles.fieldsScrollContent}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Location"
          maxLength={MAX_LOCATION_LENGTH}
          accessibilityLabel="Location"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          placeholderTextColor={c.placeholder}
          onFocus={() => scrollModalFieldToTop(scrollRef)}
          style={[formStyles.input, { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text }]}
        />
      </ScrollView>
    </ModalShell>
  );
}
