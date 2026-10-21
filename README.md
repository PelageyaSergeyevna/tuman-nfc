# Tuman Attendance — Hybrid

A hybrid Tuman attendance app:

- **Android app** (Capacitor + Ionic) that scans **NFC Mifare Classic tags** to
  open an employee's attendance record.
- **PWA** (installable, offline-capable) for keeping attendance records, reviewing
  archive and correction requests, managing NFC cards, the employee directory and
  shift schedules.
- **Firebase (Spark plan)**: Auth + Firestore + Hosting. **No Cloud Functions** —
  every workflow is implemented in the client and enforced by Firestore Security
  Rules.

The look and feel is ported from the legacy Tuman web app (dark navbar, green
brand colour, plain data tables, badge-style attendance statuses).

---

## Stack

| Layer | Choice |
| --- | --- |
| UI | Angular 22 (standalone, zoneless) + Ionic 9 |
| Native | Capacitor 8 + `@capgo/capacitor-nfc` 8 |
| Backend | Firebase Auth + Firestore (v13 JS SDK), Firebase Hosting |
| Rules | `firestore.rules` — the real enforcement point |
| Tests | Vitest: `@angular/build:unit-test` (app units) + `@firebase/rules-unit-testing` (rules) |

---

## Roles and access model

| Capability | HR Staff | Department Head | Employee |
| --- | :---: | :---: | :---: |
| Read attendance | all departments | own department | own records |
| Write attendance | own department | own department | — |
| Archive record | own department, directly | **not allowed** | — |
| Approve archive requests | any department | — | — |
| Review correction requests | any department | own department | — |
| File correction request | yes | yes | own records |
| Manage NFC cards | yes | own department | — |
| Manage employees / shifts | yes | — | — |
| Use the NFC scanner | yes | yes | — |

Nobody can delete an attendance record — records are **archived** instead.

**Department Heads cannot archive.** They raise an *archive request*; only HR
Staff can approve it, and only then is the record archived. The same two-step
shape applies to corrections: the request is filed first, reviewed, and only an
approved request may be written back onto the attendance record.

See [`docs/ACCESS-MODEL.md`](docs/ACCESS-MODEL.md) for the full rules walk-through.

---

## Project layout

```
src/app/
  core/           services, guards, models, pure shift logic
  pages/          login, dashboard, records, approvals, corrections,
                  scan, cards, directory, shifts, profile
  shared/         reusable components
tools/
  seed.mjs                seeds Auth users + Firestore data
  firestore.rules.spec.ts security-rules integration tests (52 tests)
firestore.rules          the access model
firestore.indexes.json   composite indexes
ngsw-config.json          PWA service-worker configuration
```

---

## Local development

### 1. Prerequisites

- Node 22
- JDK 21 (`firebase-tools` ≥ 14 and Capacitor 8 both need it)
- Android SDK (platform 36) for the native build

### 2. Install

```bash
npm install
```

### 3. Run the emulators + seed the demo data

```bash
npm run emulators        # auth :9099, firestore :8080, hosting :5000, UI :4000
npm run seed:emulator    # 8 users, 2 shifts, 265 attendance records, 6 NFC cards
```

The seeded demo accounts (password `Tuman123`):

| Role | Email | Scope |
| --- | --- | --- |
| HR Staff | `maria.reyes@tuman.local` | Human Resources |
| Department Head | `jose.cruz@tuman.local` | IT |
| Employee | `ana.ramos@tuman.local` | IT |

### 4. Run the app

```bash
npm start                # http://localhost:8100
```

`src/environments/environment.ts` points at the emulators, so the app talks to
the local stack with the real security rules.

---

## Tests

```bash
npm run test:unit        # 26 unit tests for the shift / attendance logic
npm run test:rules       # 52 integration tests for firestore.rules
npm run lint             # ESLint (angular-eslint)
```

The rules suite needs the emulators running (`npm run emulators`); the unit
suite does not.

---

## Production build

```bash
npm run build            # -> www/  (PWA with service worker + manifest)
npm run deploy:hosting   # build + firebase deploy --only hosting
npm run deploy:rules     # firebase deploy --only firestore:rules,firestore:indexes
```

Set the real Firebase configuration in `src/environments/environment.prod.ts`
first — see [`docs/FIREBASE-SPARK-SETUP.md`](docs/FIREBASE-SPARK-SETUP.md).

---

## Android

```bash
npm run android:sync     # build the PWA + cap sync android
npm run android:apk      # cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Details, NFC notes and release signing: [`docs/ANDROID-BUILD.md`](docs/ANDROID-BUILD.md).

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md) | **Start here** — step-by-step guide to open and run the app (live site, local, or offline) |
| [`docs/ACCESS-MODEL.md`](docs/ACCESS-MODEL.md) | Roles, workflows and how the security rules enforce them |
| [`docs/FIREBASE-SPARK-SETUP.md`](docs/FIREBASE-SPARK-SETUP.md) | Step-by-step Spark (free tier) setup checklist |
| [`docs/ANDROID-BUILD.md`](docs/ANDROID-BUILD.md) | Build, install and release the Android app |
| [`docs/tuman-nfc-schema.sql`](docs/tuman-nfc-schema.sql) | The data model rendered as SQL tables (documentation only — the app uses Firestore) |
