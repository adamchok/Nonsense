/**
 * Fails an EAS build early when the Firebase config is missing.
 *
 * `.env` is gitignored and EAS excludes gitignored files from the upload, so a cloud build's
 * EXPO_PUBLIC_FIREBASE_* values come entirely from EAS environment variables. Without this
 * check a missing value produces a successfully-built app that throws on first launch —
 * the failure surfaces on a user's phone instead of in the build log.
 *
 * Wired to the `eas-build-pre-install` npm script, which EAS runs before installing deps.
 * Only presence is checked; values are never printed.
 */
const REQUIRED = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  // Google account backup (lib/auth-context.tsx); missing = sign-in fails on device.
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
];

const missing = REQUIRED.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(
    [
      '',
      'Firebase configuration is incomplete. Missing:',
      ...missing.map((name) => `  - ${name}`),
      '',
      'Set these as EAS environment variables for this build profile:',
      '  https://docs.expo.dev/eas/environment-variables/',
      '',
    ].join('\n')
  );
  process.exit(1);
}

console.log(`Firebase config present (${REQUIRED.length}/${REQUIRED.length} variables).`);
