import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AMOUNT_TOO_LARGE_MESSAGE,
  MAX_AMOUNT,
  amountFieldError,
  isAmountInRange,
  parseAmount,
  parseValidAmount,
  sanitizeAmountInput,
} from '../../lib/parse-amount.ts';

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

test('isAmountInRange matches the server bound of under 100,000,000', () => {
  assert.equal(isAmountInRange(99_999_999.99), true);
  assert.equal(isAmountInRange(100_000_000), false);
  assert.equal(isAmountInRange(-100_000_000), false);
  assert.equal(isAmountInRange(Number.POSITIVE_INFINITY), false);
});

test('amountFieldError rejects amounts of 100,000,000 or more with a clear message', () => {
  assert.equal(amountFieldError('100000000', { empty: 'Enter an amount' }), AMOUNT_TOO_LARGE_MESSAGE);
  assert.equal(amountFieldError('1e9', { empty: 'Enter an amount' }), 'Enter a number');
  assert.equal(amountFieldError('99999999', { empty: 'Enter an amount' }), null);
});

test('amountFieldError keeps the existing empty, invalid and sign messages', () => {
  assert.equal(amountFieldError('  ', { empty: 'Enter an amount' }), 'Enter an amount');
  assert.equal(amountFieldError('abc', { empty: 'Enter an amount' }), 'Enter a number');
  assert.equal(amountFieldError('0', { empty: 'Enter an amount' }), 'Must be more than 0');
  assert.equal(amountFieldError('0', { empty: 'Enter a cash-out', allowZero: true }), null);
  assert.equal(amountFieldError('-1', { empty: 'Enter a cash-out', allowZero: true }), 'Must be 0 or more');
});

test('parseValidAmount returns null for out-of-range or wrong-sign values', () => {
  assert.equal(parseValidAmount('25'), 25);
  assert.equal(parseValidAmount('0'), null);
  assert.equal(parseValidAmount('0', { allowZero: true }), 0);
  assert.equal(parseValidAmount('100000000'), null);
  assert.equal(parseValidAmount('123456789', { allowZero: true }), null);
});

test('AMOUNT_TOO_LARGE_MESSAGE is derived from MAX_AMOUNT', () => {
  assert.equal(AMOUNT_TOO_LARGE_MESSAGE, 'Must be less than 100,000,000');
  assert.ok(AMOUNT_TOO_LARGE_MESSAGE.endsWith(String(MAX_AMOUNT).replace(/\B(?=(\d{3})+(?!\d))/g, ',')));
});
