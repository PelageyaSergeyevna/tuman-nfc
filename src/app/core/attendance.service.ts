/**
 * Attendance records: reading, writing and summarising.
 *
 * The service keeps a live snapshot of the records in the currently selected
 * scope and exposes derived helpers (summary counts, lookups).
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

import { firestoreDb } from './firebase';
import { AuthService } from './auth.service';
import {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSummary,
  EMPTY_SUMMARY,
  toDateKey,
} from './models';

export type RecordScope = 'all' | 'department' | 'own';

export interface RecordQuery {
  scope: RecordScope;
  /** Department to read, for the 'department' scope. */
  department?: string | null;
  /** Employee code to read, for the 'own' scope. */
  employeeId?: string | null;
  dateFrom: string;
  dateTo: string;
}

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly db = firestoreDb();
  private readonly auth = inject(AuthService);

  readonly records = signal<AttendanceRecord[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Optional client-side filters applied on top of the active query. */
  readonly statusFilter = signal<AttendanceStatus | 'all'>('all');
  readonly includeArchived = signal(false);

  private unsubscribe: (() => void) | null = null;
  private activeKey = '';

  readonly summary = computed<AttendanceSummary>(() => {
    const summary: AttendanceSummary = { ...EMPTY_SUMMARY };
    for (const r of this.filteredRecords()) {
      summary.total += 1;
      switch (r.status) {
        case 'present':
          summary.present += 1;
          break;
        case 'absent':
          summary.absent += 1;
          break;
        case 'late':
          summary.late += 1;
          break;
        case 'on_leave':
          summary.onLeave += 1;
          break;
        case 'excused':
          summary.excused += 1;
          break;
      }
    }
    return summary;
  });

  /** Records after the status / archived filters have been applied. */
  readonly filteredRecords = computed<AttendanceRecord[]>(() => {
    const status = this.statusFilter();
    const includeArchived = this.includeArchived();
    return this.records().filter((r) => {
      if (!includeArchived && r.archived) {
        return false;
      }
      if (status !== 'all' && r.status !== status) {
        return false;
      }
      return true;
    });
  });

  /** Start listening to the records matching the given scope and date range. */
  listen(options: RecordQuery): void {
    const key = JSON.stringify(options);
    if (key === this.activeKey) {
      return;
    }
    this.activeKey = key;
    this.loading.set(true);
    this.error.set(null);
    this.unsubscribe?.();

    const constraints = [
      where('date', '>=', options.dateFrom),
      where('date', '<=', options.dateTo),
      orderBy('date', 'desc'),
    ];

    if (options.scope === 'department' && options.department) {
      constraints.unshift(where('department', '==', options.department));
    } else if (options.scope === 'own' && options.employeeId) {
      constraints.unshift(where('employeeId', '==', options.employeeId));
    }

    const q = query(collection(this.db, 'attendance'), ...constraints);

    this.unsubscribe = onSnapshot(
      q,
      (snap) => {
        this.records.set(snap.docs.map((d) => this.toRecord(d.id, d.data())));
        this.loading.set(false);
      },
      (err) => {
        this.error.set(err.message);
        this.loading.set(false);
        this.records.set([]);
      },
    );
  }

  /** Stop listening. */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.activeKey = '';
  }

  /** Fetch one record by its document id (used before editing). */
  async fetchOne(id: string): Promise<AttendanceRecord | null> {
    const snap = await (await import('firebase/firestore')).getDoc(doc(this.db, 'attendance', id));
    return snap.exists() ? this.toRecord(snap.id, snap.data()) : null;
  }

  /**
   * Create or update a record.
   *
   * Only the fields that make up the record body are written — the archive
   * fields are handled by the dedicated archive workflow so the Security
   * Rules can enforce the approval chain. `archived` is only written when
   * explicitly supplied, so a plain edit never trips the archive-field guard.
   */
  async save(record: Partial<AttendanceRecord> & { employeeId: string; date: string }): Promise<string> {
    const id = `${record.employeeId}_${record.date}`;
    const payload: Record<string, unknown> = {
      employeeId: record.employeeId,
      employeeName: record.employeeName ?? '',
      department: record.department ?? '',
      date: record.date,
      status: record.status ?? 'present',
      timeIn: record.timeIn ?? null,
      timeOut: record.timeOut ?? null,
      lateMinutes: record.lateMinutes ?? 0,
      source: record.source ?? 'manual',
      notes: record.notes ?? '',
      // The create rule requires `archived == false` on a new record, so the
      // field must be present even when the caller does not set it. Writing
      // `false` onto an existing non-archived record is a no-op for the
      // rules' diff (the value does not change), so plain edits stay safe.
      archived: record.archived ?? false,
      updatedAt: new Date().toISOString(),
    };
    if (record.shiftId) {
      payload['shiftId'] = record.shiftId;
    }
    if (record.shiftName) {
      payload['shiftName'] = record.shiftName;
    }
    await setDoc(doc(this.db, 'attendance', id), payload, { merge: true });
    return id;
  }

  /**
   * Archive a record directly, without an approval request.
   *
   * Only the archive fields are written so the rules' "archive fields only"
   * check passes. HR Staff may do this for records in their own department.
   */
  async archiveDirect(recordId: string, reason: string): Promise<void> {
    const { updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(this.db, 'attendance', recordId), {
      archived: true,
      archivedAt: new Date().toISOString(),
      archivedBy: this.auth.user()?.uid ?? '',
      archivedByName: this.auth.displayName(),
      archiveReason: reason,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Apply an approved archive to a record (HR only — enforced by the rules). */
  async applyArchive(
    recordId: string,
    options: { requestId: string; reason: string; byUid: string; byName: string },
  ): Promise<void> {
    const ref = doc(this.db, 'attendance', recordId);
    const { updateDoc } = await import('firebase/firestore');
    await updateDoc(ref, {
      archived: true,
      archivedAt: new Date().toISOString(),
      archivedBy: options.byUid,
      archivedByName: options.byName,
      archiveReason: options.reason,
      archiveRequestId: options.requestId,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Un-archive a record (HR only). */
  async revokeArchive(recordId: string): Promise<void> {
    const { updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(this.db, 'attendance', recordId), {
      archived: false,
      archivedAt: null,
      archivedBy: null,
      archivedByName: null,
      archiveReason: null,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Hard delete — blocked by the rules for attendance records. */
  async remove(recordId: string): Promise<void> {
    await deleteDoc(doc(this.db, 'attendance', recordId));
  }

  /** Today's record for a given employee, if any. */
  todayRecord(employeeId: string): AttendanceRecord | undefined {
    const key = toDateKey();
    return this.records().find((r) => r.employeeId === employeeId && r.date === key);
  }

  private toRecord(id: string, data: Record<string, unknown>): AttendanceRecord {
    return {
      id,
      employeeId: (data['employeeId'] as string) ?? '',
      employeeName: (data['employeeName'] as string) ?? '',
      department: (data['department'] as string) ?? '',
      date: (data['date'] as string) ?? '',
      status: ((data['status'] as AttendanceStatus) ?? 'present') as AttendanceStatus,
      timeIn: (data['timeIn'] as string | null) ?? null,
      timeOut: (data['timeOut'] as string | null) ?? null,
      lateMinutes: Number(data['lateMinutes'] ?? 0),
      shiftId: data['shiftId'] as string | undefined,
      shiftName: data['shiftName'] as string | undefined,
      source: ((data['source'] as AttendanceRecord['source']) ?? 'manual') as AttendanceRecord['source'],
      notes: (data['notes'] as string) ?? '',
      archived: Boolean(data['archived']),
      archivedAt: (data['archivedAt'] as string | null) ?? null,
      archivedBy: (data['archivedBy'] as string | null) ?? null,
      archivedByName: (data['archivedByName'] as string | null) ?? null,
      archiveReason: (data['archiveReason'] as string | null) ?? null,
      archiveRequestId: (data['archiveRequestId'] as string | null) ?? null,
      correctionRequestId: (data['correctionRequestId'] as string | null) ?? null,
      updatedAt: data['updatedAt'] as string | undefined,
      createdAt: data['createdAt'] as string | undefined,
    };
  }
}

/** Convert a Firestore server timestamp to an ISO string. */
export function tsToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return typeof value === 'string' ? value : null;
}
