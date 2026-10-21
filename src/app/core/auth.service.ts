/**
 * Authentication + the signed-in user's profile.
 *
 * Firebase Auth handles the credentials; the app profile (role, department,
 * employee code) lives in `users/{uid}` and is kept live with a snapshot
 * listener so a role change takes effect without a re-login.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Auth,
  User,
  UserCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

import { firebaseAuth, firestoreDb } from './firebase';
import { AppUser } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth: Auth = firebaseAuth();

  /** The Firebase Auth user, or null when signed out. */
  readonly user = signal<User | null>(null);

  /** The app profile from `users/{uid}`. */
  readonly profile = signal<AppUser | null>(null);

  /** True until the initial auth state has been resolved. */
  readonly ready = signal(false);

  /**
   * True once the profile of the signed-in user has been read — or once it is
   * known that there is none. The route guards wait for it, so a user is not
   * sent to the login page while the profile is still on its way.
   */
  readonly profileReady = signal(false);

  /** Last error message produced by a sign-in attempt. */
  readonly error = signal<string | null>(null);

  readonly signedIn = computed(() => this.user() !== null);

  readonly role = computed(() => this.profile()?.role ?? null);

  readonly department = computed(() => this.profile()?.department ?? null);

  readonly employeeId = computed(() => this.profile()?.employeeId ?? null);

  readonly displayName = computed(() => this.profile()?.displayName ?? this.user()?.displayName ?? '');

  private unsubscribeProfile: (() => void) | null = null;

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);
      this.ready.set(true);
      if (user) {
        this.profileReady.set(false);
        this.watchProfile(user.uid);
      } else {
        this.unsubscribeProfile?.();
        this.unsubscribeProfile = null;
        this.profile.set(null);
        this.profileReady.set(true);
      }
    });
  }

  /** Subscribe to the live profile document. */
  private watchProfile(uid: string): void {
    this.unsubscribeProfile?.();
    this.unsubscribeProfile = onSnapshot(
      doc(firestoreDb(), 'users', uid),
      (snap) => {
        this.profile.set(snap.exists() ? (snap.data() as AppUser) : null);
        this.profileReady.set(true);
      },
      () => {
        this.profile.set(null);
        this.profileReady.set(true);
      },
    );
  }

  async signIn(email: string, password: string): Promise<UserCredential | null> {
    this.error.set(null);
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      // Keep the Firebase display name in sync with the app profile name.
      if (!cred.user.displayName && this.profile()?.displayName) {
        await updateProfile(cred.user, { displayName: this.profile()!.displayName });
      }
      return cred;
    } catch (err) {
      this.error.set(this.describe(err));
      return null;
    }
  }

  async signOut(): Promise<void> {
    await fbSignOut(this.auth);
  }

  /** Update the signed-in user's own display name (allowed by the rules). */
  async updateOwnProfile(patch: { displayName?: string; phone?: string }): Promise<string | null> {
    const user = this.user();
    if (!user) {
      return 'You are not signed in.';
    }
    try {
      await updateProfile(user, { displayName: patch.displayName ?? user.displayName ?? undefined });
      const { doc: fsDoc, setDoc } = await import('firebase/firestore');
      await setDoc(
        fsDoc(firestoreDb(), 'users', user.uid),
        { ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
          updatedAt: new Date().toISOString() },
        { merge: true },
      );
      return null;
    } catch (err) {
      return this.describe(err);
    }
  }

  private describe(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password.';
      case 'auth/invalid-email':
        return 'That email address is not valid.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again in a moment.';
      case 'auth/network-request-failed':
        return 'Network error. Are you online?';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      default:
        return err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
    }
  }
}
