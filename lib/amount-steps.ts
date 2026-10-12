// Quick-pick amounts scaled to the game being played, instead of fixed $5/$10/$25 or $100/$200 lists.
// All values are in the session's own unit (dollars, or chips in chip mode), like blinds and buy-ins.

/** A full buy-in is conventionally 100 big blinds. */
const BIG_BLINDS_PER_BUY_IN = 100;
const FALLBACK_BUY_IN = 100;
const BUY_IN_MULTIPLES = [0.5, 1, 2, 3];
const FALLBACK_STEPS = [5, 10, 25];
/** Leading digits people actually use for money (25, 75, 150, 1250, ...). */
const NICE_MANTISSAS = [1, 1.2, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];

/** Rounds to the nearest "nice" amount (37.5 -> 40, 133 -> 125, 2.4 -> 2.5); exact nice values stay put. */
export function niceRound(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const mantissa = value / magnitude;
  let best = NICE_MANTISSAS[0];
  for (const m of NICE_MANTISSAS) {
    // `<=` breaks ties upward (1.25 between 1.2 and 1.3 style cases lean generous).
    if (Math.abs(m - mantissa) <= Math.abs(best - mantissa)) best = m;
  }
  // Trim float noise like 0.30000000000000004.
  return Number((best * magnitude).toPrecision(12));
}

/** The session's typical buy-in: what people actually bought in for, else 100 big blinds. */
export function baseBuyIn(commonAmount: number | null | undefined, bigBlind: number | null | undefined): number {
  if (commonAmount != null && commonAmount > 0) return commonAmount;
  if (bigBlind != null && bigBlind > 0) return niceRound(bigBlind * BIG_BLINDS_PER_BUY_IN);
  return FALLBACK_BUY_IN;
}

/** Buy-in chips, lowest to highest: half, one, two and three typical buy-ins, plus the player's last amount. */
export function buyInQuickAmounts(input: {
  lastAmount?: number | null;
  commonAmount?: number | null;
  bigBlind?: number | null;
}): number[] {
  const base = baseBuyIn(input.commonAmount, input.bigBlind);
  const multiples = BUY_IN_MULTIPLES.map((m) => (m === 1 ? base : niceRound(base * m)));
  const all = [input.lastAmount ?? null, ...multiples].filter((v): v is number => v != null && v > 0);
  return [...new Set(all)].sort((a, b) => a - b);
}

/**
 * Cash-out +/- steps: one big blind, five big blinds and a quarter buy-in, each rounded to a nice number.
 * Without blinds they fall back to fractions of the buy-in; always three distinct ascending steps.
 */
export function cashOutSteps(bigBlind: number | null | undefined, buyIn: number | null | undefined): number[] {
  const base = baseBuyIn(buyIn, bigBlind);
  const raw =
    bigBlind != null && bigBlind > 0 ? [bigBlind, bigBlind * 5, base / 4] : [base / 20, base / 10, base / 4];
  const steps = [...new Set(raw.map(niceRound).filter((v) => v > 0))].sort((a, b) => a - b);
  return steps.length === 3 ? steps : FALLBACK_STEPS;
}
