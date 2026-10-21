import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline } from 'ionicons/icons';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { formatDateTime, friendlyDate } from '../../core/date.util';
import { FeedbackService } from '../../core/feedback.service';
import { RequestsService } from '../../core/requests.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-corrections',
  standalone: true,
  imports: [
    RouterLink,
    IonButton,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    PageHeaderComponent,
  ],
  templateUrl: './corrections.page.html',
  styleUrl: './corrections.page.scss' })
export class CorrectionsPage implements OnInit, OnDestroy {
  private readonly requests = inject(RequestsService);
  readonly auth = inject(AuthService);
  private readonly feedback = inject(FeedbackService);

  readonly busyId = signal<string | null>(null);

  readonly correctionList = computed(() => this.requests.correctionRequests());

  readonly canReview = computed(() => {
    const role = this.auth.role();
    return role === 'hr' || role === 'manager';
  });

  constructor() {
    addIcons({
      'checkmark-outline': checkmarkOutline,
      'close-outline': closeOutline,
    });
  }

  ngOnInit(): void {
    const role = this.auth.role();
    this.requests.listenCorrectionRequests(
      role === 'hr' ? 'all' : role === 'manager' ? 'department' : 'own',
    );
  }

  ngOnDestroy(): void {
    this.requests.stop();
  }

  friendlyDate(value: string): string {
    return friendlyDate(value);
  }

  formatDateTime(value: string | null | undefined): string {
    return formatDateTime(value);
  }

  async approve(id: string): Promise<void> {
    const request = this.correctionList().find((r) => r.id === id);
    if (!request) {
      return;
    }
    const ok = await this.feedback.confirm(
      `Approve the correction for ${request.employeeName} on ${request.date}?`,
      'Approve correction',
    );
    if (!ok) {
      return;
    }
    this.busyId.set(id);
    try {
      await this.requests.reviewCorrectionRequest(request, true, 'Approved');
      await this.feedback.success('Correction approved and applied.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not approve the request.');
    } finally {
      this.busyId.set(null);
    }
  }

  async reject(id: string): Promise<void> {
    const request = this.correctionList().find((r) => r.id === id);
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
