import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User, onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import { ensureRefCode, getPlayerProfile, upsertPlayerProfile } from '@/lib/firestore';
import type { PlayerProfile } from '@/types';

interface AuthContextValue {
  user: User | null;
  playerProfile: PlayerProfile | null;
  isReady: boolean;
  saveDisplayName: (name: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  playerProfile: null,
  isReady: false,
  saveDisplayName: async () => {},
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

  return (
    <AuthContext.Provider
      value={{
        user,
        playerProfile,
        isReady,
        saveDisplayName: async (name: string) => {
          if (!user) {
            throw new Error('You need to be signed in before saving your display name.');
          }
          const nextProfile = await upsertPlayerProfile(user.uid, name);
          setPlayerProfile(nextProfile);
        },
        signOutUser: async () => {
          const auth = getFirebaseAuth();
          await signOut(auth);
        },
      }}>
      {children}
    </AuthContext.Provider>
  );
}
