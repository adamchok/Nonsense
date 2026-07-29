import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type User, onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import { ensureRefCode, getPlayerProfile, updatePlayerAvatar, upsertPlayerProfile } from '@/lib/firestore';
import type { PlayerProfile } from '@/types';

interface AuthContextValue {
  user: User | null;
  playerProfile: PlayerProfile | null;
  isReady: boolean;
  saveDisplayName: (name: string) => Promise<void>;
  saveAvatarEmoji: (emoji: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  playerProfile: null,
  isReady: false,
  saveDisplayName: async () => {},
  saveAvatarEmoji: async () => {},
  signOutUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
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
        try {
          const profile = await getPlayerProfile(firebaseUser.uid);
          if (profile && !profile.refCode) {
            profile.refCode = await ensureRefCode(firebaseUser.uid);
          }
          setPlayerProfile(profile);
        } catch (err) {
          console.error('Failed to load player profile:', err);
          setPlayerProfile(null);
        }
        setIsReady(true);
      } else {
        setPlayerProfile(null);
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

  // Stable identity so unrelated ancestor re-renders don't cascade through every consumer.
  const value = useMemo(
    () => ({ user, playerProfile, isReady, saveDisplayName, saveAvatarEmoji, signOutUser }),
    [user, playerProfile, isReady, saveDisplayName, saveAvatarEmoji, signOutUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
