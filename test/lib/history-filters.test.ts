import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_FILTERS,
  countActiveFilters,
  filterEntries,
  monthGrid,
  parseYmd,
  presetRange,
  toYmd,
} from '../../lib/history-filters.ts';

const entry = (ymd: string, profit: number, totalBuyIn = 100, location: string | null = null) => ({
  date: new Date(`${ymd}T20:00:00`),
  profit,
  totalBuyIn,
  location,
});

test('parseYmd round-trips and rejects impossible dates', () => {
  assert.equal(toYmd(parseYmd('2026-02-28')!), '2026-02-28');
  assert.equal(parseYmd('2026-02-30'), null);
  assert.equal(parseYmd(''), null);
  assert.equal(parseYmd('28/02/2026'), null);
});

test('filterEntries treats the end date as inclusive', () => {
  const entries = [entry('2026-09-01', 10), entry('2026-09-20', 20), entry('2026-09-21', 30)];
  const got = filterEntries(entries, { ...DEFAULT_FILTERS, startDate: '2026-09-01', endDate: '2026-09-20' });
  assert.deepEqual(got.map((e) => e.profit), [10, 20]);
});

test('filterEntries applies amount ranges, including negative profit', () => {
  const entries = [entry('2026-09-01', -500, 500), entry('2026-09-02', -50, 200), entry('2026-09-03', 415, 300)];
  const losses = filterEntries(entries, { ...DEFAULT_FILTERS, profitMax: '-1' });
  assert.deepEqual(losses.map((e) => e.profit), [-500, -50]);
  const bigBuyIns = filterEntries(entries, { ...DEFAULT_FILTERS, buyInMin: '300' });
  assert.deepEqual(bigBuyIns.map((e) => e.profit), [-500, 415]);
});

test('filterEntries matches locations, with blank as "no location"', () => {
  const entries = [entry('2026-09-01', 1, 100, 'Home'), entry('2026-09-02', 2, 100, null)];
  assert.equal(filterEntries(entries, { ...DEFAULT_FILTERS, locations: ['Home'] }).length, 1);
  assert.equal(filterEntries(entries, { ...DEFAULT_FILTERS, locations: [''] })[0].profit, 2);
  assert.equal(filterEntries(entries, { ...DEFAULT_FILTERS, locations: [] }).length, 0);
});

test('countActiveFilters counts groups, not fields', () => {
  assert.equal(countActiveFilters(DEFAULT_FILTERS), 0);
  assert.equal(countActiveFilters({ ...DEFAULT_FILTERS, startDate: '2026-01-01', endDate: '2026-02-01' }), 1);
  assert.equal(countActiveFilters({ ...DEFAULT_FILTERS, buyInMin: '10', profitMax: '0', locations: [] }), 3);
});

test('presetRange ends today and covers the right span', () => {
  const today = new Date(2026, 8, 26);
  assert.deepEqual(presetRange('all', today), { start: '', end: '' });
  assert.deepEqual(presetRange('30d', today), { start: '2026-08-28', end: '2026-09-26' });
  assert.deepEqual(presetRange('3m', today), { start: '2026-06-27', end: '2026-09-26' });
  assert.deepEqual(presetRange('year', today), { start: '2026-01-01', end: '2026-09-26' });
});

test('monthGrid starts weeks on Monday and pads to whole weeks', () => {
  const sept = monthGrid(2026, 8);
  assert.equal(sept[0], null);
  assert.equal(sept[1]?.getDate(), 1);
  assert.equal(sept.length % 7, 0);
  assert.equal(sept.filter(Boolean).length, 30);
});
