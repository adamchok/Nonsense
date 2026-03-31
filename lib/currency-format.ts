/** Full dollars until > 9999.99, then K; above 999.99K use M (no B). */
export function formatCompactCurrency(amount: number): string {
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

/** Stake string e.g. `$1.00/$2.00` when both blinds are valid; otherwise null. */
export function formatBlinds(small?: number, big?: number): string | null {
  if (small == null || big == null) return null;
  if (!Number.isFinite(small) || !Number.isFinite(big) || small <= 0 || big < small) {
    return null;
  }
  return `${formatCompactCurrency(small)}/${formatCompactCurrency(big)}`;
}

/** Compact currency with explicit + / - sign. */
export function formatSignedCompactCurrency(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatCompactCurrency(amount)}`;
}

/** USD currency with commas (e.g. $12,345.67). */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/** USD currency with explicit + / - sign and commas. */
export function formatSignedCurrency(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatCurrency(Math.abs(amount))}`;
}

/** Tight compact notation (e.g. 400K, 5.56K, 1.2M) with optional sign/currency. */
export function formatTightCompactNumber(
  amount: number,
  options?: { signed?: boolean; currency?: boolean }
): string {
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
