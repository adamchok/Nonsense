/**
 * Anonymous -> Google account linking against the Auth + Firestore emulators. Run with
 * `npm run test:auth`, not `npm test` (which only globs test/lib).
 *
 * `emulators:exec` exports FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST. The Auth
 * emulator accepts unsigned Google ID tokens, so a JSON claims string stands in for the
 * token a real Google sign-in would return. Every test uses its own Google `sub` and its
 * own FirebaseApp, so tests never observe each other's accounts or auth state.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signOut,
} from 'firebase/auth';
import type { Auth, OAuthCredential } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  setLogLevel,
  terminate,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import {
  AccountLinkError,
  isGoogleLinked,
  linkAnonymousWithCredential,
  linkedEmail,
  signInWithAccountCredential,
} from '../../lib/account-link.ts';

/** Must match the --project passed to emulators:exec in the test:auth script. */
const PROJECT_ID = 'demo-nonsense';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

interface Client {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

const clients: Client[] = [];
let appCounter = 0;

/** A fresh app instance: its own auth state, like a fresh install of the app. */
function newClient(): Client {
  appCounter += 1;
  const app = initializeApp(
    { apiKey: 'fake-api-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `account-link-${appCounter}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = FIRESTORE_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  const client = { app, auth, db };
  clients.push(client);
  return client;
}

/** Fake Google credential the Auth emulator accepts in place of a signed ID token. */
function googleCredential(sub: string, email: string): OAuthCredential {
  return GoogleAuthProvider.credential(
    JSON.stringify({ sub, email, email_verified: true })
  );
}

async function expectLinkError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof AccountLinkError, `expected AccountLinkError, got ${String(err)}`);
    assert.ok(err instanceof Error);
    assert.equal(err.code, code);
    return true;
  });
}

before(async () => {
  setLogLevel('error');
  const res = await fetch(
    `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
  assert.ok(res.ok, `failed to clear Auth emulator: ${res.status}`);
});

after(async () => {
  for (const { app, db } of clients) {
    await terminate(db);
    await deleteApp(app);
  }
});

test('anonymous user links Google: uid unchanged, Google linked, email exposed', async () => {
  const { auth } = newClient();
  const anon = (await signInAnonymously(auth)).user;
  assert.equal(anon.isAnonymous, true);
  assert.equal(isGoogleLinked(anon), false);
  assert.equal(linkedEmail(anon), null);

  const linked = await linkAnonymousWithCredential(
    auth,
    googleCredential('google-uid-link', 'link@example.com')
  );

  assert.equal(linked.uid, anon.uid);
  assert.equal(auth.currentUser?.uid, anon.uid);
  assert.equal(linked.isAnonymous, false);
  assert.equal(isGoogleLinked(linked), true);
  assert.equal(linkedEmail(linked), 'link@example.com');
});

test('reinstall: signing in with the linked Google account restores the original uid and data', async () => {
  const { auth, db } = newClient();
  const original = (await signInAnonymously(auth)).user;
  const originalUid = original.uid;

  // Written as the anonymous user through the real rules, as the app does on first launch.
  await setDoc(doc(db, 'players', originalUid), {
    name: 'Reinstaller',
    anonymousUid: originalUid,
  });

  await linkAnonymousWithCredential(
    auth,
    googleCredential('google-uid-reinstall', 'reinstall@example.com')
  );

  // Reinstall: local auth state is gone and the app signs in anonymously again.
  await signOut(auth);
  const fresh = (await signInAnonymously(auth)).user;
  assert.notEqual(fresh.uid, originalUid);

  const restored = await signInWithAccountCredential(
    auth,
    googleCredential('google-uid-reinstall', 'reinstall@example.com')
  );

  assert.equal(restored.uid, originalUid);
  assert.equal(auth.currentUser?.uid, originalUid);
  assert.equal(isGoogleLinked(restored), true);
  assert.equal(linkedEmail(restored), 'reinstall@example.com');

  const snap = await getDoc(doc(db, 'players', originalUid));
  assert.equal(snap.exists(), true);
  assert.equal(snap.data()?.name, 'Reinstaller');
  assert.equal(snap.data()?.anonymousUid, originalUid);
});

test('collision: a second anonymous user cannot link a Google account already in use', async () => {
  const first = newClient();
  await signInAnonymously(first.auth);
  await linkAnonymousWithCredential(
    first.auth,
    googleCredential('google-uid-collide', 'collide@example.com')
  );

  const second = newClient();
  const secondAnon = (await signInAnonymously(second.auth)).user;

  await expectLinkError(
    linkAnonymousWithCredential(
      second.auth,
      googleCredential('google-uid-collide', 'collide@example.com')
    ),
    'credential-in-use'
  );

  const current = second.auth.currentUser;
  assert.ok(current);
  assert.equal(current.uid, secondAnon.uid);
  assert.equal(current.isAnonymous, true);
  assert.equal(isGoogleLinked(current), false);
});

test('linking with no signed-in user fails with no-user', async () => {
  const { auth } = newClient();
  assert.equal(auth.currentUser, null);

  await expectLinkError(
    linkAnonymousWithCredential(auth, googleCredential('google-uid-nouser', 'nouser@example.com')),
    'no-user'
  );
});

test('linking an already-linked user again fails with already-linked', async () => {
  const { auth } = newClient();
  const anon = (await signInAnonymously(auth)).user;
  await linkAnonymousWithCredential(auth, googleCredential('google-uid-twice', 'twice@example.com'));

  await expectLinkError(
    linkAnonymousWithCredential(auth, googleCredential('google-uid-twice', 'twice@example.com')),
    'already-linked'
  );
  assert.equal(auth.currentUser?.uid, anon.uid);
  assert.equal(isGoogleLinked(auth.currentUser!), true);
});
