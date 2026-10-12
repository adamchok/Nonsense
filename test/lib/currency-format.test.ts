import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatBlinds } from '../../lib/currency-format.ts';

test('whole-dollar blinds drop the cents; any cents show on both sides', () => {
  assert.equal(formatBlinds(1, 2), '$1/$2');
  assert.equal(formatBlinds(5, 10), '$5/$10');
  assert.equal(formatBlinds(0.5, 1), '$0.50/$1.00');
  assert.equal(formatBlinds(0.25, 0.5), '$0.25/$0.50');
  assert.equal(formatBlinds(2, 1), null);
});
