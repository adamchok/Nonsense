import { Platform, StyleSheet } from 'react-native';

/** Field and text styles shared by the live-session modals. Colors come from theme tokens at the call site. */
export const formStyles = StyleSheet.create({
  sub: {
    fontSize: 13,
  },
  hint: {
    fontSize: 12,
    marginBottom: 8,
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
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  amountInputWrap: {
    flex: 1,
    // ponytail: web <input> has an intrinsic min width; without this flex rows overflow.
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  amountInputWrapFull: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  fieldsScroll: {
    width: '100%',
  },
  fieldsScrollCapped: {
    maxHeight: 260,
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
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  requiredMark: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
  },
  compactAmountWrap: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 2 : 6,
    minHeight: 40,
  },
  compactTextInput: {
    flex: 1,
    minWidth: 0,
    minHeight: Platform.OS === 'android' ? 34 : 30,
    paddingVertical: Platform.OS === 'android' ? 4 : 2,
    paddingHorizontal: 4,
    fontSize: 13,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : {}),
  },
});
