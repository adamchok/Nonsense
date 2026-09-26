import { after, before, test } from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

import { HOST, STRANGER, createRulesEnv, dbAs } from './helpers.ts';

let env: RulesTestEnvironment;

before(async () => {
  env = await createRulesEnv();
});

after(async () => {
  await env.cleanup();
});

const aliasPath = (owner: string, playerId: string) => `players/${owner}/voice_aliases/${playerId}`;

test('owner can save, read and delete their voice aliases', async () => {
  const db = dbAs(env, HOST);
  const ref = doc(db, aliasPath(HOST, 'chunfong'));
  await assertSucceeds(setDoc(ref, { aliases: ['john fong', 'chan fung'] }));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(deleteDoc(ref));
});

test('others cannot read or write someone else’s voice aliases', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), aliasPath(HOST, 'eejin')), { aliases: ['eugene'] });
  });
  const db = dbAs(env, STRANGER);
  await assertFails(getDoc(doc(db, aliasPath(HOST, 'eejin'))));
  await assertFails(setDoc(doc(db, aliasPath(HOST, 'eejin')), { aliases: ['x'] }));
  await assertFails(deleteDoc(doc(db, aliasPath(HOST, 'eejin'))));
});

test('alias docs are shape- and size-limited', async () => {
  const db = dbAs(env, HOST);
  const ref = doc(db, aliasPath(HOST, 'bryan'));
  await assertFails(setDoc(ref, { aliases: 'brian' }));
  await assertFails(setDoc(ref, { aliases: ['brian'], extra: true }));
  await assertFails(setDoc(ref, { aliases: Array.from({ length: 11 }, (_, i) => `a${i}`) }));
  await assertSucceeds(setDoc(ref, { aliases: Array.from({ length: 10 }, (_, i) => `a${i}`) }));
});
