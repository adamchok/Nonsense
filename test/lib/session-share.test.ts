import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSessionShareText, signedShortMoney } from '../../lib/session-share.ts';

const input = {
  date: new Date(2026, 7, 27, 20, 0),
  location: "Adam's place",
  hostName: 'Race Tester',
  blinds: '$2.00/$4.00',
  duration: '3h 16m',
  results: [
    { playerName: 'Priya', profit: 90 },
    { playerName: 'Sam', profit: 0 },
    { playerName: 'Race Tester', profit: -90 },
  ],
  settlements: [{ from: 'Race Tester', to: 'Priya', amount: 90 }],
};

test('whatsapp text uses bold headings, dots, short amounts and arrows', () => {
  assert.equal(
    buildSessionShareText(input, { bold: true }),
    [
      '🃏 *Nonsense · Thu 27 Aug 2026*',
      "📍 Adam's place · $2/$4 · 3h 16m",
      '👑 Host: Race Tester',
      '',
      '*Results*',
      '🟢 Priya  +$90',
      '⚪ Sam  $0',
      '🔴 Race Tester  -$90',
      '',
      '*Settle up*',
      '💸 Race Tester → Priya  *$90*',
    ].join('\n')
  );
});

test('copied text is the same without bold markers', () => {
  const text = buildSessionShareText(input, { bold: false });
  assert.ok(!text.includes('*'));
  assert.ok(text.includes('💸 Race Tester → Priya  $90'));
});

test('missing details are skipped and no settlements say so', () => {
  const text = buildSessionShareText(
    { results: [{ playerName: 'A', profit: 0 }], settlements: [], duration: 'N/A' },
    { bold: false }
  );
  assert.equal(text, ['🃏 Nonsense', '', 'Results', '⚪ A  $0', '', 'Settle up', '✅ No payments needed'].join('\n'));
});

test('cents are kept only when needed', () => {
  assert.equal(signedShortMoney(12.5), '+$12.50');
  assert.equal(signedShortMoney(-1250), '-$1,250');
});
