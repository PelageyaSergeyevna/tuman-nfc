/** Console screen for assigning, releasing and toggling NFC cards. */
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonIcon,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline, trashOutline } from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';
import { CardsService } from '../../core/cards.service';
import { FeedbackService } from '../../core/feedback.service';
import { UsersService } from '../../core/users.service';
import { describeUid, formatUid, isValidUid, normalizeUid, UID_FORMAT_HINT } from '../../core/uid';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';

@Component({
  selector: 'app-cards',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    PageHeaderComponent,
  ],
  templateUrl: './cards.page.html',
  styleUrl: './cards.page.scss',
})
export class CardsPage implements OnInit, OnDestroy {
  private readonly cardsService = inject(CardsService);
  private readonly users = inject(UsersService);
  private readonly feedback = inject(FeedbackService);
  private readonly modal = inject(ModalController);
  readonly auth = inject(AuthService);

  readonly cards = computed(() => this.cardsService.cards());

  readonly isStaff = computed(() => {
    const role = this.auth.role();
    return role === 'hr' || role === 'manager';
  });

  newUid = '';
  assignTo = '';

  /** The UID as it will be stored, e.g. `52C28EDE`. */
  readonly normalizedUid = (): string => normalizeUid(this.newUid);

  /** True when the typed UID can be stored. */
  readonly uidValid = (): boolean => isValidUid(this.newUid);

  /** A preview of the stored UID, e.g. `52C28EDE · 4 bytes`. */
  readonly uidPreview = (): string => describeUid(this.newUid);

  /** The UID in colon separated form, for display only. */
  readonly formatUid = (raw: string): string => formatUid(raw);

  constructor() {
    addIcons({ 'card-outline': cardOutline, 'trash-outline': trashOutline });
  }

  ngOnInit(): void {
    this.cardsService.listen(this.isStaff() ? 'staff' : 'own');
    if (this.isStaff()) {
      this.users.listen('department');
    }
  }

  ngOnDestroy(): void {
    this.cardsService.stop();
    this.users.stop();
  }

  readonly employees = computed(() => this.users.users().filter((u) => u.isActive !== false));

  async assign(): Promise<void> {
    const uid = this.normalizedUid();
    if (!this.uidValid()) {
      await this.feedback.error(UID_FORMAT_HINT);
      return;
    }
    if (!this.assignTo) {
      await this.feedback.error('Choose an employee.');
      return;
    }
    const employee = this.users.findByEmployeeId(this.assignTo);
    if (!employee) {
      await this.feedback.error('That employee is not in your department.');
      return;
    }
    if (this.cardsService.findByUid(uid)) {
      await this.feedback.error(`Card ${uid} is already assigned.`);
      return;
    }
    try {
      await this.cardsService.assign({
        uid,
        employeeId: employee.employeeId,
        employeeName: employee.displayName,
        department: employee.department,
      });
      await this.feedback.success(`Card ${uid} assigned to ${employee.displayName}.`);
      this.newUid = '';
      this.assignTo = '';
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not assign the card.');
    }
  }

  async release(uid: string, employeeName: string): Promise<void> {
    const ok = await this.feedback.confirm(
      `Release the card assigned to ${employeeName}?`,
      'Release card',
    );
    if (!ok) {
      return;
    }
    try {
      await this.cardsService.unassign(uid);
      await this.feedback.success('Card released.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not release the card.');
    }
  }

  async toggleActive(uid: string, isActive: boolean): Promise<void> {
    try {
      await this.cardsService.setActive(uid, !isActive);
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not update the card.');
    }
  }
}
