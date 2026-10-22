/**
 * NFC card assignments.
 *
 * A card is identified by the hex UID of the Mifare Classic tag and points
 * at exactly one employee. Staff manage the cards of their own department;
 * employees can look up the card that belongs to them.
 */
import { Injectable, inject, signal } from '@angular/core';
import { QueryConstraint, collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';

import { AuthService } from './auth.service';
import { firestoreDb } from './firebase';
import { NfcCard } from './models';
import { isValidUid, normalizeUid, UID_FORMAT_HINT } from './uid';

@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly db = firestoreDb();
  private readonly auth = inject(AuthService);

  readonly cards = signal<NfcCard[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private unsubscribe: (() => void) | null = null;

  listen(scope: 'staff' | 'own'): void {
    this.loading.set(true);
    this.unsubscribe?.();

    const constraints: QueryConstraint[] = [orderBy('assignedAt', 'desc')];
    if (scope === 'own') {
      constraints.unshift(where('employeeId', '==', this.auth.employeeId() ?? ''));
    }

    this.unsubscribe = onSnapshot(
      query(collection(this.db, 'nfcCards'), ...constraints),
      (snap) => {
        this.cards.set(snap.docs.map((d) => ({ ...(d.data() as NfcCard), id: d.id })));
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

  /**
   * Find the card for a scanned UID. Both sides are normalised, so a
   * separator-carrying id still matches the plain hex the scanner reports.
   */
  findByUid(uid: string): NfcCard | undefined {
    const normalized = normalizeUid(uid);
    if (!normalized) {
      return undefined;
    }
    return this.cards().find((c) => normalizeUid(c.id) === normalized);
  }

  /** Find the card assigned to an employee. */
  findByEmployee(employeeId: string): NfcCard | undefined {
    return this.cards().find((c) => c.employeeId === employeeId);
  }

  /** Assign a card to an employee (staff only); the UID is normalised first. */
  async assign(input: {
    uid: string;
    employeeId: string;
    employeeName: string;
    department: string;
    cardType?: string;
    notes?: string;
  }): Promise<void> {
    const id = normalizeUid(input.uid);
    if (!isValidUid(id)) {
      throw new Error(UID_FORMAT_HINT);
    }
    await setDoc(doc(this.db, 'nfcCards', id), {
      id,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      department: input.department,
      cardType: input.cardType || 'Mifare Classic',
      assignedAt: new Date().toISOString(),
      assignedBy: this.auth.user()?.uid ?? '',
      isActive: true,
      notes: input.notes ?? '',
    } satisfies Partial<NfcCard>);
  }

  /** Release a card. */
  async unassign(uid: string): Promise<void> {
    await deleteDoc(doc(this.db, 'nfcCards', this.resolveDocId(uid)));
  }

  /** Toggle the active flag of a card. */
  async setActive(uid: string, isActive: boolean): Promise<void> {
    const { updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(this.db, 'nfcCards', this.resolveDocId(uid)), { isActive });
  }

  /**
   * The document id a card is stored under: the stored (possibly
   * separator-carrying) id wins, so normalising never orphans a document.
   */
  private resolveDocId(uid: string): string {
    const raw = (uid ?? '').trim();
    const exact = this.cards().find((c) => c.id === raw);
    if (exact) {
      return exact.id;
    }
    const normalized = normalizeUid(raw);
    const match = this.cards().find((c) => normalizeUid(c.id) === normalized);
    return match?.id ?? normalized;
  }
}
