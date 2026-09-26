const REQUIRED = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
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
