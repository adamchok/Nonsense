import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchRosterName, parseVoiceCommand, phoneticKey } from '../../lib/voice-command.ts';
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

function assertAmount(spokenAmount: string, expected: number) {
  const transcript = `Adam buys in for ${spokenAmount}`;
  const result = parse(transcript);
  assert.equal(result.kind, 'buyIn', `${transcript} -> ${JSON.stringify(result)}`);
  if (result.kind !== 'buyIn') return;
  assert.equal(result.amount, expected, `"${spokenAmount}" should be ${expected}`);
}

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
  assertBuyIn('Mike fifty', 'mike_chen', 50);
  assertBuyIn('Mike Chen fifty', 'mike_chen', 50);
});

test('short names require an exact match', () => {
  assertBuyIn('Ed fifty', 'ed', 50);
  assertBuyIn('Al fifty', 'al', 50);
  assertUnparsed('Ad fifty', 'unknown-name');
});

test('unknown names become new guests for buy-ins only', () => {
  assertBuyIn('Sarah buys in fifty', null, 50);
  const result = parse('Sarah buys in fifty');
  assert.equal(result.kind, 'buyIn');
  if (result.kind === 'buyIn') assert.equal(result.playerName, 'Sarah');

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
  assert.equal(twoNames.amount, 200);

  assertUnparsed('Adam pays Jordan fifty', 'ambiguous-name');
  assertUnparsed('Adam and Ed fifty', 'ambiguous-name');
});

test('one person named several ways is still a single match', () => {
  assertBuyIn('Mike Chen buys in for fifty', 'mike_chen', 50);
  assertBuyIn('Mike fifty', 'mike_chen', 50);
});

test('negated amounts are refused rather than silently made positive', () => {
  assertUnparsed('minus fifty', 'negative-amount');
  assertUnparsed('negative twenty', 'negative-amount');
  assertUnparsed('Adam buys in for minus fifty', 'negative-amount');
  assertUnparsed('Adam buys in for -50', 'negative-amount');
  assertUnparsed('cash out Jordan -200', 'negative-amount');

  assertBuyIn('Adam re-buy fifty', 'adam', 50);
  assertAmount('twenty-five', 25);
  assertAmount('12.50', 12.5);
});

test('being at the table outranks the tighter literal match', () => {
  const bryanAway: VoiceRosterEntry[] = [
    { playerId: 'bryan', name: 'Bryan', inSession: false },
    { playerId: 'bryan_tan', name: 'Bryan Tan', inSession: true },
  ];
  assertBuyIn('bryan fifty', 'bryan_tan', 50, bryanAway);
  assertBuyIn('bryan fifty', 'bryan_tan', 50, [...bryanAway].reverse());

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
  assertBuyIn('Adam buys in for fifty chips', 'adam', 50, roster);
  assertBuyIn('Adam buys in for fifty bucks', 'adam', 50, roster);

  assertUnparsed('fifty bills', 'no-name');
});

test('a player appearing twice in the roster is not ambiguous with itself', () => {
  const roster: VoiceRosterEntry[] = [
    { playerId: 'adam', name: 'Adam', inSession: true },
    { playerId: 'adam', name: 'Adam', inSession: false },
  ];
  assertBuyIn('Adam buys in fifty', 'adam', 50, roster);
});

const MY_ROSTER: VoiceRosterEntry[] = [
  ...ROSTER,
  { playerId: 'chun_fong', name: 'Chun Fong', inSession: true },
  { playerId: 'chun_yi', name: 'Chun Yi', inSession: true },
  { playerId: 'kah_seng', name: 'Kah Seng', inSession: true },
  { playerId: 'eejin', name: 'Eejin', inSession: true },
  { playerId: 'yan_bing', name: 'Yan Bing', inSession: true },
  { playerId: 'wing_xuen', name: 'Wing Xuen', inSession: true },
  { playerId: 'bryan_tan', name: 'Bryan Tan', inSession: true },
  { playerId: 'wei_jie', name: 'Wei Jie', inSession: true },
  { playerId: 'xin_yi', name: 'Xin Yi', inSession: true },
  { playerId: 'zhi_hao', name: 'Zhi Hao', inSession: true },
  { playerId: 'jun_hao', name: 'Jun Hao', inSession: true },
  { playerId: 'kok_leong', name: 'Kok Leong', inSession: true },
];

test('phoneticKey folds English spellings onto romanised names', () => {
  assert.equal(phoneticKey('John Fong'), phoneticKey('Chun Fong'));
  assert.equal(phoneticKey('Chan Fung'), phoneticKey('Chun Fong'));
  assert.equal(phoneticKey('Way Jay'), phoneticKey('Wei Jie'));
  assert.equal(phoneticKey('Shin Yi'), phoneticKey('Xin Yi'));
  assert.equal(phoneticKey('E Jin'), phoneticKey('Eejin'));
  assert.equal(phoneticKey('Gee How'), phoneticKey('Zhi Hao'));
  assert.notEqual(phoneticKey('Sam'), phoneticKey('Xin Yi'));
});

test('English mishearings of Chinese/Malaysian names reach the right player', () => {
  assertBuyIn('John Fong buys in fifty', 'chun_fong', 50, MY_ROSTER);
  assertBuyIn('Chan Fung buys in fifty', 'chun_fong', 50, MY_ROSTER);
  assertBuyIn('chunfong buys in fifty', 'chun_fong', 50, MY_ROSTER);
  assertBuyIn('chun e buys in 50', 'chun_yi', 50, MY_ROSTER);
  assertBuyIn('Eugene buys in 50', 'eejin', 50, MY_ROSTER);
  assertBuyIn('E Jin buys in 50', 'eejin', 50, MY_ROSTER);
  assertBuyIn('Way Jay buys in 50', 'wei_jie', 50, MY_ROSTER);
  assertBuyIn('Shin Yi buys in 50', 'xin_yi', 50, MY_ROSTER);

  assertBuyIn('Ka Sing buys in 50', 'kah_seng', 50, MY_ROSTER);
  assertBuyIn('Casing buys in 50', 'kah_seng', 50, MY_ROSTER);
  assertBuyIn('car sing buys in 50', 'kah_seng', 50, MY_ROSTER);

  assertBuyIn('Yen Bing buys in 50', 'yan_bing', 50, MY_ROSTER);
  assertBuyIn('Yanbing buys in 50', 'yan_bing', 50, MY_ROSTER);
  assertBuyIn('Jan Bing buys in 50', 'yan_bing', 50, MY_ROSTER);

  assertBuyIn('Wing Shuen buys in 50', 'wing_xuen', 50, MY_ROSTER);
  assertBuyIn('Wing Swen buys in 50', 'wing_xuen', 50, MY_ROSTER);
  assertBuyIn('Wing Sun buys in 50', 'wing_xuen', 50, MY_ROSTER);

  assertBuyIn('Brian Tan buys in 50', 'bryan_tan', 50, MY_ROSTER);
  assertBuyIn('Brian buys in 50', 'bryan_tan', 50, MY_ROSTER);
  assertBuyIn('Ryan Tan buys in 50', 'bryan_tan', 50, MY_ROSTER);
});

test('similar-sounding roster names stay distinct', () => {
  const keys = MY_ROSTER.map((e) => phoneticKey(e.name));
  assert.equal(new Set(keys).size, keys.length, keys.join(', '));
  assert.notEqual(phoneticKey('Yan Bing'), phoneticKey('Wing Xuen'));
  assert.notEqual(phoneticKey('Chun Yi'), phoneticKey('Eejin'));

  assertBuyIn('Chun Yi buys in 50', 'chun_yi', 50, MY_ROSTER);
  assertBuyIn('Eejin buys in 50', 'eejin', 50, MY_ROSTER);
  assertBuyIn('Yan Bing buys in 50', 'yan_bing', 50, MY_ROSTER);
  assertBuyIn('Wing Xuen buys in 50', 'wing_xuen', 50, MY_ROSTER);
  assertBuyIn('Kah Seng buys in 50', 'kah_seng', 50, MY_ROSTER);
  assertBuyIn('Bryan Tan buys in 50', 'bryan_tan', 50, MY_ROSTER);
});

test('a sound-alike first name shared by two players is ambiguous', () => {
  const result = parse('John buys in 50', MY_ROSTER);
  assert.equal(result.kind, 'unparsed', JSON.stringify(result));
  if (result.kind !== 'unparsed') return;
  assert.equal(result.reason, 'ambiguous-name');
  // "Jun" sounds like "John" too.
  assert.deepEqual([...(result.candidates ?? [])].sort(), ['Chun Fong', 'Chun Yi', 'Jun Hao']);
});

test('phonetic matching does not swallow new or literal names', () => {
  const sam = parse('Sam buys in 50', MY_ROSTER);
  assert.equal(sam.kind, 'buyIn', JSON.stringify(sam));
  if (sam.kind === 'buyIn') {
    assert.equal(sam.playerId, null);
    assert.equal(sam.playerName, 'Sam');
    assert.equal(sam.heardName, 'Sam');
  }
  assertBuyIn('Adam buys in 50', 'adam', 50, MY_ROSTER);
});

test('learned aliases resolve to the real player', () => {
  const roster: VoiceRosterEntry[] = [
    { playerId: 'ryan_lim', name: 'Ryan Lim', inSession: true, aliases: ['brian'] },
    { playerId: 'adam', name: 'Adam', inSession: true },
  ];
  const result = parse('brian buys in 50', roster);
  assert.equal(result.kind, 'buyIn', JSON.stringify(result));
  if (result.kind !== 'buyIn') return;
  assert.equal(result.playerId, 'ryan_lim');
  assert.equal(result.playerName, 'Ryan Lim');
  assert.equal(result.heardName, 'Brian');

  const match = matchRosterName('Brian', roster);
  assert.equal(match.status, 'match');
  if (match.status === 'match') {
    assert.equal(match.entry.playerId, 'ryan_lim');
    assert.equal(match.tier, 0);
  }

  const aliasToken = parse('cash out john fong 200', [
    { playerId: 'cf', name: 'Chun Fong', inSession: true, aliases: ['john fong'] },
  ]);
  assert.equal(aliasToken.kind, 'cashOut', JSON.stringify(aliasToken));
});

test('heardName reports the words that were actually heard', () => {
  const buyIn = parse('John Fong buys in fifty', MY_ROSTER);
  assert.equal(buyIn.kind, 'buyIn');
  if (buyIn.kind === 'buyIn') {
    assert.equal(buyIn.playerName, 'Chun Fong');
    assert.equal(buyIn.heardName, 'John Fong');
  }

  const cashOut = parse('cash out Shin Yi two hundred', MY_ROSTER);
  assert.equal(cashOut.kind, 'cashOut', JSON.stringify(cashOut));
  if (cashOut.kind === 'cashOut') {
    assert.equal(cashOut.playerId, 'xin_yi');
    assert.equal(cashOut.heardName, 'Shin Yi');
  }

  const literal = parse('Adam buys in fifty');
  if (literal.kind === 'buyIn') assert.equal(literal.heardName, 'Adam');
});
