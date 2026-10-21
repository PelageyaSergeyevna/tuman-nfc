/**
 * The routes of the phone app.
 *
 * The phone app is the scanner: it files check-ins for the people who may
 * scan. The attendance records, the correction requests and every screen that
 * changes data live in the web console, so a link to one of them ends on a
 * notice that points there. An employee has nothing to do in the app and is
 * sent to the staff notice.
 */
import { Routes } from '@angular/router';

import { authGuard, roleGuard } from '../core/guards';

export function surfaceRoutes(): Routes {
  return [
    {
      // Only HR Staff and Department Heads scan cards.
      path: 'scan',
      canActivate: [authGuard, roleGuard('hr', 'manager')],
      loadComponent: () => import('../pages/scan/scan.page').then((m) => m.ScanPage),
    },
    {
      path: 'staff-only',
      canActivate: [authGuard],
      loadComponent: () => import('../pages/staff-only/staff-only.page').then((m) => m.StaffOnlyPage),
    },
    {
      path: '**',
      loadComponent: () => import('../pages/web-only/web-only.page').then((m) => m.WebOnlyPage),
    },
  ];
}
