import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  ...(process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
    ? { measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID }
    : {}),
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId
  );
}

/**
 * Local emulator suite (see `emulators` in firebase.json). Opt-in via EXPO_PUBLIC_USE_EMULATOR=1.
 * The Android emulator reaches the host machine at 10.0.2.2, so set EXPO_PUBLIC_EMULATOR_HOST
 * there; a physical device needs the host's LAN IP.
 */
const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_EMULATOR === '1';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = 8080;
const AUTH_EMULATOR_PORT = 9099;

let app: FirebaseApp | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    // This message can reach an installed build: EXPO_PUBLIC_* come from EAS environment
    // variables, which are not in the repo, so a misconfigured cloud build fails here at
    // runtime rather than at build time. Keep it meaningful to whoever is holding the
    // phone; the developer-facing detail goes to the log.
    console.error(
      'Firebase config missing. Set EXPO_PUBLIC_FIREBASE_* in .env locally, or as EAS environment variables for cloud builds.'
    );
    throw new Error(
      'This build is missing its configuration and cannot connect. Please update or reinstall the app.'
    );
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

let auth: Auth | undefined;

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const firebaseApp = getFirebaseApp();
    // The web bundle resolves firebase/auth to its browser build, which has no
    // getReactNativePersistence; getAuth() there defaults to IndexedDB/localStorage persistence.
    auth =
      Platform.OS === 'web'
        ? getAuth(firebaseApp)
        : initializeAuth(firebaseApp, {
            persistence: getReactNativePersistence(AsyncStorage),
          });
    if (USE_EMULATOR) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, {
        disableWarnings: true,
      });
    }
  }
  return auth;
}

let db: Firestore | undefined;

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
    if (USE_EMULATOR) {
      connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    }
  }
  return db;
}
