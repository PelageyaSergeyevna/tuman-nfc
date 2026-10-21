/**
 * Shift schedule loading.
 *
 * Schedules live in the `settings/attendance/shift_schedules` sub-collection
 * and are readable by every signed-in user; only HR Staff may change them.
 */
import { Injectable, inject, signal } from '@angular/core';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';

import { firestoreDb } from './firebase';
import { ShiftSchedule } from './models';
import { DEFAULT_SHIFTS } from './shift.logic';

/** Parent settings document that holds the shift schedules. */
const SETTINGS_DOC = 'attendance';

/** Sub-collection with the individual schedules. */
const SCHEDULES_COLLECTION = 'shift_schedules';

@Injectable({ providedIn: 'root' })
export class ShiftService {
  readonly schedules = signal<ShiftSchedule[]>(DEFAULT_SHIFTS);
  readonly loaded = signal(false);

  private readonly db = firestoreDb();
  private unsubscribe: (() => void) | null = null;

  constructor() {
    this.unsubscribe = onSnapshot(
      collection(this.db, 'settings', SETTINGS_DOC, SCHEDULES_COLLECTION),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as ShiftSchedule), id: d.id }));
        this.schedules.set(list.length ? list : DEFAULT_SHIFTS);
        this.loaded.set(true);
      },
      () => {
        this.schedules.set(DEFAULT_SHIFTS);
        this.loaded.set(true);
      },
    );
  }

  /** The active schedule for the given moment. */
  activeShift(date: Date = new Date()): ShiftSchedule {
    const active = this.schedules().filter((s) => s.isActive);
    if (!active.length) {
      return DEFAULT_SHIFTS[0];
    }
    const minutes = date.getHours() * 60 + date.getMinutes();
    const within = (shift: ShiftSchedule): boolean => {
      const start = Number(shift.startTime.slice(0, 2)) * 60 + Number(shift.startTime.slice(3, 5));
      let end = Number(shift.endTime.slice(0, 2)) * 60 + Number(shift.endTime.slice(3, 5));
      if (end <= start) {
        end += 24 * 60;
      }
      let m = minutes;
      if (m < start) {
        m += 24 * 60;
      }
      return m >= start && m < end;
    };
    return (
      active.find((s) => s.shiftType === 'night' && within(s)) ??
      active.find((s) => s.shiftType === 'day' && within(s)) ??
      active.find((s) => s.shiftType === 'day') ??
      active[0]
    );
  }

  async save(schedule: ShiftSchedule): Promise<void> {
    await setDoc(doc(this.db, 'settings', SETTINGS_DOC, SCHEDULES_COLLECTION, schedule.id), schedule);
  }
}
