import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowForwardOutline,
  calendarOutline,
  createOutline,
  shieldCheckmarkOutline,
  timeOutline,
} from 'ionicons/icons';

import { AttendanceService, RecordScope } from '../../core/attendance.service';
import { AuthService } from '../../core/auth.service';
import { formatTime, friendlyDate, sourceLabel, todayKey } from '../../core/date.util';
import { NotificationsService } from '../../core/notifications.service';
import { RequestsService } from '../../core/requests.service';
import { ROLE_LABELS } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    IonBadge,
    IonButton,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonSpinner,
    PageHeaderComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly attendance = inject(AttendanceService);
  private readonly requests = inject(RequestsService);
  private readonly notifications = inject(NotificationsService);

  readonly today = todayKey();
  readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good morning';
    }
    if (hour < 18) {
      return 'Good afternoon';
    }
    return 'Good evening';
  });

  readonly pendingArchiveApprovals = computed(
    () => this.requests.archiveRequests().filter((r) => r.status === 'pending').length,
  );

  readonly pendingCorrections = computed(
    () => this.requests.correctionRequests().filter((r) => r.status === 'pending').length,
  );

  readonly recentRecords = computed(() => this.attendance.filteredRecords().slice(0, 8));

  readonly loading = computed(() => this.attendance.loading());

  constructor() {
    addIcons({
      'arrow-forward-outline': arrowForwardOutline,
      'calendar-outline': calendarOutline,
      'create-outline': createOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'time-outline': timeOutline,
    });
  }

  ngOnInit(): void {
    const role = this.auth.role();
    const scope: RecordScope =
      role === 'hr' ? 'all' : role === 'manager' ? 'department' : 'own';

    this.attendance.includeArchived.set(false);
    this.attendance.statusFilter.set('all');
    this.attendance.listen({
      scope,
      department: this.auth.department(),
      employeeId: this.auth.employeeId(),
      dateFrom: this.today,
      dateTo: this.today,
    });

    if (role === 'hr') {
      this.requests.listenArchiveRequests('all');
      this.requests.listenCorrectionRequests('all');
    } else if (role === 'manager') {
      this.requests.listenCorrectionRequests('department');
    } else {
      this.requests.listenCorrectionRequests('own');
    }

    this.notifications.listen();
  }

  ngOnDestroy(): void {
    this.attendance.stop();
    this.requests.stop();
    this.notifications.stop();
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
}
