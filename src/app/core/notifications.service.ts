/**
 * Inbox notifications.
 *
 * A notification is addressed either by role (`recipientRole`) or at a single
 * employee (`recipientEmployeeId`). Because Firestore has no OR query, two
 * listeners are merged into one signal.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { addDoc, collection, onSnapshot, orderBy, query, updateDoc, doc, where } from 'firebase/firestore';

import { AuthService } from './auth.service';
import { firestoreDb } from './firebase';
import { AppNotification, UserRole } from './models';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly db = firestoreDb();
  private readonly auth = inject(AuthService);

  readonly notifications = signal<AppNotification[]>([]);
  readonly loading = signal(false);

  private unsubByRole: (() => void) | null = null;
  private unsubByEmployee: (() => void) | null = null;

  readonly unreadCount = computed(() => {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return 0;
    }
    return this.notifications().filter((n) => !(n.readBy ?? []).includes(uid)).length;
  });

  listen(): void {
    this.loading.set(true);
    this.unsubByRole?.();
    this.unsubByEmployee?.();

    const byId = new Map<string, AppNotification>();

    const merge = (snap: { docs: { id: string; data: () => unknown }[] }): void => {
      for (const d of snap.docs) {
        byId.set(d.id, { ...(d.data() as AppNotification), id: d.id });
      }
      this.notifications.set(
        [...byId.values()].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
      );
      this.loading.set(false);
    };

    const role = this.auth.role();
    if (role) {
      this.unsubByRole = onSnapshot(
        query(
          collection(this.db, 'notifications'),
          where('recipientRole', '==', role),
          orderBy('createdAt', 'desc'),
        ),
        (snap) => merge(snap as never),
        () => (this.loading.set(false)),
      );
    }

    const employeeId = this.auth.employeeId();
    if (employeeId) {
      this.unsubByEmployee = onSnapshot(
        query(
          collection(this.db, 'notifications'),
          where('recipientEmployeeId', '==', employeeId),
          orderBy('createdAt', 'desc'),
        ),
        (snap) => merge(snap as never),
        () => (this.loading.set(false)),
      );
    }
  }

  stop(): void {
    this.unsubByRole?.();
    this.unsubByEmployee?.();
    this.unsubByRole = null;
    this.unsubByEmployee = null;
  }

  /** Mark a notification as read for the signed-in user. */
  async markRead(id: string): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    const notification = this.notifications().find((n) => n.id === id);
    if (!notification || (notification.readBy ?? []).includes(uid)) {
      return;
    }
    await updateDoc(doc(this.db, 'notifications', id), {
      readBy: [...(notification.readBy ?? []), uid],
    });
  }

  /** Send a notification to everyone holding a role (staff only). */
  async notifyRole(role: UserRole, input: { title: string; message: string; link?: string }): Promise<void> {
    await addDoc(collection(this.db, 'notifications'), {
      type: 'info',
      title: input.title,
      message: input.message,
      recipientRole: role,
      readBy: [],
      link: input.link ?? '',
      createdAt: new Date().toISOString(),
    });
  }

  /** Send a notification to a single employee (staff only). */
  async notifyEmployee(
    employeeId: string,
    input: { title: string; message: string; link?: string },
  ): Promise<void> {
    await addDoc(collection(this.db, 'notifications'), {
      type: 'info',
      title: input.title,
      message: input.message,
      recipientEmployeeId: employeeId,
      readBy: [],
      link: input.link ?? '',
      createdAt: new Date().toISOString(),
    });
  }
}
