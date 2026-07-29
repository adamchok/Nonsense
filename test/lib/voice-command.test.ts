/**
 * Run with: npm test   (node --test, no framework, no dependencies)
 *
 * Mirrors the source tree: test/lib/x.test.ts covers lib/x.ts.
 *
 * Node's native type-stripping needs the explicit `.ts` extension on relative
 * imports and `import type` for type-only imports. The `@/` alias is deliberately
 * not used here — Node has no import map for it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchRosterName, parseVoiceCommand } from '../../lib/voice-command.ts';
import type { VoiceCommand, VoiceRosterEntry } from '../../lib/voice-command.ts';

const ROSTER: VoiceRosterEntry[] = [
  { playerId: 'adam', name: 'Adam', inSession: true },
  { playerId: 'jordan', name: 'Jordan', inSession: true },
  { playerId: 'mike_chen', name: 'Mike Chen', inSession: true },
  { playerId: 'mikey', name: 'Mikey', inSession: true },
  { playerId: 'al', name: 'Al', inSession: true },
  { playerId: 'ed', name: 'Ed', inSession: true },
];

function parse(transcript: string, roster: VoiceRosterEntry[] = ROSTER): VoiceCommand {
  return parseVoiceCommand(transcript, roster);
}

function assertBuyIn(
  transcript: string,
  playerId: string | null,
  amount: number,
  roster: VoiceRosterEntry[] = ROSTER
) {
  const result = parse(transcript, roster);
  assert.equal(result.kind, 'buyIn', `${transcript} -> ${JSON.stringify(result)}`);
  if (result.kind !== 'buyIn') return;
  assert.equal(result.playerId, playerId, `${transcript} playerId`);
  assert.equal(result.amount, amount, `${transcript} amount`);
}

function assertCashOut(transcript: string, playerId: string, amount: number) {
  const result = parse(transcript);
  assert.equal(result.kind, 'cashOut', `${transcript} -> ${JSON.stringify(result)}`);
  if (result.kind !== 'cashOut') return;
  assert.equal(result.playerId, playerId, `${transcript} playerId`);
  assert.equal(result.amount, amount, `${transcript} amount`);
}

function assertUnparsed(transcript: string, reason: string) {
  const result = parse(transcript);
  assert.equal(result.kind, 'unparsed', `${transcript} -> ${JSON.stringify(result)}`);
  if (result.kind !== 'unparsed') return;
  assert.equal(result.reason, reason, `${transcript} reason`);
}

/** Amount-only helper: every phrasing is anchored to a known player. */
function assertAmount(spokenAmount: string, expected: number) {
  const transcript = `Adam buys in for ${spokenAmount}`;
  const result = parse(transcript);
  assert.equal(result.kind, 'buyIn', `${transcript} -> ${JSON.stringify(result)}`);
  if (result.kind !== 'buyIn') return;
  assert.equal(result.amount, expected, `"${spokenAmount}" should be ${expected}`);
}

// ---------------------------------------------------------------------------

test('buy-in phrasings', () => {
  assertBuyIn('add fifty for Adam', 'adam', 50);
  assertBuyIn('Adam buys in for fifty', 'adam', 50);
  assertBuyIn('Adam buy in fifty', 'adam', 50);
  assertBuyIn('Adam rebuy fifty', 'adam', 50);
  assertBuyIn('Adam re-buy fifty', 'adam', 50);
  assertBuyIn('another fifty for Adam', 'adam', 50);
  assertBuyIn('Adam in for a hundred', 'adam', 100);
  assertBuyIn('Adam tops up fifty', 'adam', 50);
  assertBuyIn('Adam bought in for fifty', 'adam', 50);
  assertBuyIn('reload Adam fifty', 'adam', 50);
  // Bare shorthand with no intent keyword at all.
  assertBuyIn('Adam fifty', 'adam', 50);
});

test('cash-out phrasings', () => {
  assertCashOut('cash out Jordan two twenty', 'jordan', 220);
  assertCashOut('Jordan cashes out for two hundred', 'jordan', 200);
  assertCashOut('cash Jordan out for two twenty', 'jordan', 220);
  assertCashOut('Jordan cashed out two hundred', 'jordan', 200);
  assertCashOut('Jordan leaving with three hundred', 'jordan', 300);
  assertCashOut('Jordan finishes with three hundred', 'jordan', 300);
  assertCashOut('Jordan ends with three hundred', 'jordan', 300);
  assertCashOut('cashout Jordan two hundred', 'jordan', 200);
});

test('cash-out is detected before buy-in when both keywords appear', () => {
  // "for" is a weak buy-in trigger but "cashes out" must win.
  assertCashOut('Jordan cashes out for two hundred', 'jordan', 200);
});

test('spoken numbers - accumulator and scale words', () => {
  assertAmount('fifty', 50);
  assertAmount('two hundred and twenty', 220);
  assertAmount('two hundred twenty', 220);
  assertAmount('a hundred', 100);
  assertAmount('one hundred', 100);
  assertAmount('one thousand two hundred', 1200);
  assertAmount('two thousand five hundred', 2500);
  assertAmount('five k', 5000);
  assertAmount('five grand', 5000);
  assertAmount('twelve hundred', 1200);
});

test('spoken numbers - juxtaposition means hundreds, not cents', () => {
  assertAmount('two fifty', 250);
  assertAmount('twelve fifty', 1250);
  assertAmount('one twenty', 120);
  // tens + unit is a single group, so this must stay 25
  assertAmount('twenty five', 25);
  assertAmount('forty five', 45);
});

test('spoken numbers - explicit cents', () => {
  assertAmount('twelve dollars fifty cents', 12.5);
  assertAmount('twelve dollars fifty', 12.5);
  assertAmount('fifty cents', 0.5);
  assertAmount('one thousand two hundred dollars fifty cents', 1200.5);
  assertAmount('twelve dollars and fifty cents', 12.5);
});

test('spoken numbers - explicit decimal', () => {
  assertAmount('twelve point five', 12.5);
  assertAmount('twelve point five zero', 12.5);
  assertAmount('12.50', 12.5);
  assertAmount('12', 12);
});

test('spoken numbers - unit words and currency symbols are stripped', () => {
  assertAmount('$50', 50);
  assertAmount('fifty dollars', 50);
  assertAmount('fifty bucks', 50);
  assertAmount('fifty chips', 50);
});

test('the two idioms for 1200 do not collide', () => {
  assertAmount('one thousand two hundred', 1200);
  assertAmount('twelve hundred', 1200);
  assertAmount('twelve fifty', 1250);
  assertAmount('twelve dollars fifty cents', 12.5);
  assertAmount('twelve dollars fifty', 12.5);
});

test('rejects amounts it cannot resolve safely', () => {
  // A cents group of 100+ is ambiguous: 200.50? 250? Refuse rather than guess.
  assertUnparsed('cash out Jordan two hundred and fifty cents', 'no-amount');
  assertUnparsed('Adam buys in for zero', 'no-amount');
  assertUnparsed('Adam buys in for fifty big blinds', 'unsupported-unit');
  assertUnparsed('Adam buys in for fifty bb', 'unsupported-unit');
});

test('cents below a dollar still parse', () => {
  assertCashOut('cash out Jordan fifty cents', 'jordan', 0.5);
});

test('fuzzy name matching tolerates STT slips', () => {
  assertBuyIn('Adem buys in fifty', 'adam', 50);
  assertCashOut('Jordn cash out two hundred', 'jordan', 200);
  // First-token match against a full name.
  assertBuyIn('Mike fifty', 'mike_chen', 50);
  assertBuyIn('Mike Chen fifty', 'mike_chen', 50);
});

test('short names require an exact match', () => {
  assertBuyIn('Ed fifty', 'ed', 50);
  assertBuyIn('Al fifty', 'al', 50);
  // "Ad" must not reach Adam, Al or Ed, and must not become a phantom guest.
  assertUnparsed('Ad fifty', 'unknown-name');
});

test('unknown names become new guests for buy-ins only', () => {
  assertBuyIn('Sarah buys in fifty', null, 50);
  const result = parse('Sarah buys in fifty');
  assert.equal(result.kind, 'buyIn');
  if (result.kind === 'buyIn') assert.equal(result.playerName, 'Sarah');

  // You cannot cash out someone with no ledger row.
  assertUnparsed('cash out Sarah fifty', 'unknown-name');
});

test('genuinely ambiguous names are never guessed', () => {
  const result = parse('Mik fifty');
  assert.equal(result.kind, 'unparsed');
  if (result.kind !== 'unparsed') return;
  assert.equal(result.reason, 'ambiguous-name');
  assert.deepEqual([...(result.candidates ?? [])].sort(), ['Mike Chen', 'Mikey']);
});

test('a seated player outranks a friend who is not playing', () => {
  const roster: VoiceRosterEntry[] = [
    { playerId: 'mike_chen', name: 'Mike Chen', inSession: true },
    { playerId: 'mikey', name: 'Mikey', inSession: false },
  ];
  assertBuyIn('Mik buys in fifty', 'mike_chen', 50, roster);
});

test('partial extraction is preserved for the retry prompt', () => {
  const noAmount = parse('Adam');
  assert.equal(noAmount.kind, 'unparsed');
  if (noAmount.kind === 'unparsed') {
    assert.equal(noAmount.reason, 'no-amount');
    assert.equal(noAmount.playerName, 'Adam');
  }

  const noName = parse('fifty');
  assert.equal(noName.kind, 'unparsed');
  if (noName.kind === 'unparsed') {
    assert.equal(noName.reason, 'no-name');
    assert.equal(noName.amount, 50);
  }
});

test('non-commands and empty input', () => {
  assertUnparsed('', 'empty');
  assertUnparsed('   ', 'empty');
  assertUnparsed("what's the pot", 'no-intent');
});

test('filler words are tolerated', () => {
  assertBuyIn('um okay Adam buys in for fifty please', 'adam', 50);
  assertBuyIn('hey add another fifty for Adam', 'adam', 50);
});

test('chip-mode wording does not convert the amount', () => {
  // "fifty chips" in a chips session is 50, exactly like typing 50.
  assertBuyIn('Adam buys in for fifty chips', 'adam', 50);
});

test('matchRosterName tiers', () => {
  assert.equal(matchRosterName('adam', ROSTER).status, 'match');
  assert.equal(matchRosterName('', ROSTER).status, 'none');
  assert.equal(matchRosterName('zzzzzz', ROSTER).status, 'none');

  const exact = matchRosterName('Mike Chen', ROSTER);
  assert.equal(exact.status, 'match');
  if (exact.status === 'match') assert.equal(exact.entry.playerId, 'mike_chen');
});

test('two different people in one utterance is an ambiguity, not a race', () => {
  const twoNames = parse('cash out Adam and Jordan two hundred');
  assert.equal(twoNames.kind, 'unparsed', JSON.stringify(twoNames));
  if (twoNames.kind !== 'unparsed') return;
  assert.equal(twoNames.reason, 'ambiguous-name');
  assert.deepEqual([...(twoNames.candidates ?? [])].sort(), ['Adam', 'Jordan']);
  // The amount is still carried over for the retry prompt.
  assert.equal(twoNames.amount, 200);

  // Whatever the connecting word is, two seated players must never resolve to one.
  assertUnparsed('Adam pays Jordan fifty', 'ambiguous-name');
  assertUnparsed('Adam and Ed fifty', 'ambiguous-name');
});

test('one person named several ways is still a single match', () => {
  // "Mike" (first-token tier) and "Mike Chen" (exact tier) are the same player.
  assertBuyIn('Mike Chen buys in for fifty', 'mike_chen', 50);
  // A better tier wins outright rather than counting as a second candidate:
  // "Mike" is an exact first token for Mike Chen but only a prefix of Mikey.
  assertBuyIn('Mike fifty', 'mike_chen', 50);
});

test('negated amounts are refused rather than silently made positive', () => {
  // Before: "minus fifty" invented a new guest called "Minus" with a 50 buy-in.
  assertUnparsed('minus fifty', 'negative-amount');
  assertUnparsed('negative twenty', 'negative-amount');
  assertUnparsed('Adam buys in for minus fifty', 'negative-amount');
  assertUnparsed('Adam buys in for -50', 'negative-amount');
  assertUnparsed('cash out Jordan -200', 'negative-amount');

  // Hyphens that are not signs must keep working.
  assertBuyIn('Adam re-buy fifty', 'adam', 50);
  assertAmount('twenty-five', 25);
  assertAmount('12.50', 12.5);
});

test('being at the table outranks the tighter literal match', () => {
  const bryanAway: VoiceRosterEntry[] = [
    { playerId: 'bryan', name: 'Bryan', inSession: false },
    { playerId: 'bryan_tan', name: 'Bryan Tan', inSession: true },
  ];
  // "Bryan" is an exact match for a friend who isn't playing, but only the first
  // token of the player who is. The one at the table wins.
  assertBuyIn('bryan fifty', 'bryan_tan', 50, bryanAway);
  assertBuyIn('bryan fifty', 'bryan_tan', 50, [...bryanAway].reverse());

  // Once both are at the table, the exact name is taken at face value.
  const bothSeated: VoiceRosterEntry[] = [
    { playerId: 'bryan', name: 'Bryan', inSession: true },
    { playerId: 'bryan_tan', name: 'Bryan Tan', inSession: true },
  ];
  assertBuyIn('bryan fifty', 'bryan', 50, bothSeated);
});

test('a longer name is not two people just because it contains a shorter one', () => {
  const roster: VoiceRosterEntry[] = [
    { playerId: 'bryan', name: 'Bryan', inSession: true },
    { playerId: 'bryan_tan', name: 'Bryan Tan', inSession: true },
  ];
  // "bryan tan" and its own sub-span "bryan" overlap, so they are one mention.
  assertBuyIn('bryan tan fifty', 'bryan_tan', 50, roster);

  const cashOut = parse('cash out bryan tan two hundred', roster);
  assert.equal(cashOut.kind, 'cashOut', JSON.stringify(cashOut));
  if (cashOut.kind === 'cashOut') assert.equal(cashOut.playerId, 'bryan_tan');
});

test('a player whose name is also a unit word is still reachable', () => {
  const roster: VoiceRosterEntry[] = [
    { playerId: 'bill', name: 'Bill', inSession: true },
    { playerId: 'chip', name: 'Chip', inSession: true },
    { playerId: 'adam', name: 'Adam', inSession: true },
  ];
  assertBuyIn('Bill fifty', 'bill', 50, roster);
  assertBuyIn('Bill buys in for fifty', 'bill', 50, roster);
  assertBuyIn('Chip buys in for fifty chips', 'chip', 50, roster);
  // The unit word attached to the figure is still swallowed by the amount run,
  // so it never doubles as a second name.
  assertBuyIn('Adam buys in for fifty chips', 'adam', 50, roster);
  assertBuyIn('Adam buys in for fifty bucks', 'adam', 50, roster);

  // With nobody called Bill, the unit word stays pure grammar.
  assertUnparsed('fifty bills', 'no-name');
});

test('a player appearing twice in the roster is not ambiguous with itself', () => {
  const roster: VoiceRosterEntry[] = [
    { playerId: 'adam', name: 'Adam', inSession: true },
    { playerId: 'adam', name: 'Adam', inSession: false },
  ];
  assertBuyIn('Adam buys in fifty', 'adam', 50, roster);
});
