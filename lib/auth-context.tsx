import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import {
  type AuthCredential,
  type User,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  AccountLinkError,
  accountEmail,
  hasPasswordSignIn,
  isGoogleLinked,
  linkAnonymousWithEmail,
  linkAnonymousWithCredential,
  linkAnonymousWithPopup,
  linkedEmail as getLinkedEmail,
  signInWithAccountCredential,
  signInWithPopupProvider,
  toAccountLinkError,
} from '@/lib/account-link';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import { ensureRefCode, getPlayerProfile, updatePlayerAvatar, upsertPlayerProfile } from '@/lib/firestore';
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
  saveAvatarEmoji: (emoji: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  linkWithGoogle: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  createAccountWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
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
  saveAvatarEmoji: async () => {},
  signOutUser: async () => {},
  linkWithGoogle: async () => {},
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  createAccountWithEmail: async () => {},
  sendPasswordReset: async () => {},
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
    return { ...profile, refCode: await ensureRefCode(uid) };
  }
  return profile;
}

let isGoogleConfigured = false;

function mapGoogleError(err: unknown): AccountLinkError {
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
    throw mapGoogleError(err);
  } finally {
    GoogleSignin.signOut().catch(() => {});
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [linkInfo, setLinkInfo] = useState<LinkInfo>(UNLINKED);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setIsReady(true);
      return;
    }

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

  const saveDisplayName = useCallback(
    async (name: string) => {
      if (!user) {
        throw new Error('You need to be signed in before saving your display name.');
      }
      const nextProfile = await upsertPlayerProfile(user.uid, name);
      setPlayerProfile(nextProfile);
    },
    [user]
  );

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
      saveAvatarEmoji,
      signOutUser,
      linkWithGoogle,
      signInWithGoogle,
      signInWithEmail,
      createAccountWithEmail,
      sendPasswordReset,
    }),
    [
      user,
      playerProfile,
      isReady,
      linkInfo,
      saveDisplayName,
      saveAvatarEmoji,
      signOutUser,
      linkWithGoogle,
      signInWithGoogle,
      signInWithEmail,
      createAccountWithEmail,
      sendPasswordReset,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
