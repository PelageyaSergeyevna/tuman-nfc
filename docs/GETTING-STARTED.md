# Getting Started — TUMAN NFC

A complete, step-by-step guide to opening and running the TUMAN NFC attendance
system. No prior Firebase or Angular knowledge is assumed.

You have **two ways** to run this. Pick one:

- **[Path A — Use the live site](#path-a--use-the-live-site-no-setup)** — fastest.
  Nothing to install. Opens in a browser and connects to an existing Firebase backend.
- **[Path B — Run it on your own computer](#path-b--run-it-on-your-own-computer)** —
  the full source code, running locally. Two sub-options:
  - **[B-1 — Against the live backend](#b-1--run-locally-against-the-live-backend)** (no backend setup)
  - **[B-2 — Fully offline](#b-2--run-fully-offline-emulators)** (no internet, no Firebase account)

> **What this app is.** An attendance system for a company. HR staff, department
> heads and employees use it to record and review daily attendance. There is also
> an Android app that scans NFC cards — see the note at the end.

> **A word on the database.** This app uses **Firebase Firestore**, which is a
> NoSQL (document) database — **not** a SQL/MySQL database. There is no `.sql`
> file the app runs on. If you want to see the data *structure* in a familiar
> table form, read [`docs/tuman-nfc-schema.sql`](tuman-nfc-schema.sql) — it is a
> documentation-only rendering of the same model. See
> [The database, explained](#the-database-explained) below.

---

## What you need

| Path | Requirements |
| --- | --- |
| A — Live site | A modern browser (Chrome, Edge, Firefox, Brave, Safari). That's it. |
| B — Local run | **Node.js 22** and npm. (JDK 21 + Android SDK only if you build the Android app.) |

---

## Path A — Use the live site (no setup)

The app is already deployed and already connected to its backend.

1. Open this URL in your browser:

   ```
   https://tuman-nfc.web.app
   ```

2. On the sign-in page, click one of the **demo accounts** to auto-fill it, or
   type the email and password yourself. The password for all of them is
   `Tuman123`.

   | Role | Email | Password | What it can see |
   | --- | --- | --- | --- |
   | HR Staff | `maria.reyes@tuman.local` | `Tuman123` | All departments (full access) |
   | Department Head | `jose.cruz@tuman.local` | `Tuman123` | IT department only |
   | Employee | `ana.ramos@tuman.local` | `Tuman123` | Their own records only |

3. You are in. Explore the sidebar: **Dashboard, Attendance Records, Correction
   Requests, NFC Cards, Employee Directory, My Profile**.

That's the whole thing — no install, no configuration, no backend to set up. The
page and its data live on Google's servers, so nothing on this computer needs to
stay running.

---

## Path B — Run it on your own computer

This uses the source code in this folder.

### B-0. Check Node.js

Open a terminal in this folder and run:

```bash
node --version
```

You need **v22.x** (or at least v20). If the command is missing or shows an older
version, install Node 22 from <https://nodejs.org> and reopen the terminal.

### B-0b. Install dependencies (do this once)

```bash
npm install
```

This downloads everything the app needs into a `node_modules/` folder. It can take
a few minutes. You do not need to repeat it unless `package.json` changes.

---

### B-1 — Run locally against the live backend

Use this if you have internet and want the app to show the **same real data** the
live site shows. No Firebase account or setup needed — the configuration for the
live backend is already built into the app.

> ⚠️ **Important:** do **not** use `npm start` for this. The development server
> (`npm start`) is wired to the *offline emulators* (Path B-2), so it would show
> an empty local database instead of the live one. Build in **production mode**
> instead:

1. Build the production bundle:

   ```bash
   npm run build:web
   ```

   This creates a `www/` folder.

2. Serve that folder. Any static file server works; the simplest is:

   ```bash
   npx http-server www -p 8080 -c-1
   ```

3. Open <http://localhost:8080> and sign in with a demo account (same table as
   Path A, password `Tuman123`).

You are now running the app on your own machine, talking to the live backend.

---

### B-2 — Run fully offline (emulators)

Use this if you have **no internet** or want a **self-contained sandbox**. The app
runs against a local look-alike of Firebase that lives entirely on this computer.
Nothing is sent anywhere.

You need **two terminals**.

**Terminal 1 — start the local backend:**

```bash
npm run emulators
```

Wait until it prints that the Emulator UI is ready. It serves:

| Service | Address |
| --- | --- |
| Auth emulator | <http://127.0.0.1:9099> |
| Firestore emulator | <http://127.0.0.1:8080> |
| Emulator UI (a console to browse data) | <http://127.0.0.1:4000> |
| Hosting emulator | <http://127.0.0.1:5000> |

**Terminal 2 — put data into it, then run the app:**

```bash
npm run seed:emulator     # creates the demo users, shifts, attendance, NFC cards
npm start                 # http://localhost:8100
```

Open <http://localhost:8100> and sign in with a demo account (password
`Tuman123`). You can watch the data appear live in the Emulator UI at
<http://127.0.0.1:4000>.

To stop, press `Ctrl+C` in both terminals.

> The seed also tries to import some legacy attendance history from a sibling
> project folder. That folder is not included here, and the seed **handles its
> absence gracefully** — it simply skips those rows and still creates the demo
> users, shifts, recent attendance and NFC cards.

---

## Which path should I use?

| You want to… | Use |
| --- | --- |
| Just see the app working, fastest | **Path A** |
| Run the code yourself, against real data | **B-1** |
| Run with no internet / a private sandbox | **B-2** |
| Change the code and see your changes | **B-2** (edit files, `npm start` reloads automatically) |

---

## The database, explained

This app does **not** use SQL, MySQL, PostgreSQL, or any relational database.
It uses **Firebase Firestore**, a NoSQL document store. Data is organised into
*collections* of *documents* (think JSON objects), not tables of rows and
columns. Access is controlled by `firestore.rules`, and indexes are declared in
`firestore.indexes.json` — there is no schema-creation step and no migrations.

The collections are:

`users`, `attendance`, `nfcCards`, `archiveRequests`, `correctionRequests`,
`notifications`, `settings` (with a `shift_schedules` subcollection).

If you would like to see this model in familiar **table form** — for
documentation and review only — open
[`docs/tuman-nfc-schema.sql`](tuman-nfc-schema.sql). It shows one `CREATE TABLE`
per collection, with columns, types, keys and a few sample rows. Read its header:
it is a **rendering** of the Firestore model, not a database the app runs on.

---

## Tests (optional)

The project ships with automated tests. To run them:

```bash
npm run test:unit      # attendance/shift logic (no backend needed)
npm run lint           # code style checks
npm run test:rules     # security-rule tests — needs `npm run emulators` running first
```

---

## About the Android / NFC app (optional)

This project also builds an **Android app** whose job is to scan **NFC card
taps** to open an employee's record.

- It requires an **Android phone with NFC** and a physical NFC card to be useful.
- It cannot be exercised on a desktop computer — there is nothing to tap.
- For reviewing and grading the *software*, the **PWA (Paths A and B) is
  sufficient**; the Android half is optional.

Building the Android app additionally needs **JDK 21** and the **Android SDK**.
See [`docs/ANDROID-BUILD.md`](ANDROID-BUILD.md) for the details.

### Install the ready-made APK (no build needed)

A prebuilt APK is included in this repository as **`tuman-nfc-debug.apk`**
(in the project root). You do **not** need Android Studio, the SDK, or a build
step to use it — just an Android phone.

> **Requirements:** an **Android phone with NFC**. The APK's only extra job over
> the PWA is to read NFC card taps, so without NFC hardware it is no different
> from opening the website.

**Install it:**

1. Copy `tuman-nfc-debug.apk` to the phone (USB cable, email, cloud drive, or
   download it directly from the GitHub repository on the phone).
2. On the phone, open the file. Android will warn that it is from an *unknown
   source* — this is expected for any app not installed from the Play Store.
   Allow the install when prompted (Settings → *Install unknown apps* for your
   browser or file manager, if asked).
3. Open the **Tuman Attendance** app.
4. Sign in with a template account — the same ones the website uses, password
   `Tuman123`:

   | Role | Email | Password |
   | --- | --- | --- |
   | HR Staff | `maria.reyes@tuman.local` | `Tuman123` |
   | Department Head | `jose.cruz@tuman.local` | `Tuman123` |
   | Employee | `ana.ramos@tuman.local` | `Tuman123` |

5. Tap **Scan** in the menu, hold an NFC card against the back of the phone, and
   the matching employee's record opens.

**Things to know about this APK:**

- It is a **debug build** — intended for testing and demonstration, not for
  publishing to a store. The "unknown source" warning above is normal.
- It connects to the **same live backend** as the website, so the data it shows
  is the same. It needs an internet connection to load data.
- It is a **snapshot**: it reflects the code at the time it was built. If the
  source changes later, this APK will not include those changes until it is
  rebuilt (see [`docs/ANDROID-BUILD.md`](ANDROID-BUILD.md)).

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `npm start` shows an empty app with no data | You are on the emulator config with no emulators running. Use **B-1** (`npm run build:web`) for live data, or start the emulators (**B-2**) first. |
| Sign-in fails with "wrong password" | Use exactly `Tuman123`. Emails end in `@tuman.local`. |
| `npm run emulators` errors about Java | `firebase-tools` needs **JDK 21** installed and on your `PATH`. |
| Nothing loads at `localhost:8080` after `npm run build:web` | The build finished but no server is running. Run the `npx http-server www` command in step 2. |
| Port already in use | Another process holds 8080/8100/9099. Stop it, or change the port in the command. |

---

## Quick reference

```bash
# Path A:   open https://tuman-nfc.web.app

# Path B-1: live data, local machine
npm install
npm run build:web
npx http-server www -p 8080 -c-1      # -> http://localhost:8080

# Path B-2: fully offline (two terminals)
npm run emulators                      # terminal 1
npm run seed:emulator && npm start     # terminal 2 -> http://localhost:8100

# Android phone (with NFC): install tuman-nfc-debug.apk, then sign in below

# Demo logins (password: Tuman123)
#   maria.reyes@tuman.local   (HR Staff)
#   jose.cruz@tuman.local     (Department Head)
#   ana.ramos@tuman.local     (Employee)
```
