/**
 * Seeds the TUMAN Attendance app with the legacy Tuman data.
 *
 * Creates:
 *   - Firebase Auth accounts for the three Tuman template users plus the
 *     bulk-import employees.
 *   - `users/{uid}` profiles carrying the Tuman role / department / employee
 *     code.
 *   - `settings/attendance/shift_schedules/{id}` matching the legacy
 *     `shift_schedules` table.
 *   - `attendance/{employeeId_YYYY-MM-DD}` records for the imported DTR rows
 *     plus a generated recent window so the dashboard has something to show.
 *   - `nfcCards/{uidHex}` assignments.
 *   - `settings/attendance` with the attendance policy (grace period,
 *     approval switches).
 *
 * Usage:
 *   node tools/seed.mjs                      # targets the local emulator
 *   FIRESTORE_EMULATOR_HOST=... node tools/seed.mjs
 *   node tools/seed.mjs --project <id>       # targets a real Firebase project
 *   node tools/seed.mjs --project <id> --template-only   # 3 template users only
 *   node tools/seed.mjs --project <id> --password <pw>    # custom password
 *
 * Flags:
 *   --project <id>   Firebase project id. Defaults to the emulator demo
 *                    project when running against the emulators, otherwise to
 *                    the live project configured in `.firebaserc`.
 *   --template-only  Seed only the three Tuman template accounts, their
 *                    profiles, the two shift schedules, the attendance policy,
 *                    a single NFC card and a short recent attendance window.
 *                    Skips the bulk employees and the legacy DTR import.
 *   --password <pw>  Password for the seeded accounts (also read from
 *                    TUMAN_SEED_PASSWORD). Defaults to DEFAULT_PASSWORD.
 *
 * A real project needs service-account credentials:
 *   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.tuman/firebase-adminsdk-<id>.json"
 *
 * The script is idempotent: re-running it overwrites the same documents.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE_REPO = resolve(ROOT, '../tuman-feature-tuman-final-import');

const DEFAULT_PASSWORD = 'Tuman123';

/** Project used when the script runs against the local emulators. */
const DEMO_PROJECT = 'tuman-attendance-demo';
/** Live project used when no --project is given and the emulators are off. */
const LIVE_PROJECT = 'tuman-nfc';

/** ------------------------------------------------------------------ args */
const args = process.argv.slice(2);
const projectArg = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;
const templateOnly = args.includes('--template-only');
const passwordArg = args.includes('--password') ? args[args.indexOf('--password') + 1] : null;
const password = passwordArg || process.env.TUMAN_SEED_PASSWORD || DEFAULT_PASSWORD;

const useEmulator =
  !projectArg &&
  (args.includes('--emulator') ||
    process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
    process.env.FIREBASE_EMULATOR === 'true');

const projectId =
  projectArg ||
  process.env.FIRESTORE_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  (useEmulator ? DEMO_PROJECT : LIVE_PROJECT);

if (useEmulator) {
  // The Firebase CLI exports these for the running emulators; fill in the
  // defaults from firebase.json so `npm run seed:emulator` works standalone.
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.GCLOUD_PROJECT ||= projectId;
} else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('[seed] GOOGLE_APPLICATION_CREDENTIALS is not set.');
  console.error('[seed] Seeding a real project needs a service-account key:');
  console.error('[seed]   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.tuman/firebase-adminsdk-<project>.json"');
  process.exit(1);
}

/** ------------------------------------------------------- legacy accounts */
/**
 * The three template accounts from backend/seed_template_accounts.sql.
 * `fullName` is split so the display name matches the Tuman webapp.
 */
const TEMPLATE_ACCOUNTS = [
  {
    employeeId: 'HR001',
    displayName: 'Maria Santos Reyes',
    email: 'maria.reyes@tuman.local',
    department: 'Human Resources',
    position: 'HR Manager',
    role: 'hr',
    phone: '917 123 4567',
  },
  {
    employeeId: 'MGR001',
    displayName: 'Jose Miguel Cruz',
    email: 'jose.cruz@tuman.local',
    department: 'IT',
    position: 'IT Manager',
    role: 'manager',
    phone: '918 234 5678',
  },
  {
    employeeId: 'EMP001',
    displayName: 'Ana Lucia Ramos',
    email: 'ana.ramos@tuman.local',
    department: 'IT',
    position: 'Software Developer',
    role: 'employee',
    phone: '919 345 6789',
  },
];

/** Extra employees so the department views have more than one row. */
const EXTRA_EMPLOYEES = [
  {
    employeeId: 'EMP002',
    displayName: 'Paolo Mendoza Dela Cruz',
    email: 'paolo.dela.cruz@tuman.local',
    department: 'IT',
    position: 'Systems Administrator',
    role: 'employee',
    phone: '917 456 7890',
  },
  {
    employeeId: 'EMP003',
    displayName: 'Kristine Bautista Lim',
    email: 'kristine.lim@tuman.local',
    department: 'Human Resources',
    position: 'HR Officer',
    role: 'employee',
    phone: '918 567 8901',
  },
  {
    employeeId: 'EMP004',
    displayName: 'Ricardo Villanueva Santiago',
    email: 'ricardo.santiago@tuman.local',
    department: 'Operations',
    position: 'Operations Supervisor',
    role: 'manager',
    phone: '919 678 9012',
  },
  {
    employeeId: 'EMP005',
    displayName: 'Grace Fernandez Aquino',
    email: 'grace.aquino@tuman.local',
    department: 'Operations',
    position: 'Logistics Coordinator',
    role: 'employee',
    phone: '917 789 0123',
  },
  {
    employeeId: 'EMP006',
    displayName: 'Daniel Mercado Villanueva',
    email: 'daniel.villanueva@tuman.local',
    department: 'Finance',
    position: 'Accountant',
    role: 'employee',
    phone: '918 890 1234',
  },
];

const SHIFT_SCHEDULES = [
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

const NFC_CARDS = [
  { id: '04A1B2C3D4E5', employeeId: 'EMP001', cardType: 'mifare-classic-1k' },
  { id: '04A1B2C3D4E6', employeeId: 'EMP002', cardType: 'mifare-classic-1k' },
  { id: '04A1B2C3D4E7', employeeId: 'EMP003', cardType: 'mifare-classic-1k' },
  { id: '04A1B2C3D4E8', employeeId: 'EMP004', cardType: 'mifare-classic-1k' },
  { id: '04A1B2C3D4E9', employeeId: 'EMP005', cardType: 'mifare-classic-1k' },
  { id: '04A1B2C3D4EA', employeeId: 'EMP006', cardType: 'mifare-classic-1k' },
];

/** ------------------------------------------------------------------ util */
const pad = (n) => `${n}`.padStart(2, '0');

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Build the UTC instant of a local wall-clock time.
 *
 * The app stores check-in times as UTC instants and renders them in the
 * device's local zone (`isoFromTime` in src/app/core/date.util.ts does
 * `new Date(y, m, d, hh, mm).toISOString()`). Appending a literal "Z" to a
 * wall-clock time instead would shift every check-in by the UTC offset — an
 * 08:00 shift would read as 16:00 on a UTC+8 device.
 */
function isoAt(dateKey, time) {
  if (!time) {
    return null;
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const local = new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0, 0);
  return local.toISOString();
}

function log(...args) {
  console.log('[seed]', ...args);
}

/** Parse the legacy DTR CSV (attendance_dtr_import.csv). */
function loadLegacyDtr() {
  const path = resolve(SOURCE_REPO, 'backend/database/attendance_dtr_import.csv');
  if (!existsSync(path)) {
    return [];
  }
  const [header, ...rows] = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const cols = header.split(',');
  return rows
    .filter(Boolean)
    .map((row) => {
      const cells = row.split(',');
      const rec = {};
      cols.forEach((col, i) => {
        rec[col.trim()] = (cells[i] ?? '').trim();
      });
      return rec;
    })
    .filter((r) => r.employee_id && r.date);
}

/** Deterministic pseudo-random so repeated seeds produce the same data. */
function seeded(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i += 1) {
    s = (s * 31 + seed.charCodeAt(i)) % 2147483647;
  }
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generate a recent attendance window so the dashboard, the record list and
 * the correction/approval flows all have data to work with.
 */
function generateRecentAttendance(employees, days = 30) {
  const records = [];
  const now = new Date();
  const rand = seeded('tuman-attendance-seed');

  for (let d = days - 1; d >= 0; d -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const key = dateKey(day);
    const weekend = day.getDay() === 0 || day.getDay() === 6;

    for (const employee of employees) {
      if (employee.role === 'hr' && employee.employeeId === 'HR001' && rand() < 0.08) {
        continue; // HR rarely misses
      }
      if (weekend && rand() < 0.8) {
        continue;
      }

      const roll = rand();
      let status = 'present';
      let timeIn = '08:00';
      let timeOut = '17:00';
      let lateMinutes = 0;

      if (roll < 0.05) {
        status = 'absent';
        timeIn = null;
        timeOut = null;
      } else if (roll < 0.09) {
        status = 'on_leave';
        timeIn = null;
        timeOut = null;
      } else if (roll < 0.12) {
        status = 'excused';
        timeIn = null;
        timeOut = null;
      } else if (roll < 0.22) {
        status = 'late';
        lateMinutes = 16 + Math.floor(rand() * 40);
        const total = 8 * 60 + lateMinutes;
        timeIn = `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
        const out = 17 * 60 + Math.floor(rand() * 45);
        timeOut = `${pad(Math.floor(out / 60))}:${pad(out % 60)}`;
      } else {
        const jitter = Math.floor(rand() * 12);
        const total = 8 * 60 + jitter;
        timeIn = `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
        const out = 17 * 60 + Math.floor(rand() * 50);
        timeOut = `${pad(Math.floor(out / 60))}:${pad(out % 60)}`;
      }

      records.push({
        employeeId: employee.employeeId,
        employeeName: employee.displayName,
        department: employee.department,
        date: key,
        status,
        timeIn: isoAt(key, timeIn),
        timeOut: isoAt(key, timeOut),
        lateMinutes,
        shiftId: 'day',
        shiftName: 'Day Shift',
        source: 'seed',
        notes: '',
        archived: false,
      });
    }
  }
  return records;
}

/** ----------------------------------------------------------------- main */
async function main() {
  const app = initializeApp({
    projectId,
    ...(useEmulator ? {} : { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }),
  });

  const auth = getAuth(app);
  const db = getFirestore(app);

  if (useEmulator) {
    log('targeting the Firestore emulator', process.env.FIRESTORE_EMULATOR_HOST);
  } else {
    log('targeting real project', projectId);
  }
  if (templateOnly) {
    log('template-only mode: 3 template accounts, no bulk import');
  }

  const employees = templateOnly ? TEMPLATE_ACCOUNTS : [...TEMPLATE_ACCOUNTS, ...EXTRA_EMPLOYEES];

  // ------------------------------------------------------ auth + profiles
  const uids = new Map();

  for (const employee of employees) {
    let uid;
    try {
      const user = await auth.createUser({
        email: employee.email,
        password,
        displayName: employee.displayName,
        emailVerified: true,
      });
      uid = user.uid;
      log('created auth user', employee.email);
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        const existing = await auth.getUserByEmail(employee.email);
        uid = existing.uid;
        await auth.updateUser(existing.uid, {
          password,
          displayName: employee.displayName,
          emailVerified: true,
        });
        log('updated auth user', employee.email);
      } else {
        throw err;
      }
    }
    uids.set(employee.employeeId, uid);

    await db
      .collection('users')
      .doc(uid)
      .set(
        {
          uid,
          employeeId: employee.employeeId,
          email: employee.email,
          displayName: employee.displayName,
          role: employee.role,
          department: employee.department,
          position: employee.position,
          phone: employee.phone,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }
  log(`seeded ${employees.length} user profiles`);

  // --------------------------------------------------------------- shifts
  const batch = db.batch();
  for (const shift of SHIFT_SCHEDULES) {
    batch.set(db.collection('settings').doc('attendance').collection('shift_schedules').doc(shift.id), {
      ...shift,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  log(`seeded ${SHIFT_SCHEDULES.length} shift schedules`);

  // ----------------------------------------------------------- attendance
  const legacyRows = templateOnly ? [] : loadLegacyDtr();
  const legacyRecords = legacyRows.map((row) => {
    const employee = employees.find((e) => e.employeeId === row.employee_id);
    const status = row.status || 'present';
    return {
      employeeId: row.employee_id,
      employeeName: employee?.displayName ?? row.employee_id,
      department: employee?.department ?? 'IT',
      date: row.date,
      status,
      timeIn: status === 'absent' || status === 'on_leave' ? null : isoAt(row.date, row.time_in),
      timeOut: status === 'absent' || status === 'on_leave' ? null : isoAt(row.date, row.time_out),
      lateMinutes: Number(row.late_minutes) || 0,
      shiftId: 'day',
      shiftName: 'Day Shift',
      source: 'seed',
      notes: '',
      archived: false,
    };
  });

  // Template mode uses a two-week window so the dashboard charts have a
  // full working week plus a Monday to compare against.
  const recentRecords = generateRecentAttendance(employees, templateOnly ? 10 : 30);
  const allRecords = [...legacyRecords, ...recentRecords];

  let attendanceBatch = db.batch();
  let written = 0;
  for (const record of allRecords) {
    const id = `${record.employeeId}_${record.date}`;
    attendanceBatch.set(
      db.collection('attendance').doc(id),
      { ...record, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    written += 1;
    if (written % 400 === 0) {
      await attendanceBatch.commit();
      attendanceBatch = db.batch();
    }
  }
  await attendanceBatch.commit();
  log(`seeded ${allRecords.length} attendance records`);

  // ----------------------------------------------------------- nfc cards
  const cards = templateOnly ? NFC_CARDS.filter((card) => card.employeeId === 'EMP001') : NFC_CARDS;
  const cardBatch = db.batch();
  for (const card of cards) {
    const employee = employees.find((e) => e.employeeId === card.employeeId);
    if (!employee) {
      continue;
    }
    cardBatch.set(db.collection('nfcCards').doc(card.id), {
      id: card.id,
      employeeId: employee.employeeId,
      employeeName: employee.displayName,
      department: employee.department,
      cardType: card.cardType,
      assignedAt: new Date().toISOString(),
      assignedBy: uids.get('HR001') ?? '',
      isActive: true,
    });
  }
  await cardBatch.commit();
  log(`seeded ${cards.length} NFC cards`);

  // ------------------------------------------------------------ settings
  await db.collection('settings').doc('attendance').set(
    {
      gracePeriodMinutes: 15,
      defaultShiftId: 'day',
      archiveRequiresApproval: true,
      correctionRequiresApproval: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  log('');
  log(`Done (${projectId}). Sign in with:`);
  for (const employee of TEMPLATE_ACCOUNTS) {
    log(`  ${employee.role.padEnd(8)} ${employee.email} / ${password}  (${employee.displayName}, ${employee.department})`);
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exitCode = 1;
});
