/**
 * The NFC scanner — the phone app's home screen.
 *
 * A scan identifies the card's employee and files the day's check-in, or
 * offers to assign a card that belongs to nobody yet.
 */
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonIcon,
} from '@ionic/angular';
import { ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cardOutline,
  checkmarkCircleOutline,
  globeOutline,
  wifiOutline,
  stopCircleOutline,
  warningOutline,
} from 'ionicons/icons';

import { AttendanceService } from '../../core/attendance.service';
import { AuthService } from '../../core/auth.service';
import { formatTime, todayKey } from '../../core/date.util';
import { FeedbackService } from '../../core/feedback.service';
import { NfcService, ScannedTag } from '../../core/nfc.service';
import { CardsService } from '../../core/cards.service';
import { evaluateCheckIn } from '../../core/shift.logic';
import { ShiftService } from '../../core/shift.service';
import { UsersService } from '../../core/users.service';
import { WEB_APP_URL } from '../../core/surface';
import { AttendanceStatus } from '../../core/models';
import { AssignCardModalComponent } from '../../shared/assign-card-modal.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

type ScanState = 'idle' | 'success' | 'error' | 'unassigned';

/** The person a check-in is filed for. */
interface CheckInPerson {
  employeeId: string;
  displayName: string;
  department: string;
}

@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [
    IonButton,
    IonContent,
    IonIcon,
    PageHeaderComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './scan.page.html',
  styleUrl: './scan.page.scss',
})
export class ScanPage implements OnInit, OnDestroy {
  private readonly nfc = inject(NfcService);
  private readonly cards = inject(CardsService);
  private readonly attendance = inject(AttendanceService);
  private readonly users = inject(UsersService);
  private readonly shifts = inject(ShiftService);
  private readonly feedback = inject(FeedbackService);
  private readonly modal = inject(ModalController);
  readonly auth = inject(AuthService);

  readonly state = signal<ScanState>('idle');
  readonly message = signal('');
  readonly scanned = signal<ScannedTag | null>(null);

  /** True while the NFC reader is armed. */
  readonly readerActive = signal(false);
  readonly employeeName = signal('');
  readonly employeeId = signal('');
  readonly status = signal<AttendanceStatus | null>(null);
  readonly timeIn = signal('');
  readonly lateMinutes = signal(0);
  readonly supported = signal<boolean | null>(null);
  readonly enabled = signal<boolean | null>(null);

  private unsubscribeTag?: () => void;

  readonly employees = computed(() =>
    this.users.users().filter((u) => u.isActive !== false),
  );

  readonly today = todayKey();

  /** Where the console lives. */
  readonly webAppUrl = WEB_APP_URL;

  constructor() {
    addIcons({
      'card-outline': cardOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'globe-outline': globeOutline,
      'wifi-outline': wifiOutline,
      'stop-circle-outline': stopCircleOutline,
      'warning-outline': warningOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.cards.listen('staff');
    this.users.listen('department');
    this.unsubscribeTag = this.nfc.subscribe((tag) => void this.handleTag(tag));
    await this.refreshSupport();
    await this.armReader();

    // A card that opened the app was scanned before this page existed.
    const pending = this.nfc.takePendingTag();
    if (pending) {
      await this.handleTag(pending);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeTag?.();
    // The reader stays armed: it belongs to the signed in user, not to this
    // page, so a card can be tapped from any screen.
    this.cards.stop();
    this.users.stop();
  }

  /** Arm the reader. It is usually already armed by the app shell. */
  private async armReader(): Promise<void> {
    try {
      await this.nfc.startScanning();
      this.readerActive.set(true);
    } catch (err) {
      this.readerActive.set(false);
      this.state.set('error');
      this.message.set(err instanceof Error ? err.message : 'Could not start the scanner.');
      await this.refreshSupport();
    }
  }

  async refreshSupport(): Promise<void> {
    if (!this.nfc.isNative) {
      this.supported.set(false);
      this.enabled.set(false);
      return;
    }
    this.supported.set(await this.nfc.isSupported());
    this.enabled.set(await this.nfc.isEnabled());
  }

  async openSettings(): Promise<void> {
    await this.nfc.openSettings();
  }

  async toggleScanning(): Promise<void> {
    if (this.readerActive()) {
      await this.nfc.stopScanning();
      this.readerActive.set(false);
      this.state.set('idle');
      this.message.set('The scanner is stopped. Start it to read cards again.');
      return;
    }
    await this.armReader();
    if (this.readerActive()) {
      this.state.set('idle');
      this.message.set('Hold the employee card against the back of the phone.');
    }
  }

  /** Handle a scanned card: identify the employee and file the check-in. */
  private async handleTag(tag: ScannedTag): Promise<void> {
    this.nfc.takePendingTag();
    this.scanned.set(tag);
    this.state.set('idle');

    const card = this.cards.findByUid(tag.uid);
    if (!card) {
      // A card nobody owns: offer to assign it, then file the check-in.
      await this.offerAssign(tag);
      return;
    }
    if (!card.isActive) {
      this.state.set('unassigned');
      this.message.set(
        `Card ${tag.uid} is assigned to ${card.employeeName} but has been deactivated.`,
      );
      return;
    }

    const employee = this.users.findByEmployeeId(card.employeeId);
    await this.fileCheckIn(
      {
        employeeId: card.employeeId,
        displayName: employee?.displayName ?? card.employeeName,
        department: employee?.department ?? card.department,
      },
      new Date(),
    );
  }

  /**
   * File a check-in: the shift of the day decides on-time vs late, and an
   * existing time-in is confirmed before it is overwritten. Returns the message.
   */
  private async fileCheckIn(person: CheckInPerson, now: Date): Promise<string> {
    const shift = this.shifts.activeShift(now);
    const evaluation = evaluateCheckIn(now, shift);

    const existing = this.attendance.records().find(
      (r) => r.employeeId === person.employeeId && r.date === this.today,
    );

    if (existing?.timeIn) {
      const ok = await this.feedback.confirm(
        `${person.displayName} already checked in at ${formatTime(existing.timeIn)}. Overwrite with the new time?`,
        'Already checked in',
      );
      if (!ok) {
        this.employeeName.set(person.displayName);
        this.employeeId.set(person.employeeId);
        this.status.set(existing.status);
        this.timeIn.set(formatTime(existing.timeIn));
        this.lateMinutes.set(existing.lateMinutes);
        this.state.set('success');
        this.message.set('');
        return '';
      }
    }

    try {
      await this.attendance.save({
        employeeId: person.employeeId,
        employeeName: person.displayName,
        department: person.department,
        date: this.today,
        status: evaluation.status,
        timeIn: now.toISOString(),
        timeOut: existing?.timeOut ?? null,
        lateMinutes: evaluation.lateMinutes,
        notes: existing?.notes ?? '',
        source: 'nfc',
        shiftId: shift.id,
        shiftName: shift.shiftName,
      });

      this.employeeName.set(person.displayName);
      this.employeeId.set(person.employeeId);
      this.status.set(evaluation.status);
      this.timeIn.set(formatTime(now.toISOString()));
      this.lateMinutes.set(evaluation.lateMinutes);
      this.state.set('success');
      const message =
        evaluation.status === 'late'
          ? `Checked in late by ${evaluation.lateMinutes} minutes.`
          : 'Checked in on time.';
      this.message.set(message);
      return message;
    } catch (err) {
      this.state.set('error');
      const message =
        err instanceof Error ? err.message : 'Could not file the attendance record.';
      this.message.set(message);
      return message;
    }
  }

  /** Re-open the assign popup for the card that was just scanned. */
  async addCard(): Promise<void> {
    const tag = this.scanned();
    if (!tag) {
      return;
    }
    await this.offerAssign(tag);
  }

  /** Ask which employee an unassigned card belongs to, then check that person in. */
  private async offerAssign(tag: ScannedTag): Promise<void> {
    const employees = this.employees();
    if (employees.length === 0) {
      this.state.set('unassigned');
      this.message.set(`Card ${tag.uid} is not assigned to anyone yet.`);
      return;
    }

    const modal = await this.modal.create({
      component: AssignCardModalComponent,
      componentProps: {
        uid: tag.uid,
        employees,
        department: this.auth.department() ?? '',
      },
    });
    await modal.present();

    const result = await modal.onWillDismiss();
    const employeeId = (result.data as { employeeId?: string } | undefined)?.employeeId;
    if (!employeeId) {
      this.state.set('unassigned');
      this.message.set(`Card ${tag.uid} was not assigned.`);
      return;
    }
    await this.assignAndCheckIn(tag.uid, employeeId);
  }

  /**
   * Assign a card and file its check-in. The card is re-checked first: it may
   * have been assigned elsewhere while the popup was open.
   */
  private async assignAndCheckIn(uid: string, employeeId: string): Promise<void> {
    const employee = this.users.findByEmployeeId(employeeId);
    if (!employee) {
      await this.feedback.error('That employee is not in your department.');
      this.state.set('unassigned');
      return;
    }

    const card = this.cards.findByUid(uid);
    if (card) {
      this.state.set('unassigned');
      this.message.set(`Card ${uid} already belongs to ${card.employeeName}.`);
      await this.feedback.error(`Card ${uid} was assigned to ${card.employeeName} in the meantime.`);
      return;
    }

    try {
      await this.cards.assign({
        uid,
        employeeId: employee.employeeId,
        employeeName: employee.displayName,
        department: employee.department,
      });
      const detail = await this.fileCheckIn(
        {
          employeeId: employee.employeeId,
          displayName: employee.displayName,
          department: employee.department,
        },
        new Date(),
      );
      this.message.set(`Card ${uid} added for ${employee.displayName}. ${detail}`.trim());
    } catch (err) {
      this.state.set('error');
      this.message.set(err instanceof Error ? err.message : 'Could not assign the card.');
    }
  }

  reset(): void {
    this.state.set('idle');
    this.message.set('');
    this.scanned.set(null);
  }
}
