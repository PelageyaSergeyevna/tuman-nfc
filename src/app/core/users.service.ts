/**
 * Employee directory.
 *
 * HR Staff see every employee, Department Heads see their own department and
 * employees see only themselves.
 */
import { Injectable, inject, signal } from '@angular/core';
import { QueryConstraint, collection, doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';

import { AuthService } from './auth.service';
import { firestoreDb } from './firebase';
import { AppUser, UserRole } from './models';

export type DirectoryScope = 'all' | 'department' | 'self';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly db = firestoreDb();
  private readonly auth = inject(AuthService);

  /** Live snapshot of the users in the current scope. */
  readonly users = signal<AppUser[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private unsubscribe: (() => void) | null = null;

  /**
   * Subscribe to the users for a scope: the signed-in user's own document for
   * 'self', otherwise a department-filtered, ordered collection query.
   */
  listen(scope: DirectoryScope): void {
    this.loading.set(true);
    this.unsubscribe?.();

    if (scope === 'self') {
      const uid = this.auth.user()?.uid;
      if (!uid) {
        this.users.set([]);
        this.loading.set(false);
        return;
      }
      this.unsubscribe = onSnapshot(
        doc(this.db, 'users', uid),
        (snap) => {
          this.users.set(snap.exists() ? [snap.data() as AppUser] : []);
          this.loading.set(false);
        },
        (err) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      );
      return;
    }

    const constraints: QueryConstraint[] = [orderBy('employeeId', 'asc')];
    if (scope === 'department') {
      constraints.unshift(where('department', '==', this.auth.department() ?? ''));
    }

    this.unsubscribe = onSnapshot(
      query(collection(this.db, 'users'), ...constraints),
      (snap) => {
        this.users.set(snap.docs.map((d) => ({ ...(d.data() as AppUser), uid: d.id })));
        this.loading.set(false);
      },
      (err) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Cached lookups by employee code and by auth uid. */
  findByEmployeeId(employeeId: string): AppUser | undefined {
    return this.users().find((u) => u.employeeId === employeeId);
  }

  findByUid(uid: string): AppUser | undefined {
    return this.users().find((u) => u.uid === uid);
  }

  /** Create or update a user profile (HR Staff only). */
  async save(user: Partial<AppUser> & { uid: string }): Promise<void> {
    const payload: Record<string, unknown> = {
      uid: user.uid,
      employeeId: user.employeeId ?? '',
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      role: (user.role ?? 'employee') as UserRole,
      department: user.department ?? '',
      position: user.position ?? '',
      phone: user.phone ?? '',
      isActive: user.isActive ?? true,
      updatedAt: new Date().toISOString(),
    };
    if (user.photoUrl) {
      payload['photoUrl'] = user.photoUrl;
    }
    await setDoc(doc(this.db, 'users', user.uid), payload, { merge: true });
  }
}
