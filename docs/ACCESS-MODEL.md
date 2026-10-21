# Access model

The Firestore Security Rules (`firestore.rules`) are the **only** enforcement
point. The Angular `PermissionsService` mirrors the same matrix so the UI can
hide actions the user cannot perform — but a user who bypasses the UI is still
stopped by the backend.

The rules are covered by `tools/firestore.rules.spec.ts` (52 integration tests
against the emulator).

---

## Roles

| Role | `users.role` | Meaning |
| --- | --- | --- |
| HR Staff | `hr` | Office of Human Resources — sees every department |
| Department Head | `manager` | Manages one department |
| Employee | `employee` | Records their own attendance |

The role lives in the signed-in user's own profile document
(`users/{uid}`), which the rules read with `get()`:

```rules
function me() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
}
function isHR()   { return myRole() == 'hr'; }
function isHead() { return myRole() == 'manager'; }
```

Every document access is counted against the rules limit of **10 `get()`/
`exists()` calls per request**; because the same document is read repeatedly it
is served from the rules cache, so a rule set evaluation touches at most three
documents (the user's profile, one archive request, one correction request).

---

## Read access

```rules
function canReadAttendance(d) {
  return isHR()
    || (isHead() && d.department == myDept())
    || (isEmployee() && d.employeeId == myEmployeeId());
}
```

- **HR Staff** reads every department.
- **Department Head** reads their own department only.
- **Employee** reads only records that carry their own `employeeId`.

The same shape applies to `users`, `archiveRequests` and `correctionRequests`
through `canReadUser()`, `canReadArchiveRequest()` and
`canReadCorrectionRequest()`.

---

## Write access

### Opening a record

```rules
allow create: if isSignedIn()
  && isStaff()
  && request.resource.data.department == myDept()
  && request.resource.data.archived == false
  && request.resource.data.employeeId is string
  && request.resource.data.date is string;
```

HR Staff and Department Heads may only open records **inside their own
department**, and a record is never born archived. The identity fields
(`employeeId`, `date`, `department`) can never be rewritten — see
`identityUnchanged()`.

### Editing the content of a record

Branch **(A1)** of the update rule lets staff edit the content of a record in
their own department, with the archive fields explicitly excluded:

```rules
(isStaff()
  && resource.data.department == myDept()
  && resource.data.archived == false
  && !touchesArchiveFields())
```

---

## The archive workflow

> **A Department Head can never archive a record.** They have to ask HR Staff
> for approval first.

```
 Dept Head / HR          collection: archiveRequests          HR Staff
      │                          │                                 │
      │  create request          │                                 │
      ├─────────────────────────►│  status = "pending"             │
      │                          │                                 │
      │                          │   review (approve / reject)     │
      │                          │◄────────────────────────────────┤
      │                          │  status = "approved"            │
      │                          │                                 │
      │                          │      apply the archive          │
      │                          │  (writes archived, archivedAt,  │
      │                          │   archivedBy, archiveReason,   │
      │                           archiveRequestId)               │
      │                          │◄────────────────────────────────┤
```

The rules only accept the archive write when a matching **approved** request
exists and points at exactly this record:

```rules
function hasApprovedArchiveRequest() {
  return request.resource.data.archiveRequestId is string
    && exists(/databases/$(database)/documents/archiveRequests/$(request.resource.data.archiveRequestId))
    && get(...).data.status == 'approved'
    && get(...).data.attendanceId == resource.id
    && get(...).data.department == resource.data.department;
}
```

The order matters: **approve the request first, then write the archive fields
onto the attendance record.** The reverse order is rejected, because the
`archiveRequestId` written onto the record would point at a request that is
still `pending`.

Archive writes may only touch the archive fields plus the bookkeeping
timestamp:

```rules
function archiveWriteSet() {
  return ['archived', 'archivedAt', 'archivedBy', 'archivedByName',
          'archiveReason', 'archiveRequestId', 'updatedAt'];
}
```

> Firestore rules have **no list concatenation operator** — `list + list` fails
> with `Unsupported operation error. Received: list + list`. Every field set is
> therefore written out in full.

**Attendance records are never deleted.** `allow delete: if false;` — archiving
replaces deletion.

---

## The correction workflow

```
 Employee / staff          collection: correctionRequests      reviewer
      │                          │                          (HR or the
      │  file request            │                           dept head)
      ├─────────────────────────►│  status = "pending"              │
      │                          │◄────────────────────────────────┤
      │                          │  status = "approved"             │
      │                          │                                 │
      │                          │  apply the correction           │
      │                          │  (writes status, timeIn, timeOut,│
      │                          │   lateMinutes, notes,           │
      │                          │   correctionRequestId)          │
      │                          │◄────────────────────────────────┤
```

The reviewer is HR Staff (any department) or the Department Head of the
department the record belongs to. The correction may only be applied to a
record that is **not archived**:

```rules
function canApplyApprovedCorrection() {
  return isHR()
    && resource.data.department != myDept()
    && resource.data.archived == false
    && correctionFieldsOnly()
    && hasApprovedCorrectionRequest();
}
```

An archived record is frozen — corrections on it must be un-archived by HR
first.

---

## Shift schedules

`settings/attendance/shift_schedules/{id}` holds the two legacy schedules
(`day` 08:00–17:00 and `night` 18:00–06:00, both with a 15-minute grace
period and a meal break).

```rules
match /settings/{settingId}/shift_schedules/{scheduleId} {
  allow read: if isSignedIn();
  allow write: if isHR();
}
```

Every signed-in user reads the schedules (the scanner and the record editor
need the active shift), but only HR Staff may change them. The parent
document `settings/attendance` carries the attendance policy
(`gracePeriodMinutes`, `archiveRequiresApproval`, `correctionRequiresApproval`).

---

## NFC cards

`nfcCards/{cardId}` holds the mapping between a tag UID and an employee.

- HR Staff and Department Heads may **assign** a card, but only inside their own
  department (`request.resource.data.department == myDept()`).
- A card may only be released by staff of the owning department.
- Employees may **read** their own card, but never assign or release one.

The scanner turns the raw tag UID (a byte array) into an uppercase hex string
before it is used as the document id — see `src/app/core/nfc.service.ts`.

---

## Notifications

`notifications/{id}` is addressed either to a role or to a single employee:

```rules
function isNotificationRecipient(n) {
  return (n.recipientRole != null && n.recipientRole == myRole())
    || (n.recipientEmployeeId != null && n.recipientEmployeeId == myEmployeeId());
}
```

Only the `readBy` bookkeeping may be updated by a recipient; staff may create
and delete notifications.

---

## Testing the rules

```bash
npm run emulators
npm run test:rules
```

The suite creates its own fixtures with `withSecurityRulesDisabled` and cleans
them up afterwards, so it can be re-run any number of times.

> **Emulator note.** firebase-tools 15.x reports a comparison against a
> `get()`-derived value that evaluates to `false` as an *evaluation error*
> instead of `false`. The runtime treats it as `false` inside `&&`, `||` and
> `!`, so the allow/deny outcome is identical to production — only the
> wording of the denial differs.
