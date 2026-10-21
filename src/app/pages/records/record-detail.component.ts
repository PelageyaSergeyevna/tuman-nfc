/**
 * Modal that shows one attendance record in full and offers the actions the
 * signed-in role is allowed to perform.
 */
import { Component, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  archiveOutline,
  createOutline,
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';
import { AttendanceRecord } from '../../core/models';
import { formatDateTime, formatTime, sourceLabel } from '../../core/date.util';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

export type RecordDetailAction =
  | 'edit'
  | 'request-archive'
  | 'archive-direct'
  | 'revoke-archive'
  | 'request-correction'
  | 'none';

@Component({
  selector: 'app-record-detail',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
    StatusBadgeComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ record.employeeName || record.employeeId }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (record) {
        <div class="tuman-detail-head">
          <app-status-badge [status]="record.status"></app-status-badge>
          @if (record.archived) {
            <span class="tuman-badge tuman-badge-archived">Archived</span>
          }
        </div>

        <div class="tuman-detail-grid">
          <div class="tuman-detail-cell">
            <div class="tuman-detail-label">Employee code</div>
            <div class="tuman-detail-value">{{ record.employeeId }}</div>
          </div>
          <div class="tuman-detail-cell">
            <div class="tuman-detail-label">Department</div>
            <div class="tuman-detail-value">{{ record.department }}</div>
          </div>
          <div class="tuman-detail-cell">
            <div class="tuman-detail-label">Date</div>
            <div class="tuman-detail-value">{{ record.date }}</div>
          </div>
          <div class="tuman-detail-cell">
            <div class="tuman-detail-label">Shift</div>
            <div class="tuman-detail-value">{{ record.shiftName || '—' }}</div>
          </div>
          <div class="tuman-detail-cell">
            <div class="tuman-detail-label">Time in</div>
            <div class="tuman-detail-value">{{ timeIn }}</div>
          </div>
          <div class="tuman-detail-cell">
            <div class="tuman-detail-label">Time out</div>
            <div class="tuman-detail-value">{{ timeOut }}</div>
          </div>
          <div class="tuman-detail-cell">
            <div class="tuman-detail-label">Late minutes</div>
            <div class="tuman-detail-value">{{ record.lateMinutes || 0 }}</div>
          </div>
          <div class="tuman-detail-cell">
            <div class="tuman-detail-label">Source</div>
            <div class="tuman-detail-value">{{ sourceLabel(record.source) }}</div>
          </div>
        </div>

        @if (record.notes) {
          <div class="tuman-section-title">Notes</div>
          <p class="tuman-detail-notes">{{ record.notes }}</p>
        }

        @if (record.archived) {
          <div class="tuman-panel tuman-panel-tight tuman-archived-note">
            <div class="tuman-panel-title">Archived</div>
            <div class="tuman-panel-sub">
              @if (record.archivedByName) {
                By {{ record.archivedByName }} on {{ archivedAt }}
              } @else {
                On {{ archivedAt }}
              }
              @if (record.archiveReason) {
                <br />Reason: {{ record.archiveReason }}
              }
            </div>
          </div>
        }

        @if (record.updatedAt) {
          <div class="tuman-detail-updated">Last updated {{ updatedAt }}</div>
        }
      }
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          @if (canEdit) {
            <ion-button fill="outline" (click)="emit('edit')">
              <ion-icon slot="start" name="create-outline"></ion-icon>
              Edit
            </ion-button>
          }
          @if (canRequestCorrection) {
            <ion-button fill="outline" (click)="emit('request-correction')">
              <ion-icon slot="start" name="create-outline"></ion-icon>
              Request correction
            </ion-button>
          }
        </ion-buttons>

        <ion-buttons slot="end">
          @if (canRequestArchive) {
            <ion-button fill="outline" color="warning" (click)="emit('request-archive')">
              <ion-icon slot="start" name="archive-outline"></ion-icon>
              Request archive
            </ion-button>
          }
          @if (canArchiveDirect) {
            <ion-button fill="outline" color="warning" (click)="emit('archive-direct')">
              <ion-icon slot="start" name="archive-outline"></ion-icon>
              Archive
            </ion-button>
          }
          @if (canRevokeArchive) {
            <ion-button fill="outline" color="medium" (click)="emit('revoke-archive')">
              <ion-icon slot="start" name="refresh-outline"></ion-icon>
              Un-archive
            </ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class RecordDetailComponent {
  private readonly auth = inject(AuthService);
  private readonly modalCtrl = inject(ModalController);

  @Input({ required: true }) record!: AttendanceRecord;

  private dismissFn: ((result?: { role: string }) => void) | null = null;

  constructor() {
    addIcons({
      'archive-outline': archiveOutline,
      'create-outline': createOutline,
      'refresh-outline': refreshOutline,
      'trash-outline': trashOutline,
    });
  }

  setDismiss(fn: (result?: { role: string }) => void): void {
    this.dismissFn = fn;
  }

  close(): void {
    this.dismiss({ role: 'close' });
  }

  emit(action: RecordDetailAction): void {
    this.dismiss({ role: action });
  }

  /** Close the modal and tell the page what was asked for. */
  private dismiss(result: { role: string }): void {
    if (this.dismissFn) {
      this.dismissFn(result);
      return;
    }
    void this.modalCtrl.dismiss(result);
  }

  get timeIn(): string {
    return formatTime(this.record?.timeIn);
  }

  get timeOut(): string {
    return formatTime(this.record?.timeOut);
  }

  get archivedAt(): string {
    return formatDateTime(this.record?.archivedAt);
  }

  get updatedAt(): string {
    return formatDateTime(this.record?.updatedAt);
  }

  get sourceLabel(): (value?: string) => string {
    return sourceLabel;
  }

  /** Staff may edit records in their own department. */
  get canEdit(): boolean {
    const role = this.auth.role();
    if (!role || !this.record) {
      return false;
    }
    if (role === 'employee') {
      return false;
    }
    return this.record.department === this.auth.department();
  }

  /** Anyone may ask for a correction on a record they can see. */
  get canRequestCorrection(): boolean {
    return !!this.record && !this.record.archived;
  }

  /** Department Heads must ask HR before archiving. */
  get canRequestArchive(): boolean {
    const role = this.auth.role();
    return role === 'manager' && !!this.record && !this.record.archived;
  }

  /** HR Staff may archive directly inside their own department. */
  get canArchiveDirect(): boolean {
    const role = this.auth.role();
    return (
      role === 'hr' &&
      !!this.record &&
      !this.record.archived &&
      this.record.department === this.auth.department()
    );
  }

  /** HR Staff may lift an archive. */
  get canRevokeArchive(): boolean {
    return this.auth.role() === 'hr' && !!this.record?.archived;
  }
}
