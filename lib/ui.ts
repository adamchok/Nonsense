import type { AppColors } from '@/lib/app-theme';
import { radius, rowMinHeight, space } from '@/lib/spacing';
import { Platform, StyleSheet, type PressableStateCallbackType, type ViewStyle } from 'react-native';

type PressState = PressableStateCallbackType & { hovered?: boolean };

export function pressBg(c: AppColors, state: PressableStateCallbackType, base?: string): ViewStyle | null {
  const { pressed, hovered } = state as PressState;
  if (pressed) return { backgroundColor: c.pressedRow };
  if (hovered) return { backgroundColor: c.cardAlt };
  return base ? { backgroundColor: base } : null;
}

const WEB_BLUR = { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as unknown as ViewStyle;

export function scrim(c: AppColors): ViewStyle {
  return {
    ...StyleSheet.absoluteFill,
    backgroundColor: c.overlay,
    ...(Platform.OS === 'web' ? WEB_BLUR : null),
  };
}

export const text = StyleSheet.create({
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  modalTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2, marginBottom: 4 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  section: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.72, textTransform: 'uppercase' },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  rowMeta: { fontSize: 12, lineHeight: 16 },
  amount: { fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  button: { fontSize: 15, fontWeight: '600' },
  tabular: { fontVariant: ['tabular-nums'] },
});

export const ui = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardPadded: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.lg,
    gap: space.md,
  },
  row: {
    minHeight: rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  rowDivider: {
    borderTopWidth: 1,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: radius.tight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: 24,
    paddingHorizontal: space.xs,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSecondary: {
    borderWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    borderRadius: radius.tight,
    borderWidth: 1,
    fontSize: 15,
  },
  field: {
    gap: 7,
  },
  segTrack: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: radius.tight,
  },
  segItem: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  segLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
});
