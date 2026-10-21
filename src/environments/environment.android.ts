/**
 * The live Firebase settings, plus the one setting that tells the phone
 * build apart from the web build.
 */
import { environment as live } from './environment.prod';

/**
 * The phone build (Capacitor/Android) is the scanner: it files check-ins,
 * shows attendance records and takes correction requests. Everything that
 * changes data — cards, shifts, people, approvals — lives in the web
 * console, which the phone app links to.
 */
export const environment = {
  ...live,
  surface: 'android' as const,
};
