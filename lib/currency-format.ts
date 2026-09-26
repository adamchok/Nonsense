import type { SessionAmountUnit } from '@/types';

export const INVALID_AMOUNT_PLACEHOLDER = '—';

export function formatCompactCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return INVALID_AMOUNT_PLACEHOLDER;
  const abs = Math.abs(amount);
  if (abs <= 9999.99) {
    return `$${abs.toFixed(2)}`;
  }
  if (abs > 999_990) {
    const m = abs / 1_000_000;
    return `$${Number(m.toFixed(2)).toString()}M`;
  }
  const k = abs / 1000;
  return `$${Number(k.toFixed(2)).toString()}K`;
}

export function formatBlinds(small?: number, big?: number): string | null {
  if (small == null || big == null) return null;
  if (!Number.isFinite(small) || !Number.isFinite(big) || small <= 0 || big < small) {
    return null;
  }
  return `${formatCompactCurrency(small)}/${formatCompactCurrency(big)}`;
}

export function formatBlindChipStakeNumber(n: number): string {
  if (!Number.isFinite(n)) return INVALID_AMOUNT_PLACEHOLDER;
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, '');
}

export function formatBlindsChips(small?: number, big?: number): string | null {
  if (small == null || big == null) return null;
  if (!Number.isFinite(small) || !Number.isFinite(big) || small <= 0 || big < small) {
    return null;
  }
  return `${formatBlindChipStakeNumber(small)}/${formatBlindChipStakeNumber(big)}`;
}

export function formatChipsLedger(amount: number): string {
  if (!Number.isFinite(amount)) return INVALID_AMOUNT_PLACEHOLDER;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

export function formatChipsCompact(amount: number): string {
  if (!Number.isFinite(amount)) return INVALID_AMOUNT_PLACEHOLDER;
  const abs = Math.abs(amount);
  if (abs <= 9999.99) {
    return formatBlindChipStakeNumber(amount);
  }
  if (abs > 999_990) {
    const m = abs / 1_000_000;
    return `${amount < 0 ? '-' : ''}${Number(m.toFixed(2)).toString()}M`;
  }
  const k = abs / 1000;
  return `${amount < 0 ? '-' : ''}${Number(k.toFixed(2)).toString()}K`;
}

export function formatSessionBlindsForDisplay(
  small?: number,
  big?: number,
  amountUnit?: SessionAmountUnit,
  dollarsPerChip?: number
): string | null {
  if (small == null || big == null) return null;
  if (amountUnit === 'chips' && dollarsPerChip != null && dollarsPerChip > 0) {
    return formatBlinds(small * dollarsPerChip, big * dollarsPerChip);
  }
  return formatBlinds(small, big);
}

export function formatSignedCompactCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return INVALID_AMOUNT_PLACEHOLDER;
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatCompactCurrency(amount)}`;
}

export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return INVALID_AMOUNT_PLACEHOLDER;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export type SessionAmountValueStyle = 'ledger' | 'compact' | 'fixed2';

export function formatSessionAmountValue(
  value: number,
  unit: SessionAmountUnit,
  valueStyle: SessionAmountValueStyle
): string {
  if (!Number.isFinite(value)) return INVALID_AMOUNT_PLACEHOLDER;
  if (unit === 'chips') {
    return valueStyle === 'compact' ? formatChipsCompact(value) : formatChipsLedger(value);
  }
  if (valueStyle === 'compact') return formatCompactCurrency(value);
  if (valueStyle === 'fixed2') return `$${value.toFixed(2)}`;
  return formatCurrency(value);
}

export function formatSignedCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return INVALID_AMOUNT_PLACEHOLDER;
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatCurrency(Math.abs(amount))}`;
}

export function formatTightCompactNumber(
  amount: number,
  options?: { signed?: boolean; currency?: boolean }
): string {
  if (!Number.isFinite(amount)) return INVALID_AMOUNT_PLACEHOLDER;
  const abs = Math.abs(amount);
  const signed = options?.signed ?? false;
  const currency = options?.currency ?? false;

  function trimFixed(value: number, digits: number): string {
    return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  }

  let compact: string;
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    compact = `${trimFixed(v, digits)}M`;
  } else if (abs >= 1_000) {
    const v = abs / 1_000;
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    compact = `${trimFixed(v, digits)}K`;
  } else if (abs >= 100) {
    compact = trimFixed(abs, 0);
  } else if (abs >= 10) {
    compact = trimFixed(abs, 1);
  } else {
    compact = trimFixed(abs, 2);
  }

  const prefix = `${signed ? (amount >= 0 ? '+' : '-') : ''}${currency ? '$' : ''}`;
  return `${prefix}${compact}`;
}
