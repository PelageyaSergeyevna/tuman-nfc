/**
 * Modal used to create or edit an attendance record.
 *
 * Staff only — the Firestore rules reject writes from anybody else.
 */
import { Component, inject, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';

import { AttendanceService } from '../../core/attendance.service';
import { isoFromTime, timeFromIso, todayKey } from '../../core/date.util';
import {
  AttendanceRecordSource,
  AttendanceStatus,
  AppUser,
  STATUS_LABELS,
} from '../../core/models';

@Component({
  selector: 'app-record-editor',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ isNew ? 'Add attendance record' : 'Edit attendance record' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-list lines="full">
        @if (isNew) {
          <ion-item>
            <ion-select
              label="Employee"
              labelPlacement="stacked"
              interface="popover"
              [(ngModel)]="employeeId"
              name="employeeId"
            >
              @for (employee of employees; track employee.uid) {
                <ion-select-option [value]="employee.employeeId">
                  {{ employee.displayName }} ({{ employee.employeeId }})
                </ion-select-option>
              }
            </ion-select>
          </ion-item>
        }

        <ion-item>
          <ion-input
            label="Date"
            labelPlacement="stacked"
            type="date"
            [(ngModel)]="date"
            name="date"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-select
            label="Status"
            labelPlacement="stacked"
            interface="popover"
            [(ngModel)]="status"
            name="status"
          >
            @for (option of statusOptions; track option) {
              <ion-select-option [value]="option">{{ statusLabels[option] }}</ion-select-option>
            }
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-input
            label="Time in"
            labelPlacement="stacked"
            type="time"
            [(ngModel)]="timeIn"
            name="timeIn"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            label="Time out"
            labelPlacement="stacked"
            type="time"
            [(ngModel)]="timeOut"
            name="timeOut"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            label="Late minutes"
            labelPlacement="stacked"
            type="number"
            min="0"
            [(ngModel)]="lateMinutes"
            name="lateMinutes"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            label="Notes"
            labelPlacement="stacked"
            type="textarea"
            rows="3"
            [(ngModel)]="notes"
            name="notes"
          ></ion-input>
        </ion-item>
      </ion-list>

      @if (error) {
        <ion-note color="danger" class="ion-padding">{{ error }}</ion-note>
      }

      <ion-button expand="block" class="tuman-btn" (click)="save()">Save record</ion-button>
    </ion-content>
  `,
})
export class RecordEditorComponent implements OnInit {
  private readonly attendance = inject(AttendanceService);
  private readonly modalCtrl = inject(ModalController);

  /** The record being edited; null creates a new one. */
  @Input() record: AttendanceRecordLike | null = null;

  /** Employees the caller may file records for (own department). */
  @Input() employees: AppUser[] = [];

  error = '';

  employeeId = '';
  date = todayKey();
  status: AttendanceStatus = 'present';
  timeIn = '';
  timeOut = '';
  lateMinutes = 0;
  notes = '';

  readonly statusOptions: AttendanceStatus[] = [
    'present',
    'late',
    'absent',
    'on_leave',
    'excused',
  ];

  readonly statusLabels = STATUS_LABELS;

  private dismissFn: ((result?: { saved: boolean }) => void) | null = null;

  get isNew(): boolean {
    return !this.record;
  }

  ngOnInit(): void {
    if (this.record) {
      this.employeeId = this.record.employeeId;
      this.date = this.record.date;
      this.status = this.record.status;
      this.timeIn = timeFromIso(this.record.timeIn);
      this.timeOut = timeFromIso(this.record.timeOut);
      this.lateMinutes = this.record.lateMinutes ?? 0;
      this.notes = this.record.notes ?? '';
    } else if (this.employees.length === 1) {
      this.employeeId = this.employees[0].employeeId;
    }
  }

  setDismiss(fn: (result?: { saved: boolean }) => void): void {
    this.dismissFn = fn;
  }

  dismiss(): void {
    this.dismissResult(undefined);
  }

  /** Close the modal and tell the page that the record was saved. */
  private dismissResult(result?: { saved: boolean }): void {
    if (this.dismissFn) {
      this.dismissFn(result);
      return;
    }
    void this.modalCtrl.dismiss(result);
  }

  async save(): Promise<void> {
    this.error = '';
    if (!this.employeeId) {
      this.error = 'Choose an employee.';
      return;
    }
    if (!this.date) {
      this.error = 'Choose a date.';
      return;
    }

    const employee =
      this.employees.find((e) => e.employeeId === this.employeeId) ??
      (this.record
        ? {
            employeeId: this.record.employeeId,
            displayName: this.record.employeeName,
            department: this.record.department,
          }
        : undefined);

    try {
      await this.attendance.save({
        employeeId: this.employeeId,
        employeeName: employee?.displayName ?? this.record?.employeeName ?? '',
        department: employee?.department ?? this.record?.department ?? '',
        date: this.date,
        status: this.status,
        timeIn: isoFromTime(this.date, this.timeIn),
        timeOut: isoFromTime(this.date, this.timeOut),
        lateMinutes: Number(this.lateMinutes) || 0,
        notes: this.notes,
        source: this.record?.source ?? 'manual',
      });
      this.dismissResult({ saved: true });
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Could not save the record.';
    }
  }
}

/** The subset of an attendance record the editor needs. */
export interface AttendanceRecordLike {
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  status: AttendanceStatus;
  timeIn: string | null;
  timeOut: string | null;
  lateMinutes: number;
  notes?: string;
  source?: AttendanceRecordSource;
}
