/**
 * Modal used to file a correction request.
 *
 * Employees use it to ask for their own record to be corrected; staff can
 * file on behalf of their department. The request is reviewed by the
 * Department Head of that department (or HR Staff).
 */
import { Component, inject, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
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

import { isoFromTime, timeFromIso } from '../../core/date.util';
import { AttendanceRecord, AttendanceStatus, STATUS_LABELS } from '../../core/models';

@Component({
  selector: 'app-correction-request',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
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
        <ion-title>Request a correction</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-note class="ion-padding-start ion-padding-end">
        {{ record.employeeName }} · {{ record.date }} — your request is reviewed by the
        Department Head of {{ record.department }}.
      </ion-note>

      <ion-list lines="full">
        <ion-item>
          <ion-select
            label="Corrected status"
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
            label="Corrected time in"
            labelPlacement="stacked"
            type="time"
            [(ngModel)]="timeIn"
            name="timeIn"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            label="Corrected time out"
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
            rows="2"
            [(ngModel)]="notes"
            name="notes"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            label="Reason for the correction"
            labelPlacement="stacked"
            type="textarea"
            rows="3"
            placeholder="Explain what went wrong"
            [(ngModel)]="reason"
            name="reason"
          ></ion-input>
        </ion-item>
      </ion-list>

      @if (error) {
        <ion-note color="danger" class="ion-padding">{{ error }}</ion-note>
      }
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button expand="block" class="tuman-btn" (click)="submit()">Submit request</ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class CorrectionRequestComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);

  @Input({ required: true }) record!: AttendanceRecord;

  error = '';

  status: AttendanceStatus = 'present';
  timeIn = '';
  timeOut = '';
  lateMinutes = 0;
  notes = '';
  reason = '';

  readonly statusOptions: AttendanceStatus[] = [
    'present',
    'late',
    'absent',
    'on_leave',
    'excused',
  ];

  readonly statusLabels = STATUS_LABELS;

  private dismissFn: ((result?: unknown) => void) | null = null;

  ngOnInit(): void {
    this.status = this.record.status;
    this.timeIn = timeFromIso(this.record.timeIn);
    this.timeOut = timeFromIso(this.record.timeOut);
    this.lateMinutes = this.record.lateMinutes ?? 0;
    this.notes = this.record.notes ?? '';
  }

  setDismiss(fn: (result?: unknown) => void): void {
    this.dismissFn = fn;
  }

  dismiss(): void {
    if (this.dismissFn) {
      this.dismissFn(undefined);
      return;
    }
    void this.modalCtrl.dismiss();
  }

  /** The proposed values, ready to be stored on the request. */
  get proposed(): {
    status: AttendanceStatus;
    timeIn: string | null;
    timeOut: string | null;
    lateMinutes: number;
    notes: string;
  } {
    return {
      status: this.status,
      timeIn: isoFromTime(this.record.date, this.timeIn),
      timeOut: isoFromTime(this.record.date, this.timeOut),
      lateMinutes: Number(this.lateMinutes) || 0,
      notes: this.notes,
    };
  }

  submit(): void {
    this.error = '';
    if (!this.reason.trim()) {
      this.error = 'Please give a reason for the correction.';
      return;
    }
    const result = { proposed: this.proposed, reason: this.reason.trim() };
    if (this.dismissFn) {
      this.dismissFn(result);
      return;
    }
    void this.modalCtrl.dismiss(result);
  }
}
