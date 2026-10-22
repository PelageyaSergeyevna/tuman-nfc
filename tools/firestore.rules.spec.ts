/**
 * Firestore Security Rules — integration tests.
 *
 * These run against the Firestore + Auth emulators with the real
 * `firestore.rules` file, so they prove the access model end to end:
 *
 *   HR Staff        reads every department, writes only their own,
 *                   archives directly in their own department and approves
 *                   archive requests for anybody.
 *   Department Head reads/writes only their own department and may NOT
 *                   archive without an HR-approved archive request.
 *   Employee        read-only on their own records, may file corrections.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  setDoc,
  setLogLevel,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'tuman-attendance-demo';

// The Firestore emulator reports a `get()`-derived comparison that evaluates to
// false as an evaluation error instead of `false` (firebase-tools 15.x). The
// allow/deny outcome is identical, but the SDK logs every denial as noise.
setLogLevel('silent');
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

const [firestoreHost, firestorePort] = FIRESTORE_HOST.split(':');
const [authHost, authPort] = AUTH_HOST.split(':');

/** UIDs of the four test identities. */
const UID = {
  hr: 'test-uid-hr',
  headIt: 'test-uid-head-it',
  headOps: 'test-uid-head-ops',
  employeeIt: 'test-uid-emp-it',
  employeeHr: 'test-uid-emp-hr',
};

const PROFILES = {
  [UID.hr]: {
    uid: UID.hr,
    employeeId: 'HR001',
    email: 'hr@test.local',
    displayName: 'HR Tester',
    role: 'hr',
    department: 'Human Resources',
    isActive: true,
  },
  [UID.headIt]: {
    uid: UID.headIt,
    employeeId: 'MGR001',
    email: 'head.it@test.local',
    displayName: 'IT Head',
    role: 'manager',
    department: 'IT',
    isActive: true,
  },
  [UID.headOps]: {
    uid: UID.headOps,
    employeeId: 'MGR002',
    email: 'head.ops@test.local',
    displayName: 'Ops Head',
    role: 'manager',
    department: 'Operations',
    isActive: true,
  },
  [UID.employeeIt]: {
    uid: UID.employeeIt,
    employeeId: 'EMP001',
    email: 'emp.it@test.local',
    displayName: 'IT Employee',
    role: 'employee',
    department: 'IT',
    isActive: true,
  },
  [UID.employeeHr]: {
    uid: UID.employeeHr,
    employeeId: 'EMP002',
    email: 'emp.hr@test.local',
    displayName: 'HR Employee',
    role: 'employee',
    department: 'Human Resources',
    isActive: true,
  },
};

const IT_RECORD_ID = 'EMP001_2026-01-05';
const OTHER_RECORD_ID = 'EMP002_2026-01-05';

function record(employeeId: string, department: string, overrides: Record<string, unknown> = {}) {
  return {
    employeeId,
    employeeName: employeeId,
    department,
    date: '2026-01-05',
    status: 'present',
    timeIn: '2026-01-05T08:00:00.000Z',
    timeOut: '2026-01-05T17:00:00.000Z',
    lateMinutes: 0,
    shiftId: 'day',
    shiftName: 'Day Shift',
    source: 'manual',
    notes: '',
    archived: false,
    ...overrides,
  };
}

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host: firestoreHost,
      port: Number(firestorePort),
    },
    auth: {
      host: authHost,
      port: Number(authPort),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // Start from a clean slate so a previous run cannot turn a create into
    // an update (which would change which rule is evaluated).
    await cleanupTestData(ctx);
    const db = ctx.firestore();
    for (const profile of Object.values(PROFILES)) {
      await setDoc(doc(db, 'users', profile.uid), profile);
    }
    await setDoc(doc(db, 'attendance', IT_RECORD_ID), record('EMP001', 'IT'));
    await setDoc(doc(db, 'attendance', OTHER_RECORD_ID), record('EMP002', 'Human Resources'));
  });
});

afterAll(async () => {
  await testEnv.withSecurityRulesDisabled(cleanupTestData);
  await testEnv.cleanup();
});

/** Restore the two base attendance records to their original state. */
async function resetRecords(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'attendance', IT_RECORD_ID), record('EMP001', 'IT'));
    await setDoc(doc(db, 'attendance', OTHER_RECORD_ID), record('EMP002', 'Human Resources'));
  });
}

/**
 * Remove every document this suite creates.
 *
 * Only the ids below are touched — the emulator also holds the seeded demo
 * data (NFC cards, shift schedules, attendance records) which must survive a
 * test run.
 */
async function cleanupTestData(ctx: { firestore: () => Firestore }): Promise<void> {
  const db = ctx.firestore();
  for (const id of [IT_RECORD_ID, OTHER_RECORD_ID]) {
    await deleteDoc(doc(db, 'attendance', id));
  }
  for (const uid of Object.keys(PROFILES)) {
    await deleteDoc(doc(db, 'users', uid));
  }
  for (const id of ['test-archive-request-1', 'test-archive-request-2', 'test-archive-request-3', 'test-archive-request-4']) {
    await deleteDoc(doc(db, 'archiveRequests', id));
  }
  for (const id of ['test-correction-1', 'test-correction-2', 'test-correction-3']) {
    await deleteDoc(doc(db, 'correctionRequests', id));
  }
  for (const id of ['test-notification-role', 'test-notification-person']) {
    await deleteDoc(doc(db, 'notifications', id));
  }
  for (const id of ['AABBCCDDEEFF', '112233445566', '223344556677']) {
    await deleteDoc(doc(db, 'nfcCards', id));
  }
  const attendance = await getDocs(collection(db, 'attendance'));
  for (const doc of attendance.docs) {
    if (/^EMP00[12]_2026-0[23]/.test(doc.id) || doc.id.startsWith('EMP001_2026-01-05')) {
      await deleteDoc(doc.ref);
    }
  }
}

/** A Firestore context acting as the given signed-in user. */
function as(uid: keyof typeof UID) {
  return testEnv.authenticatedContext(uid, {
    email: PROFILES[uid].email,
  }).firestore();
}

describe('attendance reads', () => {
  it('lets HR Staff read a record in another department', async () => {
    const snap = await getDoc(doc(as(UID.hr), 'attendance', OTHER_RECORD_ID));
    expect(snap.exists()).toBe(true);
  });

  it('lets a Department Head read their own department', async () => {
    const snap = await getDoc(doc(as(UID.headIt), 'attendance', IT_RECORD_ID));
    expect(snap.exists()).toBe(true);
  });

  it('blocks a Department Head from another department', async () => {
    await assertFails(getDoc(doc(as(UID.headIt), 'attendance', OTHER_RECORD_ID)));
  });

  it('lets an Employee read their own record', async () => {
    const snap = await getDoc(doc(as(UID.employeeIt), 'attendance', IT_RECORD_ID));
    expect(snap.exists()).toBe(true);
  });

  it('blocks an Employee from reading a colleague record', async () => {
    await assertFails(getDoc(doc(as(UID.employeeIt), 'attendance', OTHER_RECORD_ID)));
  });

  it('blocks a signed-out read', async () => {
    const anonymous = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous, 'attendance', IT_RECORD_ID)));
  });
});

describe('attendance writes', () => {
  it('lets a Department Head create a record in their own department', async () => {
    const db = as(UID.headIt);
    await assertSucceeds(setDoc(doc(db, 'attendance', 'EMP001_2026-02-02'), record('EMP001', 'IT', { date: '2026-02-02' })));
  });

  it('blocks a Department Head from creating a record in another department', async () => {
    const db = as(UID.headIt);
    await assertFails(
      setDoc(doc(db, 'attendance', 'EMP002_2026-02-03'), record('EMP002', 'Human Resources', { date: '2026-02-03' })),
    );
  });

  it('blocks HR Staff from creating a record outside their own department', async () => {
    const db = as(UID.hr);
    await assertFails(
      setDoc(doc(db, 'attendance', 'EMP001_2026-02-04'), record('EMP001', 'IT', { date: '2026-02-04' })),
    );
  });

  it('blocks creating a record that is born archived', async () => {
    const db = as(UID.headIt);
    await assertFails(
      setDoc(doc(db, 'attendance', 'EMP001_2026-02-05'), record('EMP001', 'IT', { date: '2026-02-05', archived: true })),
    );
  });

  // Regression: the scanner and the record editor used to save a record
  // without the `archived` field at all. The create rule requires
  // `archived == false`, so a first tap of the day was rejected with
  // "Missing or insufficient permissions". AttendanceService.save now always
  // writes `archived`. These two cases pin that behaviour down.
  it('blocks creating a record that omits the archived field', async () => {
    const db = as(UID.headIt);
    const { archived, ...withoutArchived } = record('EMP001', 'IT', { date: '2026-02-07' });
    expect(archived).toBe(false);
    await assertFails(setDoc(doc(db, 'attendance', 'EMP001_2026-02-07'), withoutArchived));
  });

  it('lets a Department Head create a record that carries archived: false', async () => {
    const db = as(UID.headIt);
    await assertSucceeds(
      setDoc(doc(db, 'attendance', 'EMP001_2026-02-08'), record('EMP001', 'IT', { date: '2026-02-08', archived: false })),
    );
  });

  it('blocks an Employee from creating a record', async () => {
    const db = as(UID.employeeIt);
    await assertFails(
      setDoc(doc(db, 'attendance', 'EMP001_2026-02-06'), record('EMP001', 'IT', { date: '2026-02-06' })),
    );
  });

  it('lets a Department Head edit the content of a record in their own department', async () => {
    const db = as(UID.headIt);
    await assertSucceeds(updateDoc(doc(db, 'attendance', IT_RECORD_ID), { notes: 'Corrected by head' }));
  });

  it('blocks a Department Head from editing another department', async () => {
    const db = as(UID.headIt);
    await assertFails(updateDoc(doc(db, 'attendance', OTHER_RECORD_ID), { notes: 'nope' }));
  });

  it('blocks an Employee from editing their own record', async () => {
    const db = as(UID.employeeIt);
    await assertFails(updateDoc(doc(db, 'attendance', IT_RECORD_ID), { notes: 'nope' }));
  });

  it('blocks rewriting the identity of a record', async () => {
    const db = as(UID.headIt);
    await assertFails(updateDoc(doc(db, 'attendance', IT_RECORD_ID), { employeeId: 'EMP999' }));
  });

  it('blocks deleting an attendance record for everybody', async () => {
    await assertFails(deleteDoc(doc(as(UID.hr), 'attendance', IT_RECORD_ID)));
    await assertFails(deleteDoc(doc(as(UID.headIt), 'attendance', IT_RECORD_ID)));
    await assertFails(deleteDoc(doc(as(UID.employeeIt), 'attendance', IT_RECORD_ID)));
  });
});

describe('archiving', () => {
  beforeEach(async () => {
    await resetRecords();
  });

  it('blocks a Department Head from archiving directly, even in their own department', async () => {
    const db = as(UID.headIt);
    await assertFails(
      updateDoc(doc(db, 'attendance', IT_RECORD_ID), {
        archived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: UID.headIt,
      }),
    );
  });

  it('blocks a Department Head from touching archive fields at all', async () => {
    const db = as(UID.headIt);
    await assertFails(updateDoc(doc(db, 'attendance', IT_RECORD_ID), { archiveReason: 'typo' }));
  });

  it('lets HR Staff archive a record in their own department', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'attendance', 'EMP002_2026-03-01'),
        record('EMP002', 'Human Resources', { date: '2026-03-01' }),
      );
    });
    const db = as(UID.hr);
    await assertSucceeds(
      updateDoc(doc(db, 'attendance', 'EMP002_2026-03-01'), {
        archived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: UID.hr,
        archivedByName: 'HR Tester',
        archiveReason: 'Duplicate entry',
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  it('lets HR Staff archive another department record once an archive request is approved', async () => {
    const requestId = 'test-archive-request-1';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'archiveRequests', requestId), {
        attendanceId: IT_RECORD_ID,
        employeeId: 'EMP001',
        employeeName: 'EMP001',
        department: 'IT',
        date: '2026-01-05',
        reason: 'Duplicate entry',
        status: 'approved',
        requestedBy: UID.headIt,
        requestedByName: 'IT Head',
        requestedAt: new Date().toISOString(),
        reviewedBy: UID.hr,
        reviewedAt: new Date().toISOString(),
      });
    });

    const db = as(UID.hr);
    await assertSucceeds(
      updateDoc(doc(db, 'attendance', IT_RECORD_ID), {
        archived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: UID.hr,
        archiveReason: 'Duplicate entry',
        archiveRequestId: requestId,
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks HR Staff from archiving another department without an approved request', async () => {
    const db = as(UID.hr);
    await assertFails(
      updateDoc(doc(db, 'attendance', IT_RECORD_ID), {
        archived: true,
        archivedAt: new Date().toISOString(),
        archiveRequestId: 'does-not-exist',
      }),
    );
  });

  it('blocks HR Staff from changing record content while archiving another department', async () => {
    const db = as(UID.hr);
    await assertFails(
      updateDoc(doc(db, 'attendance', IT_RECORD_ID), {
        notes: 'sneaking a content change in',
        archiveRequestId: 'test-archive-request-1',
      }),
    );
  });
});

describe('archive requests', () => {
  it('lets a Department Head raise an archive request for their own department', async () => {
    const db = as(UID.headIt);
    await assertSucceeds(
      setDoc(doc(db, 'archiveRequests', 'test-archive-request-2'), {
        attendanceId: IT_RECORD_ID,
        employeeId: 'EMP001',
        employeeName: 'EMP001',
        department: 'IT',
        date: '2026-01-05',
        reason: 'Duplicate entry',
        status: 'pending',
        requestedBy: UID.headIt,
        requestedByName: 'IT Head',
        requestedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks a Department Head from raising a request for another department', async () => {
    const db = as(UID.headIt);
    await assertFails(
      setDoc(doc(db, 'archiveRequests', 'test-archive-request-3'), {
        attendanceId: OTHER_RECORD_ID,
        employeeId: 'EMP002',
        employeeName: 'EMP002',
        department: 'Human Resources',
        date: '2026-01-05',
        reason: 'Duplicate entry',
        status: 'pending',
        requestedBy: UID.headIt,
        requestedByName: 'IT Head',
        requestedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks an Employee from raising an archive request', async () => {
    const db = as(UID.employeeIt);
    await assertFails(
      setDoc(doc(db, 'archiveRequests', 'test-archive-request-4'), {
        attendanceId: IT_RECORD_ID,
        employeeId: 'EMP001',
        employeeName: 'EMP001',
        department: 'IT',
        date: '2026-01-05',
        reason: 'Duplicate entry',
        status: 'pending',
        requestedBy: UID.employeeIt,
        requestedByName: 'IT Employee',
        requestedAt: new Date().toISOString(),
      }),
    );
  });

  it('lets HR Staff approve an archive request', async () => {
    const db = as(UID.hr);
    await assertSucceeds(
      updateDoc(doc(db, 'archiveRequests', 'test-archive-request-2'), {
        status: 'approved',
        reviewedBy: UID.hr,
        reviewedByName: 'HR Tester',
        reviewedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks a Department Head from approving an archive request', async () => {
    const db = as(UID.headIt);
    await assertFails(
      updateDoc(doc(db, 'archiveRequests', 'test-archive-request-2'), {
        status: 'approved',
        reviewedBy: UID.headIt,
        reviewedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks a Department Head from rewriting the body of a request while approving it', async () => {
    const db = as(UID.hr);
    await assertFails(
      updateDoc(doc(db, 'archiveRequests', 'test-archive-request-2'), {
        status: 'approved',
        reason: 'changed my mind',
        reviewedAt: new Date().toISOString(),
      }),
    );
  });
});

describe('correction requests', () => {
  beforeEach(async () => {
    await resetRecords();
  });

  it('lets an Employee file a correction request for their own record', async () => {
    const db = as(UID.employeeIt);
    await assertSucceeds(
      setDoc(doc(db, 'correctionRequests', 'test-correction-1'), {
        attendanceId: IT_RECORD_ID,
        employeeId: 'EMP001',
        employeeName: 'EMP001',
        department: 'IT',
        date: '2026-01-05',
        proposed: { timeIn: '2026-01-05T08:15:00.000Z' },
        current: { timeIn: '2026-01-05T08:00:00.000Z' },
        reason: 'I was held up at the gate',
        status: 'pending',
        requestedBy: UID.employeeIt,
        requestedByName: 'IT Employee',
        requestedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks an Employee from filing a correction for a colleague', async () => {
    const db = as(UID.employeeIt);
    await assertFails(
      setDoc(doc(db, 'correctionRequests', 'test-correction-2'), {
        attendanceId: OTHER_RECORD_ID,
        employeeId: 'EMP002',
        employeeName: 'EMP002',
        department: 'Human Resources',
        date: '2026-01-05',
        proposed: { timeIn: '2026-01-05T08:15:00.000Z' },
        current: { timeIn: '2026-01-05T08:00:00.000Z' },
        reason: 'Not my record',
        status: 'pending',
        requestedBy: UID.employeeIt,
        requestedByName: 'IT Employee',
        requestedAt: new Date().toISOString(),
      }),
    );
  });

  it('lets the Department Head of that department approve the correction', async () => {
    const db = as(UID.headIt);
    await assertSucceeds(
      updateDoc(doc(db, 'correctionRequests', 'test-correction-1'), {
        status: 'approved',
        reviewedBy: UID.headIt,
        reviewedByName: 'IT Head',
        reviewedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks a Department Head of another department from approving the correction', async () => {
    const db = as(UID.headOps);
    await assertFails(
      updateDoc(doc(db, 'correctionRequests', 'test-correction-1'), {
        status: 'approved',
        reviewedBy: UID.headOps,
        reviewedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks an Employee from approving their own correction', async () => {
    const db = as(UID.employeeIt);
    await assertFails(
      updateDoc(doc(db, 'correctionRequests', 'test-correction-1'), {
        status: 'approved',
        reviewedBy: UID.employeeIt,
        reviewedAt: new Date().toISOString(),
      }),
    );
  });

  it('lets HR Staff apply an approved correction to another department record', async () => {
    const db = as(UID.hr);
    await assertSucceeds(
      updateDoc(doc(db, 'attendance', IT_RECORD_ID), {
        timeIn: '2026-01-05T08:15:00.000Z',
        correctionRequestId: 'test-correction-1',
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  it('blocks HR Staff from applying a correction that was never approved', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'correctionRequests', 'test-correction-3'), {
        attendanceId: IT_RECORD_ID,
        employeeId: 'EMP001',
        employeeName: 'EMP001',
        department: 'IT',
        date: '2026-01-05',
        proposed: { timeIn: '2026-01-05T09:00:00.000Z' },
        current: { timeIn: '2026-01-05T08:15:00.000Z' },
        reason: 'pending one',
        status: 'pending',
        requestedBy: UID.employeeIt,
        requestedByName: 'IT Employee',
        requestedAt: new Date().toISOString(),
      });
    });

    const db = as(UID.hr);
    await assertFails(
      updateDoc(doc(db, 'attendance', IT_RECORD_ID), {
        timeIn: '2026-01-05T09:00:00.000Z',
        correctionRequestId: 'test-correction-3',
        updatedAt: new Date().toISOString(),
      }),
    );
  });
});

describe('users', () => {
  it('lets a user update their own display name', async () => {
    const db = as(UID.employeeIt);
    await assertSucceeds(updateDoc(doc(db, 'users', UID.employeeIt), { displayName: 'Renamed' }));
  });

  it('blocks a user from promoting themselves', async () => {
    const db = as(UID.employeeIt);
    await assertFails(updateDoc(doc(db, 'users', UID.employeeIt), { role: 'hr' }));
  });

  it('blocks a user from moving themselves to another department', async () => {
    const db = as(UID.employeeIt);
    await assertFails(updateDoc(doc(db, 'users', UID.employeeIt), { department: 'Finance' }));
  });

  it('blocks a Department Head from editing a user', async () => {
    const db = as(UID.headIt);
    await assertFails(updateDoc(doc(db, 'users', UID.employeeIt), { position: 'Lead' }));
  });

  it('lets HR Staff edit any user', async () => {
    const db = as(UID.hr);
    await assertSucceeds(updateDoc(doc(db, 'users', UID.employeeIt), { position: 'Senior Developer' }));
  });
});

describe('notifications', () => {
  beforeAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'notifications', 'test-notification-role'), {
        type: 'info',
        title: 'For HR',
        message: 'Only HR should see this',
        recipientRole: 'hr',
        readBy: [],
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'notifications', 'test-notification-person'), {
        type: 'info',
        title: 'For EMP001',
        message: 'Only EMP001 should see this',
        recipientEmployeeId: 'EMP001',
        readBy: [],
        createdAt: new Date().toISOString(),
      });
    });
  });

  it('lets HR Staff read a role notification', async () => {
    const snap = await getDoc(doc(as(UID.hr), 'notifications', 'test-notification-role'));
    expect(snap.exists()).toBe(true);
  });

  it('blocks a Department Head from reading a role notification', async () => {
    await assertFails(getDoc(doc(as(UID.headIt), 'notifications', 'test-notification-role')));
  });

  it('lets the addressed employee read their own notification', async () => {
    const snap = await getDoc(doc(as(UID.employeeIt), 'notifications', 'test-notification-person'));
    expect(snap.exists()).toBe(true);
  });

  it('blocks another employee from reading a notification addressed to someone else', async () => {
    await assertFails(getDoc(doc(as(UID.employeeHr), 'notifications', 'test-notification-person')));
  });

  it('lets a recipient mark a notification as read', async () => {
    const db = as(UID.employeeIt);
    await assertSucceeds(updateDoc(doc(db, 'notifications', 'test-notification-person'), { readBy: [UID.employeeIt] }));
  });

  it('blocks a recipient from rewriting a notification', async () => {
    const db = as(UID.employeeIt);
    await assertFails(updateDoc(doc(db, 'notifications', 'test-notification-person'), { title: 'Hijacked' }));
  });
});

describe('nfc cards', () => {
  beforeAll(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'nfcCards', 'AABBCCDDEEFF'), {
        id: 'AABBCCDDEEFF',
        employeeId: 'EMP001',
        employeeName: 'IT Employee',
        department: 'IT',
        cardType: 'mifare-classic-1k',
        assignedAt: new Date().toISOString(),
        assignedBy: UID.hr,
        isActive: true,
      });
    });
  });

  it('lets staff read the card list', async () => {
    const snap = await getDoc(doc(as(UID.headIt), 'nfcCards', 'AABBCCDDEEFF'));
    expect(snap.exists()).toBe(true);
  });

  it('blocks a Department Head from assigning a card in another department', async () => {
    const db = as(UID.headIt);
    await assertFails(
      setDoc(doc(db, 'nfcCards', '112233445566'), {
        id: '112233445566',
        employeeId: 'EMP002',
        employeeName: 'HR Employee',
        department: 'Human Resources',
        cardType: 'mifare-classic-1k',
        assignedAt: new Date().toISOString(),
        assignedBy: UID.headIt,
        isActive: true,
      }),
    );
  });

  it('blocks an Employee from assigning a card', async () => {
    const db = as(UID.employeeIt);
    await assertFails(
      setDoc(doc(db, 'nfcCards', '223344556677'), {
        id: '223344556677',
        employeeId: 'EMP001',
        employeeName: 'IT Employee',
        department: 'IT',
        cardType: 'mifare-classic-1k',
        assignedAt: new Date().toISOString(),
        assignedBy: UID.employeeIt,
        isActive: true,
      }),
    );
  });
});

describe('settings', () => {
  it('lets HR Staff write settings', async () => {
    const db = as(UID.hr);
    await assertSucceeds(setDoc(doc(db, 'settings', 'attendance'), { gracePeriodMinutes: 15 }));
  });

  it('blocks a Department Head from writing settings', async () => {
    const db = as(UID.headIt);
    await assertFails(setDoc(doc(db, 'settings', 'attendance'), { gracePeriodMinutes: 30 }));
  });

  it('lets any signed-in user read settings', async () => {
    const snap = await getDoc(doc(as(UID.employeeIt), 'settings', 'attendance'));
    expect(snap.exists()).toBe(true);
  });
});

describe('shift schedules', () => {
  const schedule = {
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

  it('lets HR Staff write a schedule', async () => {
    const db = as(UID.hr);
    await assertSucceeds(
      setDoc(doc(db, 'settings', 'attendance', 'shift_schedules', 'day'), schedule),
    );
  });

  it('blocks a Department Head from writing a schedule', async () => {
    const db = as(UID.headIt);
    await assertFails(
      setDoc(doc(db, 'settings', 'attendance', 'shift_schedules', 'day'), schedule),
    );
  });

  it('lets an employee read the schedules', async () => {
    const snap = await getDoc(
      doc(as(UID.employeeIt), 'settings', 'attendance', 'shift_schedules', 'day'),
    );
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.shiftName).toBe('Day Shift');
  });

  it('blocks an employee from writing a schedule', async () => {
    const db = as(UID.employeeIt);
    await assertFails(
      setDoc(doc(db, 'settings', 'attendance', 'shift_schedules', 'day'), schedule),
    );
  });
});
