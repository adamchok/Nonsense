import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  setLogLevel,
  terminate,
  updateDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import {
  accountEmail,
  hasPasswordSignIn,
  isGoogleLinked,
  linkAnonymousWithEmail,
} from '../../lib/account-link.ts';
import { authErrorInfo } from '../../lib/auth-errors.ts';

const PROJECT_ID = 'demo-nonsense';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PASSWORD = 'correct-horse-9';

interface Client {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

const clients: Client[] = [];
let appCounter = 0;

function newClient(): Client {
  appCounter += 1;
  const app = initializeApp(
    { apiKey: 'fake-api-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `email-auth-${appCounter}`
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

async function expectAuthError(
  promise: Promise<unknown>,
  check: (err: unknown) => void
): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    check(err);
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

test('createUserWithEmailAndPassword creates a non-anonymous password user', async () => {
  const { auth } = newClient();
  const { user } = await createUserWithEmailAndPassword(auth, 'create@example.com', PASSWORD);

  assert.equal(user.isAnonymous, false);
  assert.equal(hasPasswordSignIn(user), true);
  assert.equal(isGoogleLinked(user), false);
  assert.equal(accountEmail(user), 'create@example.com');
});

test('linkAnonymousWithEmail upgrades an anonymous user in place and keeps their data', async () => {
  const { auth, db } = newClient();
  const anon = (await signInAnonymously(auth)).user;
  const uid = anon.uid;
  assert.equal(anon.isAnonymous, true);
  assert.equal(hasPasswordSignIn(anon), false);
  assert.equal(accountEmail(anon), null);

  await setDoc(doc(db, 'players', uid), { name: 'Legacy Player', anonymousUid: uid });

  const linked = await linkAnonymousWithEmail(auth, '  upgrade@example.com ', PASSWORD);

  assert.equal(linked.uid, uid);
  assert.equal(auth.currentUser?.uid, uid);
  assert.equal(linked.isAnonymous, false);
  assert.equal(hasPasswordSignIn(linked), true);
  assert.equal(accountEmail(linked), 'upgrade@example.com');

  const snap = await getDoc(doc(db, 'players', uid));
  assert.equal(snap.exists(), true);
  assert.equal(snap.data()?.name, 'Legacy Player');
  assert.equal(snap.data()?.anonymousUid, uid);

  await updateDoc(doc(db, 'players', uid), { name: 'Upgraded Player', anonymousUid: uid });
  await signOut(auth);

  const back = (await signInWithEmailAndPassword(auth, 'upgrade@example.com', PASSWORD)).user;
  assert.equal(back.uid, uid);
  const reloaded = await getDoc(doc(db, 'players', uid));
  assert.equal(reloaded.data()?.name, 'Upgraded Player');
});

test('linking an email already owned by another account maps to the email field', async () => {
  const owner = newClient();
  await createUserWithEmailAndPassword(owner.auth, 'taken@example.com', PASSWORD);

  const other = newClient();
  const anon = (await signInAnonymously(other.auth)).user;

  await expectAuthError(linkAnonymousWithEmail(other.auth, 'taken@example.com', PASSWORD), (err) => {
    const code = (err as { code?: string }).code;
    assert.ok(
      code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use',
      `unexpected code ${String(code)}`
    );
    const info = authErrorInfo(err);
    assert.equal(info.field, 'email');
    assert.match(info.message, /already exists/);
  });

  const current = other.auth.currentUser;
  assert.ok(current);
  assert.equal(current.uid, anon.uid);
  assert.equal(current.isAnonymous, true);
  assert.equal(hasPasswordSignIn(current), false);
});

test('wrong password maps to a generic password-field error', async () => {
  const { auth } = newClient();
  await createUserWithEmailAndPassword(auth, 'wrongpw@example.com', PASSWORD);
  await signOut(auth);

  await expectAuthError(signInWithEmailAndPassword(auth, 'wrongpw@example.com', 'not-the-password'), (err) => {
    assert.deepEqual(authErrorInfo(err), { field: 'password', message: 'Wrong email or password' });
  });
  assert.equal(auth.currentUser, null);
});

test('unknown email maps to the same generic error as a wrong password', async () => {
  const { auth } = newClient();
  await expectAuthError(signInWithEmailAndPassword(auth, 'nobody@example.com', PASSWORD), (err) => {
    assert.deepEqual(authErrorInfo(err), { field: 'password', message: 'Wrong email or password' });
  });
});

test('after signOut, email/password sign-in restores the same uid', async () => {
  const { auth } = newClient();
  const created = (await createUserWithEmailAndPassword(auth, 'return@example.com', PASSWORD)).user;
  await signOut(auth);
  assert.equal(auth.currentUser, null);

  const back = (await signInWithEmailAndPassword(auth, 'return@example.com', PASSWORD)).user;
  assert.equal(back.uid, created.uid);
  assert.equal(hasPasswordSignIn(back), true);
});

test('sendPasswordResetEmail resolves for an existing email', async () => {
  const { auth } = newClient();
  await createUserWithEmailAndPassword(auth, 'reset@example.com', PASSWORD);
  await signOut(auth);

  await sendPasswordResetEmail(auth, 'reset@example.com');
});
