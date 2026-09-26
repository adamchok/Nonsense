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
  onAuthStateChanged,
  signInAnonymously,
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
  isGoogleLinked,
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
  /** True once a Google account is linked to (or signed in as) the current uid. */
  isLinked: boolean;
  /** Email of the linked Google account, if any. */
  linkedEmail: string | null;
  saveDisplayName: (name: string) => Promise<void>;
  saveAvatarEmoji: (emoji: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  /** Link Google to the current anonymous uid (same uid, no data migration). Throws AccountLinkError. */
  linkWithGoogle: () => Promise<void>;
  /**
   * Sign in as the Google-linked account (e.g. after a reinstall). Resolves only after the
   * profile for the new uid is loaded, so callers can route on `playerProfile` right away.
   * Throws AccountLinkError.
   */
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  playerProfile: null,
  isReady: false,
  isLinked: false,
  linkedEmail: null,
  saveDisplayName: async () => {},
  saveAvatarEmoji: async () => {},
  signOutUser: async () => {},
  linkWithGoogle: async () => {},
  signInWithGoogle: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface LinkInfo {
  isLinked: boolean;
  linkedEmail: string | null;
}

const UNLINKED: LinkInfo = { isLinked: false, linkedEmail: null };

function linkInfoOf(user: User | null): LinkInfo {
  return { isLinked: isGoogleLinked(user), linkedEmail: getLinkedEmail(user) };
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

/** Web: Firebase's own Google popup. Always show the account chooser, like the native picker. */
function newGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/** Show the native Google account picker and turn the result into a Firebase credential. */
async function getGoogleCredential(): Promise<AuthCredential> {
  if (IS_WEB) {
    // Web goes through the popup helpers instead; reaching this is a programming error.
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
    // v13+: a dismissed picker resolves with { type: 'cancelled' } instead of throwing.
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
    // Forget the app-local Google session so the account picker shows again next time.
    // Firebase keeps its own session; this does not sign the user out of the app.
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
        setUser(firebaseUser);
        setLinkInfo(linkInfoOf(firebaseUser));
        let profile: PlayerProfile | null = null;
        try {
          profile = await loadProfile(firebaseUser.uid);
        } catch (err) {
          console.error('Failed to load player profile:', err);
        }
        // A newer sign-in (signInWithGoogle) may have replaced this user while we were loading.
        if (auth.currentUser?.uid === firebaseUser.uid) {
          setPlayerProfile(profile);
        }
        setIsReady(true);
      } else {
        setPlayerProfile(null);
        setLinkInfo(UNLINKED);
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error('Anonymous sign-in failed:', err);
          setIsReady(true);
        }
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

  const signOutUser = useCallback(async () => {
    await signOut(getFirebaseAuth());
  }, []);

  const linkWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    // Fail fast before showing the picker; linkAnonymousWithCredential re-checks both.
    if (!auth.currentUser) throw new AccountLinkError('no-user');
    if (isGoogleLinked(auth.currentUser)) throw new AccountLinkError('already-linked');

    // Web: no await before the popup opens, so the browser still treats it as user-initiated.
    const linked = IS_WEB
      ? await linkAnonymousWithPopup(auth, newGoogleProvider())
      : await linkAnonymousWithCredential(auth, await getGoogleCredential());
    // Same uid, so onAuthStateChanged does not fire: refresh link state explicitly.
    setLinkInfo(linkInfoOf(linked));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const signedIn = IS_WEB
      ? await signInWithPopupProvider(auth, newGoogleProvider())
      : await signInWithAccountCredential(auth, await getGoogleCredential());
    // onAuthStateChanged also fires for the new uid, but load here too so that when this
    // resolves playerProfile already reflects the signed-in account.
    let profile: PlayerProfile | null = null;
    try {
      profile = await loadProfile(signedIn.uid);
    } catch (err) {
      console.error('Failed to load player profile after Google sign-in:', err);
    }
    setUser(signedIn);
    setLinkInfo(linkInfoOf(signedIn));
    setPlayerProfile(profile);
  }, []);

  // Stable identity so unrelated ancestor re-renders don't cascade through every consumer.
  const value = useMemo(
    () => ({
      user,
      playerProfile,
      isReady,
      isLinked: linkInfo.isLinked,
      linkedEmail: linkInfo.linkedEmail,
      saveDisplayName,
      saveAvatarEmoji,
      signOutUser,
      linkWithGoogle,
      signInWithGoogle,
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
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
