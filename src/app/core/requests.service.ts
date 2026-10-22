/**
 * Approval workflows.
 *
 * Two request kinds, both handled here:
 *
 *  - archiveRequests   A Department Head asks HR Staff to archive a record.
 *                      Only HR Staff sign off; approving the request also
 *                      applies the archive to the attendance document.
 *
 *  - correctionRequests An Employee asks for their own record to be
 *                      corrected. The Department Head of that department (or
 *                      HR Staff) reviews it; approving applies the proposed
 *                      values to the attendance document.
 */
import { Injectable, inject, signal } from '@angular/core';
import {
  QueryConstraint,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import { AttendanceService } from './attendance.service';
import { AuthService } from './auth.service';
import { firestoreDb } from './firebase';
import {
  ArchiveRequest,
  AttendanceRecord,
  CorrectionFields,
  CorrectionRequest,
} from './models';

export type RequestScope = 'all' | 'department' | 'own';

@Injectable({ providedIn: 'root' })
export class RequestsService {
  private readonly db = firestoreDb();
  private readonly auth = inject(AuthService);
  private readonly attendance = inject(AttendanceService);

  readonly archiveRequests = signal<ArchiveRequest[]>([]);
  readonly correctionRequests = signal<CorrectionRequest[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private unsubArchive: (() => void) | null = null;
  private unsubCorrection: (() => void) | null = null;

  // ------------------------------------------------------------- listeners

  listenArchiveRequests(scope: RequestScope): void {
    this.loading.set(true);
    this.unsubArchive?.();

    const constraints: QueryConstraint[] = [orderBy('requestedAt', 'desc')];
    if (scope === 'department') {
      constraints.unshift(where('department', '==', this.auth.department() ?? ''));
    } else if (scope === 'own') {
      constraints.unshift(where('employeeId', '==', this.auth.employeeId() ?? ''));
    }

    this.unsubArchive = onSnapshot(
      query(collection(this.db, 'archiveRequests'), ...constraints),
      (snap) => {
        this.archiveRequests.set(
          snap.docs.map((d) => ({ ...(d.data() as ArchiveRequest), id: d.id })),
        );
        this.loading.set(false);
      },
      (err) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    );
  }

  listenCorrectionRequests(scope: RequestScope): void {
    this.loading.set(true);
    this.unsubCorrection?.();

    const constraints: QueryConstraint[] = [orderBy('requestedAt', 'desc')];
    if (scope === 'department') {
      constraints.unshift(where('department', '==', this.auth.department() ?? ''));
    } else if (scope === 'own') {
      constraints.unshift(where('employeeId', '==', this.auth.employeeId() ?? ''));
    }

    this.unsubCorrection = onSnapshot(
      query(collection(this.db, 'correctionRequests'), ...constraints),
      (snap) => {
        this.correctionRequests.set(
          snap.docs.map((d) => ({ ...(d.data() as CorrectionRequest), id: d.id })),
        );
        this.loading.set(false);
      },
      (err) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    );
  }

  stop(): void {
    this.unsubArchive?.();
    this.unsubCorrection?.();
    this.unsubArchive = null;
    this.unsubCorrection = null;
  }

  // ------------------------------------------------------- archive workflow

  /** Raise an archive request for a record in the caller's own department. */
  async raiseArchiveRequest(record: AttendanceRecord, reason: string): Promise<string> {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(this.db, 'archiveRequests'), {
      attendanceId: record.id,
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      department: record.department,
      date: record.date,
      reason: reason.trim(),
      status: 'pending',
      requestedBy: this.auth.user()?.uid ?? '',
      requestedByName: this.auth.displayName(),
      requestedAt: now,
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: null,
    } satisfies Partial<ArchiveRequest>);
    return ref.id;
  }

  /** Approve or reject an archive request; approval also archives the record. */
  async reviewArchiveRequest(
    request: ArchiveRequest,
    approve: boolean,
    note: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await updateDoc(doc(this.db, 'archiveRequests', request.id), {
      status: approve ? 'approved' : 'rejected',
      reviewedBy: this.auth.user()?.uid ?? '',
      reviewedByName: this.auth.displayName(),
      reviewedAt: now,
      reviewNote: note.trim(),
    });

    if (approve) {
      await this.attendance.applyArchive(request.attendanceId, {
        requestId: request.id,
        reason: request.reason,
        byUid: this.auth.user()?.uid ?? '',
        byName: this.auth.displayName(),
      });
    }
  }

  // ---------------------------------------------------- correction workflow

  /** File a correction request for a record. */
  async raiseCorrectionRequest(
    record: AttendanceRecord,
    proposed: CorrectionFields,
    reason: string,
  ): Promise<string> {
    const now = new Date().toISOString();
    const current: CorrectionFields = {
      status: record.status,
      timeIn: record.timeIn,
      timeOut: record.timeOut,
      lateMinutes: record.lateMinutes,
      notes: record.notes ?? '',
    };
    const ref = await addDoc(collection(this.db, 'correctionRequests'), {
      attendanceId: record.id,
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      department: record.department,
      date: record.date,
      proposed,
      current,
      reason: reason.trim(),
      status: 'pending',
      requestedBy: this.auth.user()?.uid ?? '',
      requestedByName: this.auth.displayName(),
      requestedAt: now,
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: null,
    } satisfies Partial<CorrectionRequest>);
    return ref.id;
  }

  /** Approve or reject a correction; approval writes the proposed values back. */
  async reviewCorrectionRequest(
    request: CorrectionRequest,
    approve: boolean,
    note: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await updateDoc(doc(this.db, 'correctionRequests', request.id), {
      status: approve ? 'approved' : 'rejected',
      reviewedBy: this.auth.user()?.uid ?? '',
      reviewedByName: this.auth.displayName(),
      reviewedAt: now,
      reviewNote: note.trim(),
    });

    if (!approve) {
      return;
    }

    const patch: Record<string, unknown> = {
      correctionRequestId: request.id,
      updatedAt: now,
      source: 'correction',
    };
    if (request.proposed.status !== undefined) {
      patch['status'] = request.proposed.status;
    }
    if (request.proposed.timeIn !== undefined) {
      patch['timeIn'] = request.proposed.timeIn;
    }
    if (request.proposed.timeOut !== undefined) {
      patch['timeOut'] = request.proposed.timeOut;
    }
    if (request.proposed.lateMinutes !== undefined) {
      patch['lateMinutes'] = request.proposed.lateMinutes;
    }
    if (request.proposed.notes !== undefined) {
      patch['notes'] = request.proposed.notes;
    }

    const { updateDoc: updateAttendance } = await import('firebase/firestore');
    await updateAttendance(doc(this.db, 'attendance', request.attendanceId), patch);
  }
}
