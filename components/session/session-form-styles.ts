import { Platform, StyleSheet } from 'react-native';

/** Field and text styles shared by the live-session modals. Colors come from theme tokens at the call site. */
export const formStyles = StyleSheet.create({
  sub: {
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  totalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 4,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    width: '100%',
  },
  /** Text field: 48 min height, 12/14 padding, radius 9, 1px inputBorder (color at call site). */
  input: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  amountInputWrap: {
    flex: 1,
    // ponytail: web <input> has an intrinsic min width; without this flex rows overflow.
    minWidth: 0,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  amountInputWrapFull: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 4,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  fieldsScroll: {
    width: '100%',
  },
  fieldsScrollCapped: {
    maxHeight: 280,
    width: '100%',
  },
  fieldsScrollContent: {
    paddingBottom: 4,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  requiredMark: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 13,
  },
  compactAmountWrap: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  compactTextInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    paddingVertical: Platform.OS === 'android' ? 8 : 12,
    paddingHorizontal: 4,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : {}),
  },
});
