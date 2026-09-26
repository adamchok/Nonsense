import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PASSWORD_RULES, authErrorInfo, emailInputError, passwordInputError } from '../../lib/auth-errors.ts';

test('wrong credentials map to one message on the password field', () => {
  for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) {
    assert.deepEqual(authErrorInfo({ code }), { field: 'password', message: 'Wrong email or password' });
  }
});

test('an existing email points the user to sign in instead', () => {
  const info = authErrorInfo({ code: 'auth/email-already-in-use' });
  assert.equal(info.field, 'email');
  assert.match(info.message, /Sign in instead/);
});

test('unknown errors fall back to a generic, field-less message', () => {
  assert.deepEqual(authErrorInfo(new Error('boom')), {
    field: null,
    message: 'Something went wrong. Please try again.',
  });
  assert.equal(authErrorInfo(null).field, null);
});

test('email input is required and must look like an address', () => {
  assert.equal(emailInputError(''), 'Enter your email');
  assert.equal(emailInputError('  '), 'Enter your email');
  assert.equal(emailInputError('adam@'), 'Enter a valid email address');
  assert.equal(emailInputError(' adam@example.com '), null);
});

test('password length is only enforced when creating an account', () => {
  assert.equal(passwordInputError('', 'signin'), 'Enter your password');
  assert.equal(passwordInputError('abc', 'signin'), null);
  assert.equal(passwordInputError('abcdef', 'create'), 'Use at least 8 characters');
  assert.equal(passwordInputError('Abcdefg1!', 'create'), null);
});

test('a failed server password policy explains what is needed', () => {
  const info = authErrorInfo({ code: 'auth/password-does-not-meet-requirements' });
  assert.equal(info.field, 'password');
  assert.match(info.message, /8–50 characters/);
});

test('new passwords must meet the Firebase policy: upper, lower, number, symbol, 8-50', () => {
  assert.equal(passwordInputError('abcdefgh', 'create'), 'Add an uppercase letter, a number and a symbol');
  assert.equal(passwordInputError('Abcdefgh', 'create'), 'Add a number and a symbol');
  assert.equal(passwordInputError('Abcdefg1', 'create'), 'Add a symbol');
  assert.equal(passwordInputError('ABCDEFG1!', 'create'), 'Add a lowercase letter');
  assert.equal(passwordInputError(`Aa1!${'x'.repeat(47)}`, 'create'), 'Use 50 characters or fewer');
  assert.equal(passwordInputError('abcdefgh', 'signin'), null);
});

test('password rules report each requirement for the live checklist', () => {
  const met = (p: string) => PASSWORD_RULES.filter((r) => r.test(p)).map((r) => r.key);
  assert.deepEqual(met(''), []);
  assert.deepEqual(met('Aa1!'), ['upper', 'lower', 'number', 'symbol']);
  assert.deepEqual(met('Aa1!aaaa'), ['length', 'upper', 'lower', 'number', 'symbol']);
  assert.deepEqual(met('Aa1 aaaa'), ['length', 'upper', 'lower', 'number']);
});
