import { Platform, StyleSheet } from 'react-native';

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
