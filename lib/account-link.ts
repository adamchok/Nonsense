/**
 * Firebase-only account linking logic: attach a Google credential to the current anonymous
 * user (same uid, so no data migration), or sign back in with it after a reinstall.
 *
 * Deliberately free of React / React Native imports so node tests can import it directly.
 * Native: the Google credential comes from the native picker (lib/auth-context.tsx) and is
 * passed to the *WithCredential helpers. Web: the *WithPopup helpers run Firebase's own
 * Google popup flow, which lands on the same uid because it is the same Firebase project.
 */
import * as firebaseAuth from 'firebase/auth';
import { linkWithCredential, signInWithCredential } from 'firebase/auth';
import type { Auth, AuthCredential, AuthProvider, User, UserCredential } from 'firebase/auth';

/**
 * The popup APIs exist only in the browser (and node) builds of firebase/auth. The React
 * Native build, whose typings tsconfig maps in, exports neither, so look them up at call
 * time: web and node tests get the real functions, Android never calls them.
 */
interface PopupAuthApi {
  linkWithPopup?: (user: User, provider: AuthProvider) => Promise<UserCredential>;
  signInWithPopup?: (auth: Auth, provider: AuthProvider) => Promise<UserCredential>;
}

function popupApi<K extends keyof PopupAuthApi>(name: K): NonNullable<PopupAuthApi[K]> {
  const fn = (firebaseAuth as unknown as PopupAuthApi)[name];
  if (!fn) {
    throw new AccountLinkError('unknown', 'Popup sign-in is only available in the web app.');
  }
  return fn as NonNullable<PopupAuthApi[K]>;
}

export type AccountLinkErrorCode =
  | 'no-user'
  | 'already-linked'
  | 'credential-in-use'
  | 'cancelled'
  | 'unknown';

export class AccountLinkError extends Error {
  readonly code: AccountLinkErrorCode;

  constructor(code: AccountLinkErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'AccountLinkError';
    this.code = code;
  }
}

const DEFAULT_MESSAGES: Record<AccountLinkErrorCode, string> = {
  'no-user': 'You need to be signed in before linking an account.',
  'already-linked': 'This account is already linked to Google.',
  'credential-in-use': 'That Google account is already used by another Nonsense account.',
  cancelled: 'Google sign-in was cancelled.',
  unknown: 'Something went wrong with Google sign-in. Please try again.',
};

export const GOOGLE_PROVIDER_ID = 'google.com';

const FIREBASE_CODE_MAP: Record<string, AccountLinkErrorCode> = {
  'auth/credential-already-in-use': 'credential-in-use',
  'auth/email-already-in-use': 'credential-in-use',
  'auth/account-exists-with-different-credential': 'credential-in-use',
  'auth/provider-already-linked': 'already-linked',
  'auth/popup-closed-by-user': 'cancelled',
  'auth/cancelled-popup-request': 'cancelled',
  'auth/user-cancelled': 'cancelled',
};

/** Firebase codes that stay 'unknown' but deserve a specific, actionable message. */
const FIREBASE_MESSAGE_MAP: Record<string, string> = {
  'auth/popup-blocked':
    'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.',
  'auth/unauthorized-domain': 'Google sign-in is not enabled for this website yet.',
  'auth/operation-not-supported-in-this-environment':
    'Google sign-in is not supported in this browser. Try a different browser.',
  'auth/web-storage-unsupported':
    'Google sign-in needs browser storage. Turn off private browsing or allow cookies and try again.',
  'auth/network-request-failed': 'Network error during Google sign-in. Check your connection and try again.',
};

function errorCodeOf(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err as { code: unknown };
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** Normalise anything thrown by Firebase (or elsewhere) into an AccountLinkError. */
export function toAccountLinkError(err: unknown): AccountLinkError {
  if (err instanceof AccountLinkError) {
    return err;
  }
  const firebaseCode = errorCodeOf(err);
  const mapped = firebaseCode ? FIREBASE_CODE_MAP[firebaseCode] : undefined;
  if (mapped) {
    return new AccountLinkError(mapped);
  }
  const message = firebaseCode ? FIREBASE_MESSAGE_MAP[firebaseCode] : undefined;
  if (message) {
    return new AccountLinkError('unknown', message);
  }
  const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
  return new AccountLinkError('unknown', `${DEFAULT_MESSAGES.unknown}${detail}`);
}

export function isGoogleLinked(user: User | null): boolean {
  return Boolean(user?.providerData.some((p) => p.providerId === GOOGLE_PROVIDER_ID));
}

export function linkedEmail(user: User | null): string | null {
  const google = user?.providerData.find((p) => p.providerId === GOOGLE_PROVIDER_ID);
  return google?.email ?? null;
}

/** Current user if it can still take a Google link; throws AccountLinkError otherwise. */
function linkableUser(auth: Auth): User {
  const current = auth.currentUser;
  if (!current) {
    throw new AccountLinkError('no-user');
  }
  if (isGoogleLinked(current)) {
    throw new AccountLinkError('already-linked');
  }
  return current;
}

/** Refresh providerData so isGoogleLinked / linkedEmail see the new provider. */
async function reloadLinked(auth: Auth, result: UserCredential): Promise<User> {
  await result.user.reload();
  return auth.currentUser ?? result.user;
}

/**
 * Link `credential` to the currently signed-in (anonymous) user. The uid is unchanged, so all
 * Firestore data keyed by it stays put. Resolves with the reloaded user.
 */
export async function linkAnonymousWithCredential(
  auth: Auth,
  credential: AuthCredential
): Promise<User> {
  const current = linkableUser(auth);
  try {
    return await reloadLinked(auth, await linkWithCredential(current, credential));
  } catch (err) {
    throw toAccountLinkError(err);
  }
}

/**
 * Web: link `provider` to the current (anonymous) user via Firebase's popup flow. Same uid,
 * same guarantees as linkAnonymousWithCredential. The popup is opened before the first await,
 * so call this directly from a click handler or browsers may block it.
 */
export async function linkAnonymousWithPopup(auth: Auth, provider: AuthProvider): Promise<User> {
  const current = linkableUser(auth);
  try {
    return await reloadLinked(auth, await popupApi('linkWithPopup')(current, provider));
  } catch (err) {
    throw toAccountLinkError(err);
  }
}

/** Sign in with `credential`, replacing the current (e.g. fresh anonymous) session. */
export async function signInWithAccountCredential(
  auth: Auth,
  credential: AuthCredential
): Promise<User> {
  try {
    const result = await signInWithCredential(auth, credential);
    return result.user;
  } catch (err) {
    throw toAccountLinkError(err);
  }
}

/** Web: sign in via Firebase's popup flow, replacing the current (anonymous) session. */
export async function signInWithPopupProvider(auth: Auth, provider: AuthProvider): Promise<User> {
  try {
    const result = await popupApi('signInWithPopup')(auth, provider);
    return result.user;
  } catch (err) {
    throw toAccountLinkError(err);
  }
}
