export type WebDateInputProps = {
  /** YYYY-MM-DD, or '' for no date. */
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
  colors: { text: string; background: string; border: string };
};

/**
 * Browser date field used where @react-native-community/datetimepicker renders nothing
 * (web). Native builds never render it; the real implementation is the `.web.tsx` twin.
 */
export function WebDateInput(_props: WebDateInputProps) {
  return null;
}
