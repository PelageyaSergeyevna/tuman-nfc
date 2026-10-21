/**
 * The routes of the web console.
 *
 * The console holds every screen that changes data: the dashboard, the
 * approvals, the cards, the shifts, the people directory, the attendance
 * records and the correction requests. The phone build replaces this file
 * (see `angular.json`), so these screens are not even part of the phone app.
 */
import { Routes } from '@angular/router';

import { authGuard, homeGuard, roleGuard } from '../core/guards';

export function surfaceRoutes(): Routes {
  return [
    {
      path: 'dashboard',
      canActivate: [authGuard],
      loadComponent: () => import('../pages/dashboard/dashboard.page').then((m) => m.DashboardPage),
    },
    {
      path: 'records',
      canActivate: [authGuard],
      loadComponent: () => import('../pages/records/records.page').then((m) => m.RecordsPage),
    },
    {
      path: 'corrections',
      canActivate: [authGuard],
      loadComponent: () => import('../pages/corrections/corrections.page').then((m) => m.CorrectionsPage),
    },
    {
      path: 'approvals',
      canActivate: [authGuard, roleGuard('hr')],
      loadComponent: () => import('../pages/approvals/approvals.page').then((m) => m.ApprovalsPage),
    },
    {
      path: 'cards',
      canActivate: [authGuard],
      loadComponent: () => import('../pages/cards/cards.page').then((m) => m.CardsPage),
    },
    {
      path: 'scan',
      canActivate: [authGuard],
      loadComponent: () => import('../pages/scan/scan.page').then((m) => m.ScanPage),
    },
    {
      path: 'directory',
      canActivate: [authGuard],
      loadComponent: () => import('../pages/directory/directory.page').then((m) => m.DirectoryPage),
    },
    {
      path: 'shifts',
      canActivate: [authGuard, roleGuard('hr')],
      loadComponent: () => import('../pages/shifts/shifts.page').then((m) => m.ShiftsPage),
    },
    {
      path: '**',
      redirectTo: 'home',
    },
  ];
}
