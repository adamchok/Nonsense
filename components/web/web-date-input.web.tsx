import { createElement, useEffect, useRef, type ChangeEvent } from 'react';

import { useResolvedColorScheme } from '@/lib/theme-context';

import type { WebDateInputProps } from './web-date-input';

export type { WebDateInputProps } from './web-date-input';

/** A native `<input type="date">`, opened straight away since it replaces a tap-to-open picker. */
export function WebDateInput({ value, min, max, onChange, accessibilityLabel, colors }: WebDateInputProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const scheme = useResolvedColorScheme();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      // showPicker needs a recent user gesture and isn't in every browser; the focused field still works.
    }
  }, []);

  return createElement('input', {
    ref,
    type: 'date',
    value,
    min: min || undefined,
    max: max || undefined,
    'aria-label': accessibilityLabel,
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '10px 12px',
      fontSize: 15,
      fontFamily: 'inherit',
      borderRadius: 10,
      border: `1px solid ${colors.border}`,
      color: colors.text,
      backgroundColor: colors.background,
      // Matches the calendar popup to the in-app theme rather than the OS one.
      colorScheme: scheme,
    },
  });
}
