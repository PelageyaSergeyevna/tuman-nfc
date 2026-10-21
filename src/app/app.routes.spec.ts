import { describe, expect, it } from 'vitest';

import { sharedRoutes } from './routes/shared.routes';
import { surfaceRoutes as consoleRoutes } from './routes/surface.routes';
import { surfaceRoutes as phoneRoutes } from './routes/surface.routes.phone';

/** The paths a route table serves, without the wildcard. */
function paths(routes: ReturnType<typeof sharedRoutes>): string[] {
  return routes
    .map((route) => route.path)
    .filter((path): path is string => path !== undefined && path !== '**');
}

/** Every path of the list is served. */
function expectServed(served: string[], wanted: string[]): void {
  for (const path of wanted) {
    expect(served, `path ${path}`).toContain(path);
  }
}

describe('the route tables', () => {
  it('serves the sign-in, the home screen and the profile everywhere', () => {
    const shared = paths(sharedRoutes());
    expectServed(shared, ['login', 'home', 'profile', '']);
  });

  it('keeps the console screens in the web build', () => {
    const served = paths([...sharedRoutes(), ...consoleRoutes()]);

    expectServed(served, [
      'login',
      'home',
      'dashboard',
      'records',
      'corrections',
      'approvals',
      'cards',
      'directory',
      'shifts',
      'scan',
      'profile',
    ]);
  });

  it('serves the scanner and the staff notice in the phone build', () => {
    const served = paths([...sharedRoutes(), ...phoneRoutes()]);

    expectServed(served, ['login', 'home', 'scan', 'staff-only', 'profile']);
  });

  it('leaves the console screens out of the phone build', () => {
    const served = paths([...sharedRoutes(), ...phoneRoutes()]);

    for (const path of [
      'dashboard',
      'approvals',
      'cards',
      'directory',
      'shifts',
      'records',
      'corrections',
    ]) {
      expect(served, `path ${path}`).not.toContain(path);
    }
  });

  it('guards the scanner for HR Staff and Department Heads only', () => {
    const scan = phoneRoutes().find((route) => route.path === 'scan');

    expect(scan).toBeTruthy();
    expect(scan?.canActivate?.length).toBe(2);
  });

  it('sends an unknown link in the phone build to the console notice', () => {
    const wildcard = phoneRoutes().find((route) => route.path === '**');

    expect(wildcard).toBeTruthy();
    expect(wildcard?.redirectTo).toBeUndefined();
  });

  it('sends an unknown link in the console to the home screen', () => {
    const wildcard = consoleRoutes().find((route) => route.path === '**');

    expect(wildcard?.redirectTo).toBe('home');
  });
});
