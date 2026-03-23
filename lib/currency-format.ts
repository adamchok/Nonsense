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

/** Tight compact notation without currency symbol (e.g. 400K, 5.56K, 1.2M). */
export function formatTightCompactNumber(amount: number): string {
  const abs = Math.abs(amount);

  function trimFixed(value: number, digits: number): string {
    return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  }

  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${trimFixed(v, digits)}M`;
  }

  if (abs >= 1_000) {
    const v = abs / 1_000;
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${trimFixed(v, digits)}K`;
  }

  if (abs >= 100) return trimFixed(abs, 0);
  if (abs >= 10) return trimFixed(abs, 1);
  return trimFixed(abs, 2);
}
