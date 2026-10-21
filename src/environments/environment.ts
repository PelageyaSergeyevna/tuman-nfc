/**
 * Development environment.
 *
 * The app talks to the local Firebase Emulator Suite by default so the whole
 * stack (Auth + Firestore + Security Rules) can be run offline with
 * `npm run emulators`.
 *
 * The placeholder project id / api key below are the emulator's own
 * well-known values — the emulator never validates them.
 */
export const environment = {
  production: false,
  useEmulators: true,
  /** Which build of the app this is: the web console or the phone scanner. */
  surface: 'web' as const,
  /** Where the full console lives — the phone app sends people there. */
  webAppUrl: 'https://tuman-nfc.web.app',
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'tuman-attendance-demo.firebaseapp.com',
    projectId: 'tuman-attendance-demo',
    storageBucket: 'tuman-attendance-demo.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:demo',
  },
  emulator: {
    auth: 'http://127.0.0.1:9099',
    firestore: '127.0.0.1',
    firestorePort: 8080,
    hub: 'http://127.0.0.1:5000',
    ui: 'http://127.0.0.1:4000',
  },
};
