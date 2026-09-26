import { test } from 'node:test';
import assert from 'node:assert/strict';

import { authErrorInfo, emailInputError, passwordInputError } from '../../lib/auth-errors.ts';

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
  assert.equal(passwordInputError('abcdefgh', 'create'), null);
});

test('a failed server password policy explains what is needed', () => {
  const info = authErrorInfo({ code: 'auth/password-does-not-meet-requirements' });
  assert.equal(info.field, 'password');
  assert.match(info.message, /8 characters/);
});
