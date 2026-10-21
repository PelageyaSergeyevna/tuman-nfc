/**
 * Attendance status pill — the Ionic equivalent of the Tuman status badge.
 */
import { Component, Input } from '@angular/core';
import { AttendanceStatus } from '../core/models';

const CLASS_BY_STATUS: Record<AttendanceStatus, string> = {
  present: 'tuman-badge-present',
  absent: 'tuman-badge-absent',
  late: 'tuman-badge-late',
  on_leave: 'tuman-badge-on_leave',
  excused: 'tuman-badge-excused',
};

const LABEL_BY_STATUS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  on_leave: 'On Leave',
  excused: 'Excused',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="tuman-badge" [class]="cssClass">{{ label }}</span>`,
})
export class StatusBadgeComponent {
  @Input({ required: true }) status: AttendanceStatus = 'present';

  get cssClass(): string {
    return CLASS_BY_STATUS[this.status] ?? 'tuman-badge-excused';
  }

  get label(): string {
    return LABEL_BY_STATUS[this.status] ?? this.status;
  }
}
