import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAvatarEmoji } from '../../lib/avatar-emoji.ts';

test('strips literal quotes and whitespace around a stored emoji', () => {
  assert.equal(normalizeAvatarEmoji('"🐸"'), '🐸');
  assert.equal(normalizeAvatarEmoji(' “🍀” '), '🍀');
  assert.equal(normalizeAvatarEmoji('🙂'), '🙂');
});

test('returns undefined for empty or non-string values', () => {
  assert.equal(normalizeAvatarEmoji('""'), undefined);
  assert.equal(normalizeAvatarEmoji('  '), undefined);
  assert.equal(normalizeAvatarEmoji(null), undefined);
});
