/**
 * Production environment.
 *
 * `firebase` holds the web-app config of the live Firebase project
 * (Project settings → Your apps → SDK setup and configuration). These values
 * are public identifiers — the security of the app comes from Firestore
 * Security Rules and Firebase Auth, not from hiding the API key.
 *
 * The project must be on the Spark (free) plan — no Cloud Functions are
 * required by this app.
 */
export const environment = {
  production: true,
  useEmulators: false,
  /** Which build of the app this is: the web console or the phone scanner. */
  surface: 'web' as const,
  /** Where the full console lives — the phone app sends people there. */
  webAppUrl: 'https://tuman-nfc.web.app',
  firebase: {
    apiKey: 'AIzaSyDRbhBKR7Sec0Iu72ve7GyBse8cDoWPwac',
    authDomain: 'tuman-nfc.firebaseapp.com',
    projectId: 'tuman-nfc',
    storageBucket: 'tuman-nfc.firebasestorage.app',
    messagingSenderId: '716875784',
    appId: '1:716875784:web:795eca7060f5f4415049bd',
  },
  emulator: {
    auth: 'http://127.0.0.1:9099',
    firestore: '127.0.0.1',
    firestorePort: 8080,
    hub: 'http://127.0.0.1:5000',
    ui: 'http://127.0.0.1:4000',
  },
};
