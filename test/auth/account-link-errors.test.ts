import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AccountLinkError, toAccountLinkError } from '../../lib/account-link.ts';

function firebaseError(code: string): Error & { code: string } {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

test('popup closed or superseded maps to cancelled', () => {
  for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']) {
    assert.equal(toAccountLinkError(firebaseError(code)).code, 'cancelled', code);
  }
});

test('Google account already attached to another uid maps to credential-in-use', () => {
  for (const code of [
    'auth/credential-already-in-use',
    'auth/email-already-in-use',
    'auth/account-exists-with-different-credential',
  ]) {
    assert.equal(toAccountLinkError(firebaseError(code)).code, 'credential-in-use', code);
  }
});

test('provider-already-linked maps to already-linked', () => {
  assert.equal(toAccountLinkError(firebaseError('auth/provider-already-linked')).code, 'already-linked');
});

test('popup-blocked is unknown with a message telling the user to allow popups', () => {
  const err = toAccountLinkError(firebaseError('auth/popup-blocked'));
  assert.equal(err.code, 'unknown');
  assert.match(err.message, /allow popups/i);
  assert.doesNotMatch(err.message, /Firebase/);
});

test('unauthorized-domain is unknown with a friendly message, not the raw Firebase text', () => {
  const err = toAccountLinkError(firebaseError('auth/unauthorized-domain'));
  assert.equal(err.code, 'unknown');
  assert.doesNotMatch(err.message, /Firebase/);
});

test('unrecognised errors are unknown and keep the underlying detail', () => {
  const err = toAccountLinkError(firebaseError('auth/internal-error'));
  assert.equal(err.code, 'unknown');
  assert.match(err.message, /auth\/internal-error/);
});

test('AccountLinkError passes through unchanged', () => {
  const original = new AccountLinkError('no-user');
  assert.equal(toAccountLinkError(original), original);
});
