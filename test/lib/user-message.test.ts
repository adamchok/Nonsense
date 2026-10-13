import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ParticipantNotAllowedError, participantAddError, userMessage } from '../../lib/user-message.ts';

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

test('a denied participant add names the player instead of a generic access error', () => {
  const mapped = participantAddError(firebaseError('permission-denied', 'Missing or insufficient permissions.'), 'Sam');
  assert.ok(mapped instanceof ParticipantNotAllowedError);
  assert.equal(userMessage(mapped, 'fallback'), "Sam isn't your friend, so they can't be added.");
  const inGroup = participantAddError(firebaseError('permission-denied', 'denied'), 'Sam', true);
  assert.equal(userMessage(inGroup, 'fallback'), "Sam isn't your friend or in this group, so they can't be added.");
});

test('other participant add failures pass through unchanged', () => {
  const offline = firebaseError('unavailable', 'offline');
  assert.equal(participantAddError(offline, 'Sam'), offline);
  const appError = new Error('Sessions can have up to 50 players.');
  assert.equal(participantAddError(appError, 'Sam'), appError);
});
