/**
 * Firebase-only account linking logic: attach a Google credential to the current anonymous
 * user (same uid, so no data migration), or sign back in with it after a reinstall.
 *
 * Deliberately free of React / React Native imports so node tests can import it directly.
 * Obtaining the Google credential (native picker) lives in lib/auth-context.tsx.
 */
import { linkWithCredential, signInWithCredential } from 'firebase/auth';
import type { Auth, AuthCredential, User } from 'firebase/auth';

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

/**
 * Link `credential` to the currently signed-in (anonymous) user. The uid is unchanged, so all
 * Firestore data keyed by it stays put. Resolves with the reloaded user.
 */
export async function linkAnonymousWithCredential(
  auth: Auth,
  credential: AuthCredential
): Promise<User> {
  const current = auth.currentUser;
  if (!current) {
    throw new AccountLinkError('no-user');
  }
  if (isGoogleLinked(current)) {
    throw new AccountLinkError('already-linked');
  }
  try {
    const result = await linkWithCredential(current, credential);
    // Refresh providerData so isGoogleLinked / linkedEmail see the new provider.
    await result.user.reload();
    return auth.currentUser ?? result.user;
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
