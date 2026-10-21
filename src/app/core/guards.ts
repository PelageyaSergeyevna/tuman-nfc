/**
 * Route guards.
 *
 * `authGuard`      — the user must be signed in *and* have an app profile.
 * `guestGuard`     — redirects a signed-in user away from the login page.
 * `homeGuard`      — sends the user to the screen that fits their role.
 * `staffGuard`     — keeps employees out of the phone app.
 * `roleGuard`      — factory guarding a route by role.
 */
import { Injector, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

import { AuthService } from './auth.service';
import { PermissionsService } from './permissions.service';
import { UserRole } from './models';
import { isPhoneApp } from './surface';

/**
 * Resolve once Firebase Auth has reported its initial state and the profile
 * of the signed-in user has arrived.
 *
 * The injector is passed in because the waiting happens after an `await`,
 * where the injection context is no longer available.
 */
export async function waitForAuth(auth: AuthService, injector: Injector): Promise<void> {
  if (!auth.ready()) {
    await firstValueFrom(
      toObservable(auth.ready, { injector }).pipe(filter((v) => v === true), take(1)),
    );
  }
  // The profile of the user arrives a moment after the sign-in state. Waiting
  // for it keeps the guards from bouncing a signed-in user to the login page.
  if (auth.signedIn() && !auth.profileReady()) {
    await firstValueFrom(
      toObservable(auth.profileReady, { injector }).pipe(filter((v) => v === true), take(1)),
    );
  }
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const injector = inject(Injector);

  await waitForAuth(auth, injector);

  if (!auth.signedIn()) {
    return router.createUrlTree(['/login']);
  }
  if (!auth.profile()) {
    // Signed in with Firebase Auth but no app profile — no access at all.
    return router.createUrlTree(['/login']);
  }
  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const injector = inject(Injector);

  await waitForAuth(auth, injector);

  if (auth.signedIn() && auth.profile()) {
    return router.createUrlTree(['/home']);
  }
  return true;
};

/**
 * The landing screen.
 *
 * In the web console it is the dashboard. In the phone app the scanner is the
 * first screen for the people who may scan; everybody else — an employee has
 * nothing to scan — starts at the staff notice.
 */
export const homeGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const permissions = inject(PermissionsService);
  const injector = inject(Injector);

  await waitForAuth(auth, injector);

  if (!auth.signedIn()) {
    return router.createUrlTree(['/login']);
  }
  if (isPhoneApp()) {
    const target = permissions.canScan(auth.role()) ? '/scan' : '/staff-only';
    return router.createUrlTree([target]);
  }
  return router.createUrlTree(['/dashboard']);
};

/**
 * The phone app is for the people who scan cards.
 *
 * An employee may use the web console, but not the app on the phone, so every
 * screen of the phone build sends them to the staff notice.
 */
export const staffGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const injector = inject(Injector);

  await waitForAuth(auth, injector);

  if (!auth.signedIn()) {
    return router.createUrlTree(['/login']);
  }
  if (isPhoneApp() && auth.role() === 'employee') {
    return router.createUrlTree(['/staff-only']);
  }
  return true;
};

/** Guard a route by role — `roleGuard('hr')`. */
export function roleGuard(...roles: UserRole[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const injector = inject(Injector);

    await waitForAuth(auth, injector);

    const role = auth.role();
    if (role && roles.includes(role)) {
      return true;
    }
    return router.createUrlTree(['/home']);
  };
}
