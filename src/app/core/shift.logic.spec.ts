/** Unit tests for the pure shift / attendance evaluation logic. */
import { describe, expect, it } from 'vitest';

import { ShiftSchedule } from './models';
import {
  DEFAULT_SHIFTS,
  evaluateCheckIn,
  minutesBetween,
  minutesOfDay,
  parseHhMm,
  shiftForDate,
  workedMinutes,
} from './shift.logic';

const DAY: ShiftSchedule = {
  id: 'day',
  shiftName: 'Day Shift',
  shiftType: 'day',
  startTime: '08:00',
  endTime: '17:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  gracePeriodMinutes: 15,
  isActive: true,
};

const NIGHT: ShiftSchedule = {
  id: 'night',
  shiftName: 'Night Shift',
  shiftType: 'night',
  startTime: '18:00',
  endTime: '06:00',
  breakStart: '22:00',
  breakEnd: '23:00',
  gracePeriodMinutes: 15,
  isActive: true,
};

/** Local date at the given "HH:MM". */
function at(hours: number, minutes: number): Date {
  return new Date(2026, 0, 15, hours, minutes, 0, 0);
}

describe('parseHhMm', () => {
  it('converts "HH:MM" to minutes since midnight', () => {
    expect(parseHhMm('00:00')).toBe(0);
    expect(parseHhMm('08:00')).toBe(480);
    expect(parseHhMm('17:30')).toBe(1050);
    expect(parseHhMm('23:59')).toBe(1439);
  });

  it('accepts a single digit hour and surrounding whitespace', () => {
    expect(parseHhMm('8:05')).toBe(485);
    expect(parseHhMm('  09:15  ')).toBe(555);
  });

  it('returns 0 for anything that is not "HH:MM"', () => {
    expect(parseHhMm('')).toBe(0);
    expect(parseHhMm('8')).toBe(0);
    expect(parseHhMm('08:00:00')).toBe(0);
    expect(parseHhMm('abc')).toBe(0);
  });
});

describe('minutesOfDay', () => {
  it('returns the local time as minutes since midnight', () => {
    expect(minutesOfDay(at(0, 0))).toBe(0);
    expect(minutesOfDay(at(8, 5))).toBe(485);
    expect(minutesOfDay(at(23, 45))).toBe(1425);
  });
});

describe('minutesBetween', () => {
  it('is signed', () => {
    expect(minutesBetween(480, 540)).toBe(60);
    expect(minutesBetween(540, 480)).toBe(-60);
    expect(minutesBetween(480, 480)).toBe(0);
  });
});

describe('evaluateCheckIn', () => {
  it('marks an on-time arrival as present with zero late minutes', () => {
    const result = evaluateCheckIn(at(7, 55), DAY);
    expect(result.status).toBe('present');
    expect(result.lateMinutes).toBe(0);
  });

  it('marks an arrival exactly on the shift start as present', () => {
    const result = evaluateCheckIn(at(8, 0), DAY);
    expect(result.status).toBe('present');
    expect(result.lateMinutes).toBe(0);
  });

  it('keeps an arrival inside the grace period present but still counts the minutes', () => {
    const result = evaluateCheckIn(at(8, 10), DAY);
    expect(result.status).toBe('present');
    expect(result.lateMinutes).toBe(10);
  });

  it('marks an arrival past the grace period as late', () => {
    const result = evaluateCheckIn(at(8, 16), DAY);
    expect(result.status).toBe('late');
    expect(result.lateMinutes).toBe(16);
  });

  it('treats the grace period itself as still on time', () => {
    const result = evaluateCheckIn(at(8, 15), DAY);
    expect(result.status).toBe('present');
    expect(result.lateMinutes).toBe(15);
  });

  it('works for the night shift', () => {
    const result = evaluateCheckIn(at(18, 30), NIGHT);
    expect(result.status).toBe('late');
    expect(result.lateMinutes).toBe(30);
  });

  it('falls back to a zero grace period when the schedule has none', () => {
    const noGrace: ShiftSchedule = { ...DAY, gracePeriodMinutes: undefined as unknown as number };
    const result = evaluateCheckIn(at(8, 1), noGrace);
    expect(result.status).toBe('late');
    expect(result.lateMinutes).toBe(1);
  });
});

describe('workedMinutes', () => {
  it('ignores the meal break', () => {
    // 08:00 -> 17:00 is 540 minutes, minus a 60 minute break.
    expect(workedMinutes(at(8, 0), at(17, 0), DAY)).toBe(480);
  });

  it('always deducts the full break length, even when clocking out inside it', () => {
    // 08:00 -> 12:30 is 270 minutes, minus the full 60 minute break.
    expect(workedMinutes(at(8, 0), at(12, 30), DAY)).toBe(210);
  });

  it('handles a shift that crosses midnight', () => {
    // 22:00 -> 06:00 is 480 minutes, minus a 60 minute break.
    expect(workedMinutes(at(22, 0), at(6, 0), NIGHT)).toBe(420);
  });

  it('handles a break that crosses midnight', () => {
    const schedule: ShiftSchedule = {
      ...NIGHT,
      breakStart: '23:30',
      breakEnd: '00:30',
    };
    expect(workedMinutes(at(22, 0), at(6, 0), schedule)).toBe(420);
  });

  it('treats an end before the start as a shift that crosses midnight', () => {
    // 17:00 -> 08:00 the next day is 900 minutes, minus the 60 minute break.
    expect(workedMinutes(at(17, 0), at(8, 0), DAY)).toBe(840);
  });

  it('does not subtract a break when the schedule has none', () => {
    const schedule: ShiftSchedule = { ...DAY, breakStart: undefined, breakEnd: undefined };
    expect(workedMinutes(at(8, 0), at(17, 0), schedule)).toBe(540);
  });
});

describe('shiftForDate', () => {
  it('picks the day shift inside the day window', () => {
    expect(shiftForDate(DEFAULT_SHIFTS, at(9, 0))?.id).toBe('day');
  });

  it('picks the night shift inside the night window', () => {
    expect(shiftForDate(DEFAULT_SHIFTS, at(20, 0))?.id).toBe('night');
  });

  it('picks the night shift in the early hours of a night shift', () => {
    expect(shiftForDate(DEFAULT_SHIFTS, at(3, 0))?.id).toBe('night');
  });

  it('falls back to the night shift after noon when no window matches', () => {
    const shortDay: ShiftSchedule = { ...DAY, endTime: '12:00' };
    const schedules = [shortDay, NIGHT];
    expect(shiftForDate(schedules, at(14, 0))?.id).toBe('night');
  });

  it('falls back to the day shift in the early morning', () => {
    expect(shiftForDate(DEFAULT_SHIFTS, at(6, 30))?.id).toBe('day');
  });

  it('ignores inactive schedules', () => {
    const schedules = [DAY, { ...NIGHT, isActive: false }];
    expect(shiftForDate(schedules, at(20, 0))?.id).toBe('day');
  });

  it('returns null when nothing is active', () => {
    expect(shiftForDate([{ ...DAY, isActive: false }], at(9, 0))).toBeNull();
    expect(shiftForDate([], at(9, 0))).toBeNull();
  });
});

describe('DEFAULT_SHIFTS', () => {
  it('mirrors the legacy Tuman seed', () => {
    expect(DEFAULT_SHIFTS).toHaveLength(2);
    expect(DEFAULT_SHIFTS[0]).toMatchObject({
      startTime: '08:00',
      endTime: '17:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      gracePeriodMinutes: 15,
    });
    expect(DEFAULT_SHIFTS[1]).toMatchObject({
      startTime: '18:00',
      endTime: '06:00',
      breakStart: '22:00',
      breakEnd: '23:00',
      gracePeriodMinutes: 15,
    });
  });
});
