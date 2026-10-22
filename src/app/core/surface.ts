/**
 * Which build of the app is running.
 *
 * `web`     — the console: cards, shifts, people, approvals, records.
 * `android` — the phone app: the NFC scanner, records, correction requests.
 *
 * Fixed at build time (see `angular.json`), so the phone build does not even
 * ship the screens it may not use.
 */
import { environment } from '../../environments/environment';

export type Surface = 'web' | 'android';

/** The surface of this build. */
export const SURFACE = environment.surface as Surface;

/** True in the phone app. */
export const isPhoneApp = (): boolean => SURFACE === 'android';

/** Where the full console can be reached. */
export const WEB_APP_URL = environment.webAppUrl;
