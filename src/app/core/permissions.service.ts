/**
 * Permissions / access-matrix helpers.
 *
 * The Firestore Security Rules are the real enforcement point; this service
 * mirrors the same matrix so the UI can hide what the user cannot do and
 * explain why.
 */
import { Injectable } from '@angular/core';
import { UserRole } from './models';

export type Capability =
  | 'read:all-departments'
  | 'read:own-department'
  | 'read:own-records'
  | 'write:attendance'
  | 'write:archive'
  | 'archive:direct'
  | 'review:archive'
  | 'review:correction'
  | 'file:correction'
  | 'manage:cards'
  | 'manage:users'
  | 'manage:shifts'
  | 'use:scanner';

const MATRIX: Record<UserRole, Capability[]> = {
  hr: [
    'read:all-departments',
    'write:attendance',
    'archive:direct',
    'review:archive',
    'review:correction',
    'file:correction',
    'manage:cards',
    'manage:users',
    'manage:shifts',
    'use:scanner',
  ],
  manager: [
    'read:own-department',
    'write:attendance',
    'review:correction',
    'file:correction',
    'manage:cards',
    'use:scanner',
  ],
  employee: ['read:own-records', 'file:correction'],
};

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  can(role: UserRole | null | undefined, capability: Capability): boolean {
    if (!role) {
      return false;
    }
    return MATRIX[role].includes(capability);
  }

  /** True when the user may open the NFC scanner screen. */
  canScan(role: UserRole | null | undefined): boolean {
    return this.can(role, 'use:scanner');
  }

  /**
   * The departments whose attendance the user may write to.
   * HR and Department Heads are confined to their own department.
   */
  writableDepartments(role: UserRole | null | undefined, ownDepartment: string | undefined): string[] {
    if (!role || !ownDepartment) {
      return [];
    }
    return this.can(role, 'write:attendance') ? [ownDepartment] : [];
  }

  /**
   * A short, human explanation shown when an action is not permitted.
   */
  explainDenied(capability: Capability): string {
    switch (capability) {
      case 'archive:direct':
        return 'Archiving requires approval from HR Staff.';
      case 'review:archive':
        return 'Only HR Staff can approve archive requests.';
      case 'write:attendance':
        return 'Only HR Staff and Department Heads can edit attendance records.';
      case 'use:scanner':
        return 'The NFC scanner is available to HR Staff and Department Heads.';
      case 'manage:users':
        return 'Only HR Staff can manage user accounts.';
      case 'manage:shifts':
        return 'Only HR Staff can manage shift schedules.';
      default:
        return 'You do not have permission to perform this action.';
    }
  }
}
