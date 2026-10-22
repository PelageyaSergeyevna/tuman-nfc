/**
 * TUMAN — domain model.
 *
 * These types mirror the legacy Tuman MySQL schema (backend/app.py +
 * backend/database/tuman_complete_schema.sql) and define the Firestore
 * document shapes used by the hybrid app.
 */

/** Legacy Tuman roles, collapsed to the three roles the hybrid app supports. */
export type UserRole = 'hr' | 'manager' | 'employee';

export const ROLE_LABELS: Record<UserRole, string> = {
  hr: 'HR Staff',
  manager: 'Department Head',
  employee: 'Employee',
};

/** Departments carried over from the Tuman database. */
export const DEPARTMENTS = [
  'Executive',
  'Human Resources',
  'IT',
  'Finance',
  'Operations',
  'Sales',
  'Marketing',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

/** Attendance statuses — identical set to the legacy Tuman `attendance` table. */
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'on_leave' | 'excused';

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  on_leave: 'On Leave',
  excused: 'Excused',
};

export const STATUS_ORDER: AttendanceStatus[] = [
  'present',
  'late',
  'absent',
  'on_leave',
  'excused',
];

/** Where an attendance record came from. */
export type AttendanceRecordSource = 'nfc' | 'manual' | 'seed' | 'correction';

/** Which document holds a pending archive / correction decision. */
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export type RequestKind = 'archive' | 'correction';

/** Shift definitions from the legacy Tuman `shift_schedules` table. */
export type ShiftType = 'day' | 'night';

export interface ShiftSchedule {
  id: string;
  shiftName: string;
  shiftType: ShiftType;
  startTime: string; // "08:00"
  endTime: string; // "17:00"
  gracePeriodMinutes: number;
  breakStart?: string;
  breakEnd?: string;
  isActive: boolean;
}

/** `users/{uid}` */
export interface AppUser {
  uid: string;
  employeeId: string; // legacy Tuman employee code, e.g. "HR001"
  email: string;
  displayName: string;
  role: UserRole;
  department: string;
  position?: string;
  phone?: string;
  photoUrl?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** `attendance/{employeeId_YYYY-MM-DD}` */
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  status: AttendanceStatus;
  timeIn: string | null;
  timeOut: string | null;
  lateMinutes: number;
  shiftId?: string;
  shiftName?: string;
  source: AttendanceRecordSource;
  notes?: string;
  archived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archivedByName?: string | null;
  archiveReason?: string | null;
  archiveRequestId?: string | null;
  /** Set when a correction request produced this version of the record. */
  correctionRequestId?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

/** `nfcCards/{uidHex}` */
export interface NfcCard {
  id: string; // hex UID of the Mifare Classic card
  employeeId: string;
  employeeName: string;
  department: string;
  cardType: string;
  assignedAt: string;
  assignedBy: string;
  isActive: boolean;
  notes?: string;
}

/** `archiveRequests/{id}` */
export interface ArchiveRequest {
  id: string;
  attendanceId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  reason: string;
  status: RequestStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
}

/** The fields an employee is allowed to ask to have corrected. */
export interface CorrectionFields {
  status?: AttendanceStatus;
  timeIn?: string | null;
  timeOut?: string | null;
  lateMinutes?: number;
  notes?: string;
}

/** `correctionRequests/{id}` */
export interface CorrectionRequest {
  id: string;
  attendanceId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  /** Values the employee is asking for. */
  proposed: CorrectionFields;
  /** Snapshot of the values currently on record, for a side-by-side diff. */
  current: CorrectionFields;
  reason: string;
  status: RequestStatus;
  requestedBy: string; // uid
  requestedByName: string;
  requestedAt: string;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
}

/** `notifications/{id}` */
export interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  title: string;
  message: string;
  /** Address by role ("hr"), by employee code, or both. */
  recipientRole?: UserRole;
  recipientEmployeeId?: string;
  /** UIDs that have dismissed it. */
  readBy: string[];
  /** Optional deep link into the app. */
  link?: string;
  createdAt: string;
}

/** Aggregate counters used by the dashboard. */
export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  excused: number;
}

export const EMPTY_SUMMARY: AttendanceSummary = {
  total: 0,
  present: 0,
  absent: 0,
  late: 0,
  onLeave: 0,
  excused: 0,
};

/** Firestore timestamp helper — the app stores ISO strings for easy reading. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** `YYYY-MM-DD` for a given date (local calendar day). */
export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The document id used for a daily attendance record. */
export function attendanceDocId(employeeId: string, dateKey: string): string {
  return `${employeeId}_${dateKey}`;
}
