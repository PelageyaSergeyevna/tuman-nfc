/** Email / password sign-in, with one-tap template accounts for demos. */
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonSpinner,
  IonText,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logInOutline, warningOutline } from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';

interface DemoAccount {
  label: string;
  email: string;
  role: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonItem,
    IonSpinner,
    IonText,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  showPassword = false;

  readonly busy = signal(false);

  /** The same template accounts seeded from the legacy Tuman database. */
  readonly demoAccounts: DemoAccount[] = [
    { label: 'HR Staff', email: 'maria.reyes@tuman.local', role: 'Human Resources' },
    { label: 'Department Head', email: 'jose.cruz@tuman.local', role: 'IT' },
    { label: 'Employee', email: 'ana.ramos@tuman.local', role: 'IT' },
  ];

  constructor() {
    addIcons({ 'log-in-outline': logInOutline, 'warning-outline': warningOutline });

    // A restored session only reaches the profile after this page was opened,
    // so the route guard cannot catch it. Leave for the home screen as soon as
    // the user is known.
    effect(() => {
      if (this.auth.signedIn() && this.auth.profile()) {
        void this.router.navigateByUrl('/home');
      }
    });
  }

  fill(account: DemoAccount): void {
    this.email = account.email;
    this.password = 'Tuman123';
  }

  async submit(): Promise<void> {
    if (this.busy()) {
      return;
    }
    if (!this.email.trim() || !this.password) {
      this.auth.error.set('Enter your email address and password.');
      return;
    }
    this.busy.set(true);
    const cred = await this.auth.signIn(this.email, this.password);
    this.busy.set(false);
    if (cred) {
      // The home screen decides where to go: the scanner for the people who
      // may scan, the attendance records for everyone else.
      await this.router.navigateByUrl('/home');
    }
  }
}
