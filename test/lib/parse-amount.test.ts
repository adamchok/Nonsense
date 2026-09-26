/**
 * Run with: npm test   (node --test, no framework, no dependencies)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAmount, sanitizeAmountInput } from '../../lib/parse-amount.ts';

test('parses plain integers and decimals', () => {
  assert.equal(parseAmount('50'), 50);
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount('  20  '), 20);
  assert.equal(parseAmount('.5'), 0.5);
  assert.equal(parseAmount('7.'), 7);
});

test('treats a decimal comma as a decimal point', () => {
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount('0,125'), 0.125);
  assert.equal(parseAmount(',5'), 0.5);
});

test('returns null for empty input', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('   '), null);
});

test('rejects junk instead of truncating it', () => {
  assert.equal(parseAmount('12abc'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1.2.3'), null);
  assert.equal(parseAmount('1,000.50'), null);
  assert.equal(parseAmount('1 000'), null);
  assert.equal(parseAmount('Infinity'), null);
  assert.equal(parseAmount('1e3'), null);
});

test('rejects "1,500": thousands separator or decimal comma is ambiguous', () => {
  assert.equal(parseAmount('1,500'), null);
  assert.equal(parseAmount('12,500'), null);
});

test('leaves sign checks to the caller', () => {
  assert.equal(parseAmount('0'), 0);
  assert.equal(parseAmount('-5'), -5);
});

test('sanitizeAmountInput keeps digits and one decimal separator', () => {
  assert.equal(sanitizeAmountInput('12abc'), '12');
  assert.equal(sanitizeAmountInput('1.2.3'), '1.23');
  assert.equal(sanitizeAmountInput('12,5x'), '12,5');
  assert.equal(sanitizeAmountInput('$ 50'), '50');
  assert.equal(sanitizeAmountInput('-20'), '20');
  assert.equal(sanitizeAmountInput('-20', { allowNegative: true }), '-20');
  assert.equal(sanitizeAmountInput('2-0', { allowNegative: true }), '20');
});
