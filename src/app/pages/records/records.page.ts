import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline } from 'ionicons/icons';

import { AttendanceService, RecordScope } from '../../core/attendance.service';
import { AuthService } from '../../core/auth.service';
import { daysAgoKey, formatTime, friendlyDate, sourceLabel, todayKey } from '../../core/date.util';
import { FeedbackService } from '../../core/feedback.service';
import { AttendanceRecord, AttendanceStatus, STATUS_LABELS } from '../../core/models';
import { RequestsService } from '../../core/requests.service';
import { UsersService } from '../../core/users.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CorrectionRequestComponent } from '../corrections/correction-request.component';
import { RecordDetailComponent, RecordDetailAction } from './record-detail.component';
import { RecordEditorComponent } from './record-editor.component';

@Component({
  selector: 'app-records',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonContent,
    IonIcon,
    IonSpinner,
    EmptyStateComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './records.page.html',
  styleUrl: './records.page.scss',
})
export class RecordsPage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly attendance = inject(AttendanceService);
  private readonly requests = inject(RequestsService);
  private readonly users = inject(UsersService);
  private readonly feedback = inject(FeedbackService);
  private readonly modal = inject(ModalController);

  dateFrom = daysAgoKey(30);
  dateTo = todayKey();
  scope: 'all' | 'department' | 'own' = 'own';
  status: AttendanceStatus | 'all' = 'all';
  includeArchived = false;

  readonly statusOptions: (AttendanceStatus | 'all')[] = [
    'all',
    'present',
    'late',
    'absent',
    'on_leave',
    'excused',
  ];

  readonly statusLabels = STATUS_LABELS;

  /**
   * Records are created by HR Staff and Department Heads.
   */
  readonly canCreate = computed(() => {
    const role = this.auth.role();
    return role === 'hr' || role === 'manager';
  });

  readonly loading = computed(() => this.attendance.loading());

  readonly records = computed(() => this.attendance.filteredRecords());

  constructor() {
    addIcons({ 'add-outline': addOutline });
  }

  ngOnInit(): void {
    const role = this.auth.role();
    this.scope = role === 'hr' ? 'all' : role === 'manager' ? 'department' : 'own';

    this.attendance.statusFilter.set('all');
    this.attendance.includeArchived.set(false);
    this.refresh();

    if (this.canCreate()) {
      this.users.listen('department');
    }
  }

  ngOnDestroy(): void {
    this.attendance.stop();
    this.users.stop();
  }

  /** Re-issue the Firestore query for the current filters. */
  refresh(): void {
    this.attendance.statusFilter.set(this.status);
    this.attendance.includeArchived.set(this.includeArchived);
    this.attendance.listen({
      scope: this.scope as RecordScope,
      department: this.auth.department(),
      employeeId: this.auth.employeeId(),
      dateFrom: this.dateFrom,
      dateTo: this.dateTo,
    });
  }

  setScope(scope: 'all' | 'department' | 'own'): void {
    this.scope = scope;
    this.refresh();
  }

  formatTime(value: string | null): string {
    return formatTime(value);
  }

  friendlyDate(value: string): string {
    return friendlyDate(value);
  }

  sourceLabel(value: string | undefined): string {
    return sourceLabel(value);
  }

  // ------------------------------------------------------------- actions

  async openDetail(record: AttendanceRecord): Promise<void> {
    const modal = await this.modal.create({
      component: RecordDetailComponent,
      componentProps: { record },
      cssClass: 'tuman-modal',
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    const action = (data as { role?: RecordDetailAction } | undefined)?.role ?? 'none';

    switch (action) {
      case 'edit':
        await this.openEditor(record);
        break;
      case 'request-archive':
        await this.requestArchive(record);
        break;
      case 'archive-direct':
        await this.archiveDirect(record);
        break;
      case 'revoke-archive':
        await this.revokeArchive(record);
        break;
      case 'request-correction':
        await this.requestCorrection(record);
        break;
      default:
        break;
    }
  }

  async openEditor(record?: AttendanceRecord): Promise<void> {
    const modal = await this.modal.create({
      component: RecordEditorComponent,
      componentProps: {
        record: record ?? null,
        employees: this.users.users().filter((u) => u.isActive !== false),
      },
      cssClass: 'tuman-modal',
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data) {
      await this.feedback.success('Attendance record saved.');
    }
  }

  private async requestArchive(record: AttendanceRecord): Promise<void> {
    const reason = await this.feedback.prompt(
      'Request archive',
      'Why should this record be archived?',
    );
    if (!reason) {
      return;
    }
    try {
      await this.requests.raiseArchiveRequest(record, reason);
      await this.feedback.success('Archive request sent to HR Staff for approval.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not raise the request.');
    }
  }

  private async archiveDirect(record: AttendanceRecord): Promise<void> {
    const ok = await this.feedback.confirm(
      'Archive this record? Archived records stay visible but cannot be edited.',
      'Archive record',
    );
    if (!ok) {
      return;
    }
    try {
      await this.attendance.archiveDirect(record.id, 'Archived by HR Staff');
      await this.feedback.success('Record archived.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not archive the record.');
    }
  }

  private async revokeArchive(record: AttendanceRecord): Promise<void> {
    const ok = await this.feedback.confirm('Lift the archive on this record?', 'Un-archive record');
    if (!ok) {
      return;
    }
    try {
      await this.attendance.revokeArchive(record.id);
      await this.feedback.success('Archive lifted.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not un-archive.');
    }
  }

  private async requestCorrection(record: AttendanceRecord): Promise<void> {
    const modal = await this.modal.create({
      component: CorrectionRequestComponent,
      componentProps: { record },
      cssClass: 'tuman-modal',
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (!data) {
      return;
    }
    const payload = data as { proposed: Record<string, unknown>; reason: string };
    try {
      await this.requests.raiseCorrectionRequest(record, payload.proposed, payload.reason);
      await this.feedback.success('Correction request submitted for review.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not file the request.');
    }
  }
}
