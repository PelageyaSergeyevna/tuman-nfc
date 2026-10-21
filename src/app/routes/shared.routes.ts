/**
 * The routes both surfaces share: the sign-in, the profile and the landing
 * screen.
 *
 * The attendance records and the correction requests live in the web console
 * only, so they are part of the console route table.
 */
import { Routes } from '@angular/router';

import { authGuard, guestGuard, homeGuard, staffGuard } from '../core/guards';

export function sharedRoutes(): Routes {
  return [
    {
      path: 'login',
      canActivate: [guestGuard],
      loadComponent: () => import('../pages/login/login.page').then((m) => m.LoginPage),
    },
    {
      // The landing screen, decided by the role: the scanner for the people
      // who may scan, the staff notice for everybody else.
      path: 'home',
      canActivate: [homeGuard],
      children: [],
    },
    {
      path: 'profile',
      canActivate: [authGuard, staffGuard],
      loadComponent: () => import('../pages/profile/profile.page').then((m) => m.ProfilePage),
    },
    {
      path: '',
      canActivate: [homeGuard],
      children: [],
    },
  ];
}
