/** Optional sign, digits, and at most one decimal separator ('.' or ','). */
const AMOUNT_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;
/** "1,500" reads as 1.5 in comma-decimal locales and 1500 elsewhere: refuse to guess. */
const AMBIGUOUS_THOUSANDS = /^[+-]?[1-9]\d*,\d{3}$/;

/**
 * Parse a user-typed amount, accepting a decimal comma (many Android locales' numeric
 * keyboards emit "12,5"). Returns null for empty, malformed ("12abc", "1.2.3", "1,000.50")
 * or ambiguous ("1,500") input. Sign is not checked: callers decide whether 0 or negatives
 * are allowed.
 */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (!AMOUNT_PATTERN.test(trimmed) || AMBIGUOUS_THOUSANDS.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}
