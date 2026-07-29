/**
 * Voice command parser for live-session buy-ins and cash-outs.
 *
 * IMPORTANT: this module is deliberately import-free so `node --test` can run it
 * directly under Node's native TypeScript type-stripping. That also rules out
 * `enum`, `namespace`, and constructor parameter properties here and in the test.
 *
 * The parser never mutates anything and never talks to Firestore — it turns a
 * transcript into an intent, and the screen pre-fills an existing modal with it.
 * The host still confirms, so a misparse costs a tap and nothing else.
 */

export type VoiceRosterEntry = {
  playerId: string;
  name: string;
  /** Already has buy-ins in this session; wins ties against friends not yet playing. */
  inSession?: boolean;
};

export type VoiceUnparsedReason =
  | 'empty'
  | 'no-amount'
  | 'negative-amount'
  | 'no-name'
  | 'unknown-name'
  | 'ambiguous-name'
  | 'unsupported-unit'
  | 'no-intent';

export type VoiceCommand =
  | { kind: 'buyIn'; playerId: string | null; playerName: string; amount: number }
  | { kind: 'cashOut'; playerId: string; playerName: string; amount: number }
  | {
      kind: 'unparsed';
      transcript: string;
      reason: VoiceUnparsedReason;
      playerName?: string;
      amount?: number;
      candidates?: string[];
    };

export type VoiceNameMatch =
  | { status: 'match'; entry: VoiceRosterEntry; tier: number }
  | { status: 'none' }
  | { status: 'ambiguous'; candidates: string[]; tier: number };

const MAX_AMOUNT = 1_000_000;

/** Below this, an unmatched name is treated as misheard rather than a new guest. */
const MIN_NEW_PLAYER_NAME_LENGTH = 3;

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALES: Record<string, number> = {
  hundred: 100, hundreds: 100,
  thousand: 1000, thousands: 1000, k: 1000, grand: 1000,
  million: 1_000_000, millions: 1_000_000, mil: 1_000_000,
};

/** Terminates the whole-dollar part of an amount. */
const WHOLE_UNIT_WORDS = new Set([
  'dollar', 'dollars', 'buck', 'bucks', 'chip', 'chips', 'bill', 'bills',
]);

/** Terminates the fractional part — the explicit cents marker. */
const CENT_WORDS = new Set(['cent', 'cents']);

/**
 * Grammar and filler only. Deliberately excludes unit words (`dollars`, `chips`,
 * `bills`, `cents`) so real names like "Bill" or "Chip" survive — those are
 * blocked instead by being swallowed into the amount run.
 */
const BLOCKED_WORDS = new Set([
  'a', 'an', 'the', 'and', 'of', 'to', 'for', 'is', 'are', 'was', 'were',
  'with', 'it', 'that', 'this', 'so', 'then', 'now', 'just', 'please',
  'my', 'me', 'i', 'him', 'her', 'them', 'he', 'she', 'they', 'his', 'their',
  'ok', 'okay', 'um', 'uh', 'er', 'yeah', 'yep', 'hey',
  'buy', 'buys', 'buying', 'bought', 'in', 'out', 're',
  'cash', 'cashes', 'cashed', 'cashing',
  'add', 'adds', 'adding', 'another', 'more', 'again', 'reload', 'reloads',
  'put', 'puts', 'top', 'tops', 'topped', 'up',
  'leaving', 'leaves', 'finish', 'finishes', 'finished', 'end', 'ends', 'ended',
  'total', 'point', 'dot',
]);

const CASH_OUT_PHRASES: string[][] = [
  ['leaving', 'with'], ['leaves', 'with'],
  ['finishes', 'with'], ['finished', 'with'], ['finish', 'with'],
  ['ends', 'with'], ['ended', 'with'], ['end', 'with'],
  ['out', 'for'],
];

const BUY_IN_PHRASES: string[][] = [
  ['buy', 'in'], ['buys', 'in'], ['buying', 'in'], ['bought', 'in'],
  ['re', 'buy'], ['puts', 'in'], ['put', 'in'],
  ['tops', 'up'], ['top', 'up'], ['topped', 'up'],
  ['in', 'for'],
];

const BUY_IN_WORDS = new Set([
  'add', 'adds', 'adding', 'another', 'more', 'again', 'reload', 'reloads',
]);

const CASH_VERBS = new Set(['cash', 'cashes', 'cashed', 'cashing']);

/** Spoken sign markers. `normalizeText` cannot carry a sign, so these are refused outright. */
const NEGATION_WORDS = new Set(['minus', 'negative']);

/**
 * A written sign: "-50", "$-50". Must not fire on hyphenated words like
 * "twenty-five" or "re-buy", hence the required separator before the dash.
 */
const WRITTEN_SIGN = /(?:^|[\s([{$£€])[-–—]\s*[\d.]/;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[$£€]/g, ' ')
    .replace(/['‘’]/g, '')
    .replace(/[-–—_/]/g, ' ')
    .replace(/[^a-z0-9. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  const folded = normalizeText(text)
    .replace(/\bbuyins?\b/g, 'buy in')
    .replace(/\bcashouts?\b/g, 'cash out')
    .replace(/\brebuys?\b/g, 're buy')
    .replace(/\brebought\b/g, 're buy');
  if (!folded) return [];
  return folded
    .split(' ')
    // Strip sentence-final dots but keep decimal literals like "12.50" intact.
    .map((t) => (/^\d+\.\d+$/.test(t) ? t : t.replace(/\.+$/, '')))
    .filter((t) => t.length > 0 && t !== '.');
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

const DIGIT_LITERAL = /^\d{1,7}(\.\d{1,2})?$/;

function isDigitLiteral(token: string): boolean {
  return DIGIT_LITERAL.test(token);
}

/** Numeric value of a single leaf token (word or digit literal), else null. */
function leafValue(token: string): number | null {
  if (isDigitLiteral(token)) return Number.parseFloat(token);
  if (token in SMALL_NUMBERS) return SMALL_NUMBERS[token];
  if (token in TENS) return TENS[token];
  return null;
}

function isScale(token: string): boolean {
  return token in SCALES;
}

function isCore(token: string): boolean {
  return leafValue(token) !== null || isScale(token);
}

/** True when the amount run may begin at `i`. */
function startsRun(tokens: string[], i: number): boolean {
  const token = tokens[i];
  if (leafValue(token) !== null) return true;
  if (isScale(token)) return true;
  // "a hundred" — only meaningful directly before a scale word.
  if ((token === 'a' || token === 'an') && i + 1 < tokens.length && isScale(tokens[i + 1])) {
    return true;
  }
  return false;
}

/** True when the amount run may continue through `i`, given it started earlier. */
function continuesRun(tokens: string[], i: number): boolean {
  const token = tokens[i];
  const next = i + 1 < tokens.length ? tokens[i + 1] : '';
  if (isCore(token)) return true;
  if (WHOLE_UNIT_WORDS.has(token) || CENT_WORDS.has(token)) return true;
  if ((token === 'a' || token === 'an') && isScale(next)) return true;
  if (token === 'and' && next !== '' && (isCore(next) || next === 'a' || next === 'an')) return true;
  if ((token === 'point' || token === 'dot') && next !== '' && leafValue(next) !== null) return true;
  return false;
}

type AmountRun = { value: number; start: number; end: number };

/**
 * Locates the first contiguous amount run and evaluates it.
 * Returns null when there is no run at all, and 'invalid' when a run was found
 * but could not be resolved to a sane figure — so the caller reports rather than guesses.
 */
function findAmount(tokens: string[]): AmountRun | 'invalid' | null {
  let start = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    if (startsRun(tokens, i)) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = start + 1;
  while (end < tokens.length && continuesRun(tokens, end)) end += 1;

  // Never let a dangling connector close the run.
  while (
    end - 1 > start &&
    (tokens[end - 1] === 'and' || tokens[end - 1] === 'point' || tokens[end - 1] === 'dot')
  ) {
    end -= 1;
  }

  const value = evaluateAmountTokens(tokens.slice(start, end));
  if (value === null) return 'invalid';
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > MAX_AMOUNT) return 'invalid';
  return { value: rounded, start, end };
}

function evaluateAmountTokens(tokens: string[]): number | null {
  if (tokens.length === 0) return null;

  const centIdx = tokens.findIndex((t) => CENT_WORDS.has(t));
  const wholeUnitIdx = tokens.findIndex((t) => WHOLE_UNIT_WORDS.has(t));

  // 1. Explicit cents — "twelve dollars fifty cents", "fifty cents".
  if (centIdx >= 0) {
    const hasWholeMarker = wholeUnitIdx >= 0 && wholeUnitIdx < centIdx;
    const wholeTokens = hasWholeMarker ? tokens.slice(0, wholeUnitIdx) : [];
    const fracTokens = hasWholeMarker
      ? tokens.slice(wholeUnitIdx + 1, centIdx)
      : tokens.slice(0, centIdx);
    const whole = wholeTokens.length > 0 ? evaluatePlain(wholeTokens) : 0;
    return combineCents(whole, evaluatePlain(fracTokens));
  }

  // 2. "<A> dollars <B>" with the cents marker left off.
  if (wholeUnitIdx >= 0) {
    const after = tokens.slice(wholeUnitIdx + 1);
    const whole = evaluatePlain(tokens.slice(0, wholeUnitIdx));
    if (after.length === 0) return whole;
    return combineCents(whole, evaluatePlain(after));
  }

  // 3/4. No unit words at all.
  return evaluatePlain(tokens);
}

function combineCents(whole: number | null, frac: number | null): number | null {
  if (whole === null || frac === null) return null;
  // A cents group of 100+ is ambiguous ("two hundred and fifty cents") — refuse it.
  if (!Number.isInteger(frac) || frac < 0 || frac >= 100) return null;
  return whole + frac / 100;
}

function evaluatePlain(tokens: string[]): number | null {
  if (tokens.length === 0) return null;

  const pointIdx = tokens.findIndex((t) => t === 'point' || t === 'dot');
  if (pointIdx >= 0) {
    const whole = pointIdx === 0 ? 0 : evaluatePlain(tokens.slice(0, pointIdx));
    if (whole === null) return null;
    let digits = '';
    for (const token of tokens.slice(pointIdx + 1)) {
      if (/^\d+$/.test(token)) {
        digits += token;
      } else if (token in SMALL_NUMBERS && SMALL_NUMBERS[token] <= 9) {
        digits += String(SMALL_NUMBERS[token]);
      } else {
        return null;
      }
    }
    if (digits.length === 0) return null;
    return whole + Number.parseFloat(`0.${digits}`);
  }

  const hasScale = tokens.some((t) => isScale(t) || t === 'and' || t === 'a' || t === 'an');
  return hasScale ? accumulate(tokens) : groupJuxtaposed(tokens);
}

/** Standard spoken-number accumulator. Handles "one thousand two hundred". */
function accumulate(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let sawAny = false;

  for (const token of tokens) {
    if (token === 'and') continue;
    if (token === 'a' || token === 'an') {
      current = 1;
      sawAny = true;
      continue;
    }
    const leaf = leafValue(token);
    if (leaf !== null) {
      current += leaf;
      sawAny = true;
      continue;
    }
    if (isScale(token)) {
      const scale = SCALES[token];
      sawAny = true;
      if (scale === 100) {
        current = (current === 0 ? 1 : current) * 100;
      } else {
        total += (current === 0 ? 1 : current) * scale;
        current = 0;
      }
      continue;
    }
    return null;
  }

  return sawAny ? total + current : null;
}

/**
 * No scale words present, so segment into bare groups and apply the juxtaposition
 * rule: "two fifty" is 250, but "twenty five" stays 25 because tens+unit is one group.
 */
function groupJuxtaposed(tokens: string[]): number | null {
  const groups: number[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const value = leafValue(token);
    if (value === null) return null;
    if (token in TENS && i + 1 < tokens.length) {
      const nextToken = tokens[i + 1];
      const nextValue = nextToken in SMALL_NUMBERS ? SMALL_NUMBERS[nextToken] : null;
      if (nextValue !== null && nextValue >= 1 && nextValue <= 9) {
        groups.push(value + nextValue);
        i += 2;
        continue;
      }
    }
    groups.push(value);
    i += 1;
  }

  if (groups.length === 1) return groups[0];
  if (groups.length === 2 && groups[1] >= 10 && Number.isInteger(groups[0])) {
    return groups[0] * 100 + groups[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

function levenshteinWithin(a: string, b: string, max: number): number | null {
  if (Math.abs(a.length - b.length) > max) return null;
  if (a === b) return 0;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return null;
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  const distance = prev[b.length];
  return distance <= max ? distance : null;
}

/** Fuzz allowance scales with the shorter string — short names must match exactly. */
function distanceThreshold(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

function firstToken(value: string): string {
  const space = value.indexOf(' ');
  return space === -1 ? value : value.slice(0, space);
}

/** Tiers 0-2 are literal readings of what was said; 3-4 are edit-distance guesses. */
const FUZZY_TIER_START = 3;

/**
 * Resolves the literal tiers as a single group, so sitting at the table outranks
 * having the tighter literal match: "Bryan" should reach a seated "Bryan Tan"
 * rather than an exact "Bryan" who isn't playing. Tier only breaks ties between
 * players of equal standing.
 */
function resolveLiteralTiers(tiers: VoiceRosterEntry[][]): VoiceNameMatch | null {
  const hits: { entry: VoiceRosterEntry; tier: number }[] = [];
  for (let tier = 0; tier < FUZZY_TIER_START; tier += 1) {
    for (const entry of tiers[tier]) hits.push({ entry, tier });
  }
  if (hits.length === 0) return null;

  const seated = hits.filter((h) => h.entry.inSession);
  const pool = seated.length > 0 ? seated : hits;
  const tier = Math.min(...pool.map((h) => h.tier));
  const finalists = dedupeById(pool.filter((h) => h.tier === tier).map((h) => h.entry));
  if (finalists.length === 1) return { status: 'match', entry: finalists[0], tier };
  return { status: 'ambiguous', candidates: finalists.map((e) => e.name), tier };
}

export function matchRosterName(
  spoken: string,
  roster: readonly VoiceRosterEntry[]
): VoiceNameMatch {
  const needle = normalizeText(spoken);
  if (!needle) return { status: 'none' };

  const needleFirst = firstToken(needle);
  const tiers: VoiceRosterEntry[][] = [[], [], [], [], []];
  const distances = new Map<string, number>();

  for (const entry of roster) {
    const name = normalizeText(entry.name);
    if (!name) continue;
    const nameFirst = firstToken(name);

    if (name === needle) {
      tiers[0].push(entry);
      continue;
    }
    if (nameFirst === needleFirst || nameFirst === needle || name === needleFirst) {
      tiers[1].push(entry);
      continue;
    }
    if (needle.length >= 3 && (name.startsWith(needle) || needle.startsWith(name))) {
      tiers[2].push(entry);
      continue;
    }
    const full = levenshteinWithin(needle, name, distanceThreshold(needle, name));
    if (full !== null) {
      tiers[3].push(entry);
      distances.set(entry.playerId, full);
      continue;
    }
    const partial = levenshteinWithin(
      needleFirst,
      nameFirst,
      distanceThreshold(needleFirst, nameFirst)
    );
    if (partial !== null) {
      tiers[4].push(entry);
      distances.set(entry.playerId, partial);
    }
  }

  const literal = resolveLiteralTiers(tiers);
  if (literal) return literal;

  for (let tier = FUZZY_TIER_START; tier < tiers.length; tier += 1) {
    let hits = dedupeById(tiers[tier]);
    if (hits.length === 0) continue;

    if (hits.length > 1) {
      const best = Math.min(
        ...hits.map((e) => distances.get(e.playerId) ?? Number.MAX_SAFE_INTEGER)
      );
      hits = hits.filter((e) => (distances.get(e.playerId) ?? Number.MAX_SAFE_INTEGER) === best);
    }
    if (hits.length === 1) return { status: 'match', entry: hits[0], tier };

    const seated = hits.filter((e) => e.inSession);
    if (seated.length === 1) return { status: 'match', entry: seated[0], tier };

    const pool = seated.length > 1 ? seated : hits;
    return { status: 'ambiguous', candidates: pool.map((e) => e.name), tier };
  }

  return { status: 'none' };
}

function dedupeById(entries: VoiceRosterEntry[]): VoiceRosterEntry[] {
  const seen = new Set<string>();
  const out: VoiceRosterEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.playerId)) continue;
    seen.add(entry.playerId);
    out.push(entry);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

type Intent = 'buyIn' | 'cashOut' | null;

function hasPhrase(tokens: string[], phrase: string[]): boolean {
  for (let i = 0; i + phrase.length <= tokens.length; i += 1) {
    let ok = true;
    for (let j = 0; j < phrase.length; j += 1) {
      if (tokens[i + j] !== phrase[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** "cash out X", "cash him out", "cash Jordan out for two twenty". */
function hasSplitCashOut(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i += 1) {
    if (!CASH_VERBS.has(tokens[i])) continue;
    for (let j = i + 1; j < tokens.length && j <= i + 4; j += 1) {
      if (tokens[j] === 'out') return true;
    }
  }
  return false;
}

function detectIntent(tokens: string[]): Intent {
  if (hasSplitCashOut(tokens)) return 'cashOut';
  for (const phrase of CASH_OUT_PHRASES) {
    if (hasPhrase(tokens, phrase)) return 'cashOut';
  }
  for (const phrase of BUY_IN_PHRASES) {
    if (hasPhrase(tokens, phrase)) return 'buyIn';
  }
  for (const token of tokens) {
    if (BUY_IN_WORDS.has(token)) return 'buyIn';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function titleCase(tokens: string[]): string {
  return tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
}

/** Every word appearing in a roster name, so real names are never mistaken for grammar. */
function rosterNameTokens(roster: readonly VoiceRosterEntry[]): Set<string> {
  const out = new Set<string>();
  for (const entry of roster) {
    for (const token of normalizeText(entry.name).split(' ')) {
      if (token) out.add(token);
    }
  }
  return out;
}

/** A run of tokens that could plausibly be a name, with its position in the utterance. */
type NameSpan = { tokens: string[]; start: number };

/** Contiguous stretches of tokens that could plausibly be a name. */
function nameSpans(
  tokens: string[],
  amountStart: number,
  amountEnd: number,
  rosterTokens: Set<string>
): NameSpan[] {
  const spans: NameSpan[] = [];
  let current: string[] = [];
  let currentStart = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    // A unit word is only grammar when nobody is actually called that. "Bill" and
    // "Chip" are real names; the amount run has already swallowed the unit word
    // that belongs to the figure, so this cannot loosen amount parsing.
    const isUnitWord =
      (WHOLE_UNIT_WORDS.has(token) || CENT_WORDS.has(token)) && !rosterTokens.has(token);
    const blocked =
      (i >= amountStart && i < amountEnd) ||
      BLOCKED_WORDS.has(token) ||
      isUnitWord ||
      isDigitLiteral(token);
    if (blocked) {
      if (current.length > 0) spans.push({ tokens: current, start: currentStart });
      current = [];
    } else {
      if (current.length === 0) currentStart = i;
      current.push(token);
    }
  }
  if (current.length > 0) spans.push({ tokens: current, start: currentStart });
  return spans;
}

/** One candidate reading of one stretch of the utterance. `to` is exclusive. */
type SpanMatch = { from: number; to: number; result: Exclude<VoiceNameMatch, { status: 'none' }> };

/**
 * Best match across every plausible name span.
 *
 * Two people named in one utterance is a coin flip on a money entry, so it is
 * refused rather than guessed. The unit of counting is a region of the utterance,
 * not a match: "Bryan Tan" also contains the shorter reading "Bryan", and those
 * overlap, so they are one mention of one person rather than two candidates.
 */
function bestRosterMatch(spans: NameSpan[], roster: readonly VoiceRosterEntry[]): VoiceNameMatch {
  const candidates: SpanMatch[] = [];
  for (const span of spans) {
    for (let size = Math.min(3, span.tokens.length); size >= 1; size -= 1) {
      for (let i = 0; i + size <= span.tokens.length; i += 1) {
        const result = matchRosterName(span.tokens.slice(i, i + size).join(' '), roster);
        if (result.status === 'none') continue;
        candidates.push({ from: span.start + i, to: span.start + i + size, result });
      }
    }
  }
  if (candidates.length === 0) return { status: 'none' };

  // Strongest reading first: better tier, then more words accounted for, then earlier.
  candidates.sort(
    (a, b) =>
      a.result.tier - b.result.tier || b.to - b.from - (a.to - a.from) || a.from - b.from
  );

  const mentions: SpanMatch[] = [];
  for (const candidate of candidates) {
    const claimed = mentions.some((m) => candidate.from < m.to && m.from < candidate.to);
    if (!claimed) mentions.push(candidate);
  }

  const matched = dedupeById(
    mentions.flatMap((m) => (m.result.status === 'match' ? [m.result.entry] : []))
  );
  const unresolved = mentions.filter((m) => m.result.status === 'ambiguous');

  // More than one person mentioned, however each was matched: ask, never pick.
  if (matched.length + unresolved.length > 1) {
    const names = [...matched.map((e) => e.name)];
    for (const mention of unresolved) {
      if (mention.result.status !== 'ambiguous') continue;
      for (const name of mention.result.candidates) {
        if (!names.includes(name)) names.push(name);
      }
    }
    return { status: 'ambiguous', candidates: names, tier: mentions[0].result.tier };
  }

  return mentions[0].result;
}

export function parseVoiceCommand(
  transcript: string,
  roster: readonly VoiceRosterEntry[]
): VoiceCommand {
  const tokens = tokenize(transcript);
  if (tokens.length === 0) {
    return { kind: 'unparsed', transcript, reason: 'empty' };
  }

  // A sign cannot survive normalization, and there is no such thing as a negative
  // buy-in or cash-out. Refusing beats writing the figure with the sign dropped.
  if (WRITTEN_SIGN.test(transcript) || tokens.some((t) => NEGATION_WORDS.has(t))) {
    return { kind: 'unparsed', transcript, reason: 'negative-amount' };
  }

  // Stakes-relative amounts are a different feature; guessing here would be
  // silently wrong whenever blinds are unset.
  if (
    hasPhrase(tokens, ['big', 'blind']) ||
    hasPhrase(tokens, ['big', 'blinds']) ||
    tokens.includes('bb')
  ) {
    return { kind: 'unparsed', transcript, reason: 'unsupported-unit' };
  }

  const amount = findAmount(tokens);
  if (amount === 'invalid') {
    return { kind: 'unparsed', transcript, reason: 'no-amount' };
  }

  const amountStart = amount ? amount.start : tokens.length;
  const amountEnd = amount ? amount.end : tokens.length;
  const spans = nameSpans(tokens, amountStart, amountEnd, rosterNameTokens(roster));
  const nameMatch = bestRosterMatch(spans, roster);
  const spokenName = spans.length > 0 ? titleCase(spans[0].tokens) : undefined;

  if (nameMatch.status === 'ambiguous') {
    return {
      kind: 'unparsed',
      transcript,
      reason: 'ambiguous-name',
      candidates: nameMatch.candidates,
      amount: amount ? amount.value : undefined,
    };
  }

  if (!amount) {
    if (nameMatch.status === 'match') {
      return {
        kind: 'unparsed',
        transcript,
        reason: 'no-amount',
        playerName: nameMatch.entry.name,
      };
    }
    return { kind: 'unparsed', transcript, reason: 'no-intent' };
  }

  if (detectIntent(tokens) === 'cashOut') {
    if (nameMatch.status !== 'match') {
      return {
        kind: 'unparsed',
        transcript,
        reason: 'unknown-name',
        playerName: spokenName,
        amount: amount.value,
      };
    }
    return {
      kind: 'cashOut',
      playerId: nameMatch.entry.playerId,
      playerName: nameMatch.entry.name,
      amount: amount.value,
    };
  }

  // Everything else carrying a name and an amount is a buy-in, including the
  // bare "Adam fifty" shorthand.
  if (nameMatch.status === 'match') {
    return {
      kind: 'buyIn',
      playerId: nameMatch.entry.playerId,
      playerName: nameMatch.entry.name,
      amount: amount.value,
    };
  }

  if (spokenName) {
    // Unrecognised name plus an amount: a brand-new guest. playerId stays null so
    // the screen's existing resolvePlayerId / collision alert handles it.
    // Very short fragments ("Ad") are far more likely a clipped roster name than a
    // real new player, so refuse rather than create a phantom guest.
    if (normalizeText(spokenName).replace(/\s/g, '').length < MIN_NEW_PLAYER_NAME_LENGTH) {
      return {
        kind: 'unparsed',
        transcript,
        reason: 'unknown-name',
        playerName: spokenName,
        amount: amount.value,
      };
    }
    return { kind: 'buyIn', playerId: null, playerName: spokenName, amount: amount.value };
  }

  return { kind: 'unparsed', transcript, reason: 'no-name', amount: amount.value };
}
