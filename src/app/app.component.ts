/**
 * The app shell: the sidebar (built from the role's menu) and the surface's
 * route outlet, plus the NFC reader lifecycle and the pending-update check.
 */
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonBadge,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,
  IonRouterOutlet,
  IonSplitPane,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  peopleOutline,
  gridOutline,
  timeOutline,
  scanOutline,
  cardOutline,
  notificationsOutline,
  createOutline,
  personCircleOutline,
  settingsOutline,
  logOutOutline,
  shieldCheckmarkOutline,
  globeOutline,
} from 'ionicons/icons';

import { AppUpdateService } from './core/app-update.service';
import { AuthService } from './core/auth.service';
import { FeedbackService } from './core/feedback.service';
import { NfcService } from './core/nfc.service';
import { NotificationsService } from './core/notifications.service';
import { PermissionsService } from './core/permissions.service';
import { ROLE_LABELS } from './core/models';
import { WEB_APP_URL, isPhoneApp } from './core/surface';

interface MenuItem {
  path: string;
  label: string;
  icon: string;
  badge?: () => number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonBadge,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonMenu,
    IonRouterOutlet,
    IonSplitPane,
    IonToolbar,
  ],
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionsService);
  readonly notifications = inject(NotificationsService);
  private readonly nfc = inject(NfcService);
  private readonly appUpdate = inject(AppUpdateService);
  private readonly feedback = inject(FeedbackService);
  private readonly router = inject(Router);

  readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });

  /**
   * The sidebar belongs to a signed-in user. While nobody is signed in — the
   * sign-in screen and the brief moment the profile is still loading — the
   * shell is skipped so the login page is not framed by an empty menu.
   */
  readonly showShell = computed(() => this.auth.role() !== null);

  /** Where the full console lives — the phone app points people there. */
  readonly webAppUrl = WEB_APP_URL;

  /** True in the phone app. */
  readonly isPhone = isPhoneApp();

  readonly menuItems = computed<MenuItem[]>(() => {
    const role = this.auth.role();
    if (!role) {
      return [];
    }

    if (isPhoneApp()) {
      // The phone app is the scanner: it files check-ins. The records, the
      // correction requests and everything that changes data are done in the
      // web console.
      const items: MenuItem[] = [];
      if (this.permissions.canScan(role)) {
        items.push({ path: '/scan', label: 'NFC Scanner', icon: 'scan-outline' });
        items.push({ path: '/profile', label: 'My Profile', icon: 'person-circle-outline' });
      }
      return items;
    }

    const items: MenuItem[] = [
      { path: '/dashboard', label: 'Dashboard', icon: 'grid-outline' },
      { path: '/records', label: 'Attendance Records', icon: 'time-outline' },
      {
        path: '/corrections',
        label: 'Correction Requests',
        icon: 'create-outline',
      },
    ];

    if (this.permissions.can(role, 'review:archive')) {
      items.push({
        path: '/approvals',
        label: 'Approvals',
        icon: 'shield-checkmark-outline',
        badge: () => this.notifications.unreadCount(),
      });
    }

    // No scanner entry: a browser cannot read NFC cards, so the scanner lives
    // in the phone app only.

    if (this.permissions.can(role, 'manage:cards')) {
      items.push({ path: '/cards', label: 'NFC Cards', icon: 'card-outline' });
    }

    if (role === 'hr' || role === 'manager') {
      items.push({ path: '/directory', label: 'Employee Directory', icon: 'people-outline' });
    }

    if (this.permissions.can(role, 'manage:shifts')) {
      items.push({ path: '/shifts', label: 'Shift Schedules', icon: 'settings-outline' });
    }

    items.push({ path: '/profile', label: 'My Profile', icon: 'person-circle-outline' });
    return items;
  });

  readonly showMenu = signal(true);

  /** Leave the account. The button lives in the sidebar. */
  async signOut(): Promise<void> {
    const ok = await this.feedback.confirm('Sign out of TUMAN?', 'Sign out');
    if (!ok) {
      return;
    }
    await this.auth.signOut();
  }

  constructor() {
    addIcons({
      'grid-outline': gridOutline,
      'time-outline': timeOutline,
      'scan-outline': scanOutline,
      'card-outline': cardOutline,
      'notifications-outline': notificationsOutline,
      'create-outline': createOutline,
      'people-outline': peopleOutline,
      'settings-outline': settingsOutline,
      'log-out-outline': logOutOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'globe-outline': globeOutline,
    });

    // Pick up a new app version before anything else happens.
    void this.appUpdate.applyPendingUpdate();

    // Keep the reader armed for as long as a user who may use the scanner is
    // signed in, so a card can be tapped from any screen. Only the phone app
    // can read these cards — a browser cannot.
    effect(() => {
      const role = this.auth.role();
      if (!role || !isPhoneApp()) {
        void this.nfc.stopScanning();
        return;
      }
      if (!this.permissions.canScan(role)) {
        void this.nfc.stopScanning();
        return;
      }
      void this.nfc.startScanning().catch(() => undefined);
    });

    // A card that was tapped outside the scanner opens it, so the punch can be
    // filed straight away. The scanner picks the card up on entry.
    this.nfc.subscribe(() => {
      const role = this.auth.role();
      if (!role || !this.permissions.canScan(role)) {
        return;
      }
      if (this.router.url.startsWith('/scan')) {
        return;
      }
      void this.router.navigateByUrl('/scan');
    });

    // The route guards only run on navigation, so signing out would otherwise
    // leave the user on whatever screen they were on. Watch the session and
    // return to the sign-in screen as soon as it ends — on every surface, and
    // whether the sign-out came from the button or the session expired.
    effect(() => {
      const signedIn = this.auth.signedIn();
      if (signedIn || this.router.url.startsWith('/login')) {
        return;
      }
      void this.router.navigateByUrl('/login', { replaceUrl: true });
    });
  }
}
