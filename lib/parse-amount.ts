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
