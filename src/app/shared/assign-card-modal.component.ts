/**
 * The "add card" popup of the scanner.
 *
 * A card that belongs to nobody was scanned. The popup only picks which
 * employee owns it; the scanner assigns the card and files the check-in, and
 * re-checks the card before it writes anything.
 */
import { Component, computed, inject, Input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline } from 'ionicons/icons';

import { AppUser } from '../core/models';

@Component({
  selector: 'app-assign-card-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Add card</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Skip</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-note class="ion-padding-start ion-padding-end">
        Card {{ uid }} does not belong to anyone yet. Pick the employee it
        belongs to — the check-in is filed right away.
      </ion-note>

      <ion-input
        label="Search"
        labelPlacement="stacked"
        type="search"
        placeholder="Name or employee number"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
        name="query"
      ></ion-input>

      <ion-list lines="full">
        @for (employee of filtered(); track employee.uid) {
          <ion-item
            button
            [detail]="selected() === employee.employeeId"
            (click)="select(employee)"
          >
            <ion-label>
              <h3>{{ employee.displayName }}</h3>
              <p>{{ employee.employeeId }} · {{ employee.department }}</p>
            </ion-label>
          </ion-item>
        } @empty {
          <ion-item>
            <ion-label class="ion-text-wrap">
              <p>No employee of {{ department }} matches “{{ query() }}”.</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button
          expand="block"
          class="tuman-btn"
          [disabled]="!selected()"
          (click)="submit()"
        >
          <ion-icon slot="start" name="card-outline"></ion-icon>
          Add card and file check-in
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class AssignCardModalComponent {
  private readonly modalCtrl = inject(ModalController);

  /** The UID of the card that was scanned. */
  @Input({ required: true }) uid = '';

  /** The employees the card may be assigned to. */
  @Input({ required: true }) employees: AppUser[] = [];

  /** The department the card is assigned in. */
  @Input({ required: true }) department = '';

  /** The search text of the employee list. */
  readonly query = signal('');

  /** The employee picked in the list. */
  readonly selected = signal('');

  /** The employees matching the search, in the order they were given. */
  readonly filtered = computed(() => {
    const needle = this.query().trim().toLowerCase();
    const list = this.employees.filter((employee) => employee.isActive !== false);
    if (!needle) {
      return list;
    }
    return list.filter(
      (employee) =>
        employee.displayName.toLowerCase().includes(needle) ||
        employee.employeeId.toLowerCase().includes(needle),
    );
  });

  private dismissFn: ((result?: unknown) => void) | null = null;

  constructor() {
    addIcons({ 'card-outline': cardOutline });
  }

  setDismiss(fn: (result?: unknown) => void): void {
    this.dismissFn = fn;
  }

  select(employee: AppUser): void {
    this.selected.set(employee.employeeId);
  }

  dismiss(): void {
    if (this.dismissFn) {
      this.dismissFn(undefined);
      return;
    }
    void this.modalCtrl.dismiss();
  }

  submit(): void {
    const employeeId = this.selected();
    if (!employeeId) {
      return;
    }
    if (this.dismissFn) {
      this.dismissFn({ employeeId });
      return;
    }
    void this.modalCtrl.dismiss({ employeeId });
  }
}
