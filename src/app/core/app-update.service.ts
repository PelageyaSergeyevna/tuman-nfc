/**
 * Picks up a new app version after the app was updated.
 *
 * The service worker keeps serving the bundle it cached on the first launch
 * after an update, so the app has to reload before the new code runs. Without
 * this, an updated app keeps behaving like the old one until it is launched a
 * second time.
 */
import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);

  /** True when the app can update itself. */
  get isEnabled(): boolean {
    return this.swUpdate.isEnabled;
  }

  /** Reload the app when a newer bundle is already cached. */
  async applyPendingUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      return;
    }
    try {
      const update = await this.swUpdate.checkForUpdate();
      if (!update) {
        return;
      }
      await this.swUpdate.activateUpdate();
      location.reload();
    } catch {
      /* the app keeps running with the cached version */
    }
  }
}
