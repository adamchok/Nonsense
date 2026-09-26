import { test } from 'node:test';
import assert from 'node:assert/strict';

import { userMessage } from '../../lib/user-message.ts';

function firebaseError(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.name = 'FirebaseError';
  e.code = code;
  return e;
}

test('hides raw Firebase detail behind the fallback', () => {
  const e = firebaseError('failed-precondition', 'The query requires an index. You can create it here: https://console.firebase.google.com/...');
  assert.equal(userMessage(e, "Couldn't load sessions."), "Couldn't load sessions.");
});

test('maps known Firebase codes to friendly text', () => {
  assert.match(userMessage(firebaseError('unavailable', 'x'), 'fallback'), /connection/);
});

test('passes through app errors and falls back for non-errors', () => {
  assert.equal(userMessage(new Error('Only the host can do that.'), 'fallback'), 'Only the host can do that.');
  assert.equal(userMessage('boom', 'fallback'), 'fallback');
});
