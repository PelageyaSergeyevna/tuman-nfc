/**
 * Firebase bootstrap.
 *
 * A single lazily-created Firebase app, the Firestore instance and the Auth
 * instance. The Firestore instance is configured with offline persistence so
 * the PWA keeps working when the device loses connectivity.
 */
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  Firestore,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

import { environment } from '../../environments/environment';

let appRef: FirebaseApp | null = null;
let authRef: Auth | null = null;
let firestoreRef: Firestore | null = null;

export function firebaseApp(): FirebaseApp {
  if (appRef) {
    return appRef;
  }
  appRef = getApps().length ? getApp() : initializeApp(environment.firebase);
  return appRef;
}

export function firebaseAuth(): Auth {
  if (authRef) {
    return authRef;
  }
  // `initializeAuth` is required when a custom persistence is requested;
  // fall back to the default instance when the app was already initialised.
  try {
    authRef = initializeAuth(firebaseApp(), {
      persistence: browserLocalPersistence,
    });
  } catch {
    authRef = getAuth(firebaseApp());
    void setPersistence(authRef, browserLocalPersistence);
  }
  return authRef;
}

export function firestoreDb(): Firestore {
  if (firestoreRef) {
    return firestoreRef;
  }
  try {
    firestoreRef = initializeFirestore(firebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialised (e.g. hot reload) — reuse it.
    firestoreRef = getFirestore(firebaseApp());
  }
  return firestoreRef;
}

/**
 * Point the SDK at the local emulator suite. Safe to call more than once.
 */
export function connectEmulators(): void {
  if (!environment.useEmulators) {
    return;
  }
  try {
    connectAuthEmulator(firebaseAuth(), environment.emulator.auth, {
      disableWarnings: true,
    });
  } catch {
    // Already connected.
  }
  try {
    connectFirestoreEmulator(firestoreDb(), environment.emulator.firestore, environment.emulator.firestorePort);
  } catch {
    // Already connected.
  }
}

/** Human-readable project id, shown in the app header. */
export const projectId = environment.firebase.projectId;
