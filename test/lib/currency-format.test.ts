import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatBlinds, formatCurrency, formatSignedCurrency } from '../../lib/currency-format.ts';

test('whole-dollar blinds drop the cents; any cents show on both sides', () => {
  assert.equal(formatBlinds(1, 2), '$1/$2');
  assert.equal(formatBlinds(5, 10), '$5/$10');
  assert.equal(formatBlinds(0.5, 1), '$0.50/$1.00');
  assert.equal(formatBlinds(0.25, 0.5), '$0.25/$0.50');
  assert.equal(formatBlinds(2, 1), null);
  assert.equal(formatBlinds(10000, 20000), '$10K/$20K');
  assert.equal(formatBlinds(25000, 50000), '$25K/$50K');
});

test('whole amounts from $1,000 drop the cents; smaller or fractional amounts keep them', () => {
  assert.equal(formatCurrency(58), '$58.00');
  assert.equal(formatCurrency(5.4), '$5.40');
  assert.equal(formatCurrency(1000), '$1,000');
  assert.equal(formatCurrency(1630000), '$1,630,000');
  assert.equal(formatCurrency(1234.5), '$1,234.50');
  assert.equal(formatSignedCurrency(-340000), '-$340,000');
});
