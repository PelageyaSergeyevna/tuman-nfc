/**
 * Pure shift / attendance evaluation logic.
 *
 * Kept free of Angular and Firebase so it can be unit tested directly.
 *
 * The legacy Tuman system uses two shifts with a mid-shift meal break:
 *   Day   08:00 → 12:00 (break) → 13:00 → 17:00
 *   Night 18:00 → 22:00 (break) → 23:00 → 06:00
 * Both allow a 15-minute grace period before the employee is marked late.
 */
import { AttendanceStatus, ShiftSchedule } from './models';

/** Minutes since midnight for an "HH:MM" string. */
export function parseHhMm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight for a Date. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Signed difference in minutes (`to - from`). */
export function minutesBetween(from: number, to: number): number {
  return to - from;
}

export interface CheckInEvaluation {
  status: Extract<AttendanceStatus, 'present' | 'late'>;
  lateMinutes: number;
}

/**
 * Decide whether a check-in counts as present or late.
 *
 * `lateMinutes` is the number of minutes after the shift start — it is 0
 * for an on-time arrival and can exceed the grace period.
 */
export function evaluateCheckIn(timeIn: Date, shift: ShiftSchedule): CheckInEvaluation {
  const start = parseHhMm(shift.startTime);
  const arrived = minutesOfDay(timeIn);
  const lateMinutes = Math.max(0, arrived - start);
  const grace = shift.gracePeriodMinutes ?? 0;
  return {
    status: lateMinutes > grace ? 'late' : 'present',
    lateMinutes,
  };
}

/**
 * Total worked minutes, ignoring the meal break.
 */
export function workedMinutes(timeIn: Date, timeOut: Date, shift: ShiftSchedule): number {
  const start = minutesOfDay(timeIn);
  let end = minutesOfDay(timeOut);
  if (end < start) {
    // Shift crossed midnight (night shift).
    end += 24 * 60;
  }
  let total = end - start;
  if (shift.breakStart && shift.breakEnd) {
    const breakStart = parseHhMm(shift.breakStart);
    const breakEnd = parseHhMm(shift.breakEnd);
    const breakLength = breakEnd >= breakStart ? breakEnd - breakStart : 24 * 60 - breakStart + breakEnd;
    total = Math.max(0, total - breakLength);
  }
  return total;
}

/** Which shift applies on a given date, based on the active schedules. */
export function shiftForDate(schedules: ShiftSchedule[], date: Date = new Date()): ShiftSchedule | null {
  const active = schedules.filter((s) => s.isActive);
  if (!active.length) {
    return null;
  }
  const minutes = minutesOfDay(date);
  const dayShift = active.find((s) => s.shiftType === 'day');
  const nightShift = active.find((s) => s.shiftType === 'night');

  // Pick the shift whose window contains the current time; fall back to the
  // nearest one so records can still be filed outside the shift window.
  const within = (shift: ShiftSchedule): boolean => {
    const start = parseHhMm(shift.startTime);
    let end = parseHhMm(shift.endTime);
    if (end <= start) {
      end += 24 * 60;
    }
    let m = minutes;
    if (m < start) {
      m += 24 * 60;
    }
    return m >= start && m < end;
  };

  if (nightShift && within(nightShift)) {
    return nightShift;
  }
  if (dayShift && within(dayShift)) {
    return dayShift;
  }
  if (minutes >= parseHhMm('12:00')) {
    return nightShift ?? dayShift ?? null;
  }
  return dayShift ?? nightShift ?? null;
}

/** Default schedules, mirroring the legacy Tuman `shift_schedules` seed. */
export const DEFAULT_SHIFTS: ShiftSchedule[] = [
  {
    id: 'day',
    shiftName: 'Day Shift',
    shiftType: 'day',
    startTime: '08:00',
    endTime: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    gracePeriodMinutes: 15,
    isActive: true,
  },
  {
    id: 'night',
    shiftName: 'Night Shift',
    shiftType: 'night',
    startTime: '18:00',
    endTime: '06:00',
    breakStart: '22:00',
    breakEnd: '23:00',
    gracePeriodMinutes: 15,
    isActive: true,
  },
];
