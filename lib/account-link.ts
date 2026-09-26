import * as firebaseAuth from 'firebase/auth';
import { EmailAuthProvider, linkWithCredential, signInWithCredential } from 'firebase/auth';
import type { Auth, AuthCredential, AuthProvider, User, UserCredential } from 'firebase/auth';

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

export const PASSWORD_PROVIDER_ID = 'password';

export function hasPasswordSignIn(user: User | null): boolean {
  return Boolean(user?.providerData.some((p) => p.providerId === PASSWORD_PROVIDER_ID));
}

export function accountEmail(user: User | null): string | null {
  return user?.email ?? user?.providerData.find((p) => p.email)?.email ?? null;
}

export async function linkAnonymousWithEmail(auth: Auth, email: string, password: string): Promise<User> {
  const current = auth.currentUser;
  if (!current) throw new AccountLinkError('no-user');
  if (!current.isAnonymous) throw new AccountLinkError('already-linked', 'This account already has a sign-in.');
  const result = await linkWithCredential(current, EmailAuthProvider.credential(email.trim(), password));
  return reloadLinked(auth, result);
}

export function linkedEmail(user: User | null): string | null {
  const google = user?.providerData.find((p) => p.providerId === GOOGLE_PROVIDER_ID);
  return google?.email ?? null;
}

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

async function reloadLinked(auth: Auth, result: UserCredential): Promise<User> {
  await result.user.reload();
  return auth.currentUser ?? result.user;
}

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

export async function linkAnonymousWithPopup(auth: Auth, provider: AuthProvider): Promise<User> {
  const current = linkableUser(auth);
  try {
    return await reloadLinked(auth, await popupApi('linkWithPopup')(current, provider));
  } catch (err) {
    throw toAccountLinkError(err);
  }
}

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

export async function signInWithPopupProvider(auth: Auth, provider: AuthProvider): Promise<User> {
  try {
    const result = await popupApi('signInWithPopup')(auth, provider);
    return result.user;
  } catch (err) {
    throw toAccountLinkError(err);
  }
}
