export type AuthField = 'email' | 'password' | null;

export interface AuthErrorInfo {
  field: AuthField;
  message: string;
}

const BY_CODE: Record<string, AuthErrorInfo> = {
  'auth/invalid-email': { field: 'email', message: 'Enter a valid email address' },
  'auth/missing-email': { field: 'email', message: 'Enter your email' },
  'auth/user-not-found': { field: 'password', message: 'Wrong email or password' },
  'auth/wrong-password': { field: 'password', message: 'Wrong email or password' },
  'auth/invalid-credential': { field: 'password', message: 'Wrong email or password' },
  'auth/invalid-login-credentials': { field: 'password', message: 'Wrong email or password' },
  'auth/missing-password': { field: 'password', message: 'Enter your password' },
  'auth/weak-password': { field: 'password', message: 'Use at least 8 characters' },
  'auth/password-does-not-meet-requirements': {
    field: 'password',
    message: 'Use at least 8 characters, mixing letters and numbers',
  },
  'auth/email-already-in-use': {
    field: 'email',
    message: 'An account with this email already exists. Sign in instead.',
  },
  'auth/credential-already-in-use': {
    field: 'email',
    message: 'An account with this email already exists. Sign in instead.',
  },
  'auth/user-disabled': { field: null, message: 'This account has been disabled.' },
  'auth/too-many-requests': {
    field: null,
    message: 'Too many attempts. Wait a moment and try again.',
  },
  'auth/network-request-failed': {
    field: null,
    message: 'Network error. Check your connection and try again.',
  },
  'auth/operation-not-allowed': {
    field: null,
    message: 'Email sign-in is not enabled yet. Use Google for now.',
  },
};

export function authErrorInfo(err: unknown): AuthErrorInfo {
  const code =
    typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';
  return BY_CODE[code] ?? { field: null, message: 'Something went wrong. Please try again.' };
}

export const MIN_PASSWORD_LENGTH = 8;

export function emailInputError(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Enter your email';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address';
  return null;
}

export function passwordInputError(password: string, mode: 'signin' | 'create'): string | null {
  if (!password) return 'Enter your password';
  if (mode === 'create' && password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}
