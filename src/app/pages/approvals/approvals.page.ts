import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonIcon,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline } from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';
import { formatDateTime, friendlyDate } from '../../core/date.util';
import { FeedbackService } from '../../core/feedback.service';
import { RequestsService } from '../../core/requests.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header.component';

type Tab = 'archive' | 'correction';
type Filter = 'pending' | 'approved' | 'rejected' | 'all';

@Component({
  selector: 'app-approvals',
  standalone: true,
  imports: [
    IonButton,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    PageHeaderComponent,
  ],
  templateUrl: './approvals.page.html',
  styleUrl: './approvals.page.scss',
})
export class ApprovalsPage implements OnInit, OnDestroy {
  private readonly requests = inject(RequestsService);
  private readonly auth = inject(AuthService);
  private readonly feedback = inject(FeedbackService);

  readonly tab = signal<Tab>('archive');
  readonly filter = signal<Filter>('pending');
  readonly busyId = signal<string | null>(null);

  readonly archiveRequests = computed(() => this.requests.archiveRequests());
  readonly correctionRequests = computed(() => this.requests.correctionRequests());

  readonly visibleArchive = computed(() =>
    this.archiveRequests().filter((r) => this.filter() === 'all' || r.status === this.filter()),
  );

  readonly visibleCorrection = computed(() =>
    this.correctionRequests().filter((r) => this.filter() === 'all' || r.status === this.filter()),
  );

  readonly pendingCount = computed(
    () =>
      this.archiveRequests().filter((r) => r.status === 'pending').length +
      this.correctionRequests().filter((r) => r.status === 'pending').length,
  );

  constructor() {
    addIcons({ 'checkmark-outline': checkmarkOutline, 'close-outline': closeOutline });
  }

  ngOnInit(): void {
    this.requests.listenArchiveRequests('all');
    this.requests.listenCorrectionRequests('all');
  }

  ngOnDestroy(): void {
    this.requests.stop();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  friendlyDate(value: string): string {
    return friendlyDate(value);
  }

  formatDateTime(value: string | null | undefined): string {
    return formatDateTime(value);
  }

  async approveArchive(id: string): Promise<void> {
    const request = this.archiveRequests().find((r) => r.id === id);
    if (!request) {
      return;
    }
    const ok = await this.feedback.confirm(
      `Approve archiving ${request.employeeName}'s record for ${request.date}? The record will be archived immediately.`,
      'Approve archive request',
    );
    if (!ok) {
      return;
    }
    this.busyId.set(id);
    try {
      await this.requests.reviewArchiveRequest(request, true, 'Approved by HR Staff');
      await this.feedback.success('Archive request approved and applied.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not approve the request.');
    } finally {
      this.busyId.set(null);
    }
  }

  async rejectArchive(id: string): Promise<void> {
    const request = this.archiveRequests().find((r) => r.id === id);
    if (!request) {
      return;
    }
    const note = await this.feedback.prompt('Reject archive request', 'Reason (optional)');
    if (note === null) {
      return;
    }
    this.busyId.set(id);
    try {
      await this.requests.reviewArchiveRequest(request, false, note);
      await this.feedback.success('Archive request rejected.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not reject the request.');
    } finally {
      this.busyId.set(null);
    }
  }

  async approveCorrection(id: string): Promise<void> {
    const request = this.correctionRequests().find((r) => r.id === id);
    if (!request) {
      return;
    }
    const ok = await this.feedback.confirm(
      `Approve the correction for ${request.employeeName} on ${request.date}? The record will be updated immediately.`,
      'Approve correction',
    );
    if (!ok) {
      return;
    }
    this.busyId.set(id);
    try {
      await this.requests.reviewCorrectionRequest(request, true, 'Approved by HR Staff');
      await this.feedback.success('Correction approved and applied.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not approve the request.');
    } finally {
      this.busyId.set(null);
    }
  }

  async rejectCorrection(id: string): Promise<void> {
    const request = this.correctionRequests().find((r) => r.id === id);
    if (!request) {
      return;
    }
    const note = await this.feedback.prompt('Reject correction request', 'Reason (optional)');
    if (note === null) {
      return;
    }
    this.busyId.set(id);
    try {
      await this.requests.reviewCorrectionRequest(request, false, note);
      await this.feedback.success('Correction request rejected.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not reject the request.');
    } finally {
      this.busyId.set(null);
    }
  }
}
