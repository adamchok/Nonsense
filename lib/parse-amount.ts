const AMOUNT_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;
const AMBIGUOUS_THOUSANDS = /^[+-]?[1-9]\d*,\d{3}$/;

export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (!AMOUNT_PATTERN.test(trimmed) || AMBIGUOUS_THOUSANDS.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function sanitizeAmountInput(text: string, options: { allowNegative?: boolean } = {}): string {
  const negative = options.allowNegative === true && text.trimStart().startsWith('-');
  const kept = text.replace(/[^\d.,]/g, '');
  const sep = kept.search(/[.,]/);
  const single = sep < 0 ? kept : kept.slice(0, sep + 1) + kept.slice(sep + 1).replace(/[.,]/g, '');
  return negative ? `-${single}` : single;
}

export const MAX_AMOUNT = 100_000_000;
export const AMOUNT_TOO_LARGE_MESSAGE = `Must be less than ${String(MAX_AMOUNT).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

export function isAmountInRange(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < MAX_AMOUNT;
}

export function amountFieldError(
  input: string,
  messages: { empty: string; invalid?: string; allowZero?: boolean }
): string | null {
  if (!input.trim()) return messages.empty;
  const parsed = parseAmount(input);
  if (parsed == null) return messages.invalid ?? 'Enter a number';
  if (messages.allowZero ? parsed < 0 : parsed <= 0) {
    return messages.allowZero ? 'Must be 0 or more' : 'Must be more than 0';
  }
  return isAmountInRange(parsed) ? null : AMOUNT_TOO_LARGE_MESSAGE;
}

export function parseValidAmount(input: string, options: { allowZero?: boolean } = {}): number | null {
  const parsed = parseAmount(input);
  if (parsed == null || !isAmountInRange(parsed)) return null;
  return (options.allowZero ? parsed >= 0 : parsed > 0) ? parsed : null;
}
