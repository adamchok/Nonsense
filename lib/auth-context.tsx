import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, TurboModuleRegistry } from 'react-native';
import {
  type AuthCredential,
  type User,
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  AccountLinkError,
  accountEmail,
  hasPasswordSignIn,
  isGoogleLinked,
  linkAnonymousWithEmail,
  linkAnonymousWithCredential,
  linkAnonymousWithPopup,
  linkedEmail as getLinkedEmail,
  reauthenticateWithPopupProvider,
  signInWithAccountCredential,
  signInWithPopupProvider,
  toAccountLinkError,
} from '@/lib/account-link';
import { getFirebaseAuth, getFirebaseFunctions, isFirebaseConfigured } from '@/lib/firebase';
import {
  ensureRefCode,
  getPlayerProfile,
  recordTermsAcceptance,
  updatePlayerAvatar,
  upsertPlayerProfile,
} from '@/lib/firestore';
import { TERMS_VERSION } from '@/lib/legal-content';
import type { PlayerProfile } from '@/types';

interface AuthContextValue {
  user: User | null;
  playerProfile: PlayerProfile | null;
  isReady: boolean;
  isLinked: boolean;
  linkedEmail: string | null;
  isAnonymous: boolean;
  hasPassword: boolean;
  email: string | null;
  saveDisplayName: (name: string) => Promise<void>;
  /** Ticked the Terms/Privacy box this session (email sign-up, name step or secure screen). */
  termsAccepted: boolean;
  setTermsAccepted: (accepted: boolean) => void;
  /** Saves the acceptance on an existing profile; no-op if the box was not ticked. */
  saveTermsAcceptance: () => Promise<void>;
  saveAvatarEmoji: (emoji: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  linkWithGoogle: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  createAccountWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Email/password accounts only: confirms the current password, then sets the new one. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /**
   * Re-confirms identity (password when given, otherwise Google; none for guests), then deletes the
   * account and its data on the server and signs out.
   */
  deleteAccount: (password?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  playerProfile: null,
  isReady: false,
  isLinked: false,
  linkedEmail: null,
  isAnonymous: false,
  hasPassword: false,
  email: null,
  saveDisplayName: async () => {},
  termsAccepted: false,
  setTermsAccepted: () => {},
  saveTermsAcceptance: async () => {},
  saveAvatarEmoji: async () => {},
  signOutUser: async () => {},
  linkWithGoogle: async () => {},
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  createAccountWithEmail: async () => {},
  sendPasswordReset: async () => {},
  changePassword: async () => {},
  deleteAccount: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface LinkInfo {
  isLinked: boolean;
  linkedEmail: string | null;
  isAnonymous: boolean;
  hasPassword: boolean;
  email: string | null;
}

const UNLINKED: LinkInfo = { isLinked: false, linkedEmail: null, isAnonymous: false, hasPassword: false, email: null };

function linkInfoOf(user: User | null): LinkInfo {
  return {
    isLinked: isGoogleLinked(user),
    linkedEmail: getLinkedEmail(user),
    isAnonymous: Boolean(user?.isAnonymous),
    hasPassword: hasPasswordSignIn(user),
    email: accountEmail(user),
  };
}

async function loadProfile(uid: string): Promise<PlayerProfile | null> {
  const profile = await getPlayerProfile(uid);
  if (profile && !profile.refCode) {
    try {
      return { ...profile, refCode: await ensureRefCode(uid) };
    } catch (err) {
      console.warn('Could not assign a friend code yet:', err);
    }
  }
  return profile;
}

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let isGoogleConfigured = false;

async function loadGoogleSignin(): Promise<GoogleSigninModule> {
  if (!TurboModuleRegistry.get('RNGoogleSignin')) {
    throw new AccountLinkError(
      'unknown',
      'Google sign-in is not available in Expo Go. Use email, or the installed Nonsense app.'
    );
  }
  return import('@react-native-google-signin/google-signin');
}

function mapGoogleError(err: unknown, { isErrorWithCode, statusCodes }: GoogleSigninModule): AccountLinkError {
  if (err instanceof AccountLinkError) return err;
  if (isErrorWithCode(err)) {
    if (err.code === statusCodes.SIGN_IN_CANCELLED) return new AccountLinkError('cancelled');
    if (err.code === statusCodes.IN_PROGRESS) {
      return new AccountLinkError('unknown', 'Google sign-in is already in progress.');
    }
    if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return new AccountLinkError('unknown', 'Google Play services is unavailable or out of date.');
    }
  }
  console.error('Google sign-in failed:', err);
  return toAccountLinkError(err);
}

const IS_WEB = Platform.OS === 'web';

/** localStorage flag (web only) hinting a non-anonymous user was signed in; read by app/+html.tsx. */
export const SIGNED_IN_HINT_KEY = '@nonsense_signed_in';

/** Whether this browser last saw a signed-in (non-anonymous) user. Always false off-web or during static render. */
export function readSignedInHint(): boolean {
  if (!IS_WEB || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIGNED_IN_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSignedInHint(isSignedIn: boolean): void {
  if (!IS_WEB || typeof window === 'undefined') return;
  try {
    if (isSignedIn) {
      window.localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    } else {
      window.localStorage.removeItem(SIGNED_IN_HINT_KEY);
    }
  } catch (err) {
    console.warn('Could not update the signed-in hint:', err);
  }
}

function newGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

async function getGoogleCredential(): Promise<AuthCredential> {
  if (IS_WEB) {
    throw new AccountLinkError('unknown', 'Native Google sign-in is not available on web.');
  }
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    console.error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set; Google sign-in is unavailable.');
    throw new AccountLinkError(
      'unknown',
      'Google sign-in is not set up in this build. Please update or reinstall the app.'
    );
  }
  const google = await loadGoogleSignin();
  const { GoogleSignin, isCancelledResponse } = google;
  if (!isGoogleConfigured) {
    GoogleSignin.configure({ webClientId });
    isGoogleConfigured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      throw new AccountLinkError('cancelled');
    }
    const { idToken } = response.data;
    if (!idToken) {
      throw new AccountLinkError('unknown', 'Google did not return an ID token. Please try again.');
    }
    return GoogleAuthProvider.credential(idToken);
  } catch (err) {
    throw mapGoogleError(err, google);
  } finally {
    GoogleSignin.signOut().catch(() => {});
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [linkInfo, setLinkInfo] = useState<LinkInfo>(UNLINKED);
  const [isReady, setIsReady] = useState(() => !isFirebaseConfigured());
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let profile: PlayerProfile | null = null;
        try {
          profile = await loadProfile(firebaseUser.uid);
        } catch (err) {
          console.error('Failed to load player profile:', err);
        }
        if (auth.currentUser?.uid === firebaseUser.uid) {
          setUser(firebaseUser);
          setLinkInfo(linkInfoOf(firebaseUser));
          setPlayerProfile(profile);
        }
        setIsReady(true);
      } else {
        setUser(null);
        setPlayerProfile(null);
        setLinkInfo(UNLINKED);
        setIsReady(true);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isReady) writeSignedInHint(!!user && !linkInfo.isAnonymous);
  }, [isReady, user, linkInfo.isAnonymous]);

  const saveDisplayName = useCallback(
    async (name: string) => {
      if (!user) {
        throw new Error('You need to be signed in before saving your display name.');
      }
      const nextProfile = await upsertPlayerProfile(user.uid, name, termsAccepted ? TERMS_VERSION : undefined);
      setPlayerProfile(nextProfile);
    },
    [user, termsAccepted]
  );

  const saveTermsAcceptance = useCallback(async () => {
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid || !termsAccepted) return;
    await recordTermsAcceptance(uid, TERMS_VERSION);
  }, [termsAccepted]);

  const saveAvatarEmoji = useCallback(
    async (emoji: string) => {
      if (!user) {
        throw new Error('You need to be signed in before saving your avatar.');
      }
      await updatePlayerAvatar(user.uid, emoji);
      setPlayerProfile((prev) => (prev ? { ...prev, avatarEmoji: emoji.trim() } : prev));
    },
    [user]
  );

  const adoptUser = useCallback(async (next: User) => {
    let profile: PlayerProfile | null = null;
    try {
      profile = await loadProfile(next.uid);
    } catch (err) {
      console.error('Failed to load player profile after sign-in:', err);
    }
    setUser(next);
    setLinkInfo(linkInfoOf(next));
    setPlayerProfile(profile);
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(getFirebaseAuth());
  }, []);

  const linkWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth.currentUser) throw new AccountLinkError('no-user');
    if (isGoogleLinked(auth.currentUser)) throw new AccountLinkError('already-linked');

    const linked = IS_WEB
      ? await linkAnonymousWithPopup(auth, newGoogleProvider())
      : await linkAnonymousWithCredential(auth, await getGoogleCredential());
    setLinkInfo(linkInfoOf(linked));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const signedIn = IS_WEB
      ? await signInWithPopupProvider(auth, newGoogleProvider())
      : await signInWithAccountCredential(auth, await getGoogleCredential());
    await adoptUser(signedIn);
  }, [adoptUser]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const result = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      await adoptUser(result.user);
    },
    [adoptUser]
  );

  const createAccountWithEmail = useCallback(
    async (email: string, password: string) => {
      const auth = getFirebaseAuth();
      if (auth.currentUser?.isAnonymous) {
        const linked = await linkAnonymousWithEmail(auth, email, password);
        setLinkInfo(linkInfoOf(linked));
        void sendEmailVerification(linked).catch((err) => console.error('Verification email failed:', err));
        return;
      }
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      void sendEmailVerification(result.user).catch((err) => console.error('Verification email failed:', err));
      await adoptUser(result.user);
    },
    [adoptUser]
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const current = getFirebaseAuth().currentUser;
    if (!current?.email) throw new AccountLinkError('no-user');
    // Firebase requires a recent sign-in to change the password; re-checking the old one covers that.
    await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, currentPassword));
    await updatePassword(current, newPassword);
  }, []);

  const deleteAccount = useCallback(async (password?: string) => {
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (!current) throw new AccountLinkError('no-user');
    // The server only accepts a sign-in from the last few minutes, so confirm it is really them first.
    if (password !== undefined) {
      if (!current.email) throw new AccountLinkError('no-user');
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
    } else if (!current.isAnonymous) {
      if (IS_WEB) await reauthenticateWithPopupProvider(current, newGoogleProvider());
      else await reauthenticateWithCredential(current, await getGoogleCredential());
    }
    await httpsCallable(getFirebaseFunctions(), 'deleteAccount')();
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      user,
      playerProfile,
      isReady,
      isLinked: linkInfo.isLinked,
      linkedEmail: linkInfo.linkedEmail,
      isAnonymous: linkInfo.isAnonymous,
      hasPassword: linkInfo.hasPassword,
      email: linkInfo.email,
      saveDisplayName,
      termsAccepted,
      setTermsAccepted,
      saveTermsAcceptance,
      saveAvatarEmoji,
      signOutUser,
      linkWithGoogle,
      signInWithGoogle,
      signInWithEmail,
      createAccountWithEmail,
      sendPasswordReset,
      changePassword,
      deleteAccount,
    }),
    [
      user,
      playerProfile,
      isReady,
      linkInfo,
      saveDisplayName,
      termsAccepted,
      saveTermsAcceptance,
      saveAvatarEmoji,
      signOutUser,
      linkWithGoogle,
      signInWithGoogle,
      signInWithEmail,
      createAccountWithEmail,
      sendPasswordReset,
      changePassword,
      deleteAccount,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
