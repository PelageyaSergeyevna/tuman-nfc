/**
 * Date helpers shared by the pages.
 *
 * All attendance data is keyed by a local calendar day (`YYYY-MM-DD`).
 */
import { toDateKey } from './models';

/** Today, as a `YYYY-MM-DD` key. */
export function todayKey(): string {
  return toDateKey(new Date());
}

/** The `YYYY-MM-DD` key of `days` days before today. */
export function daysAgoKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateKey(d);
}

/** The `YYYY-MM-DD` key of `days` days after today. */
export function daysAheadKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** The first day of the current month. */
export function startOfMonthKey(): string {
  const d = new Date();
  d.setDate(1);
  return toDateKey(d);
}

/** A friendly label such as "Today", "Yesterday" or "12 Aug 2026". */
export function friendlyDate(key: string): string {
  if (key === todayKey()) {
    return 'Today';
  }
  if (key === daysAgoKey(1)) {
    return 'Yesterday';
  }
  const parsed = parseDateKey(key);
  if (!parsed) {
    return key;
  }
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Parse `YYYY-MM-DD` into a local Date. */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Format an ISO timestamp as a 24-hour clock time, e.g. "08:07". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}

/** Format an ISO timestamp as "12 Aug 2026, 08:07". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  return `${friendlyDate(toDateKey(d))}, ${formatTime(iso)}`;
}

/** Human label for the source of a record. */
export function sourceLabel(source: string | undefined): string {
  switch (source) {
    case 'nfc':
      return 'NFC scan';
    case 'manual':
      return 'Manual';
    case 'seed':
      return 'Imported';
    case 'correction':
      return 'Correction';
    default:
      return '—';
  }
}

/** Build an ISO timestamp from a `YYYY-MM-DD` day and an `HH:MM` clock time. */
export function isoFromTime(dateKey: string, time: string): string | null {
  const day = parseDateKey(dateKey);
  if (!day || !time) {
    return null;
  }
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  day.setHours(hours, minutes, 0, 0);
  return day.toISOString();
}

/** The `HH:MM` clock time of an ISO timestamp, for a time picker. */
export function timeFromIso(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}
