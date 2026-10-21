# Firebase Spark (free tier) setup checklist

The app only needs **Firebase Authentication**, **Cloud Firestore** and
**Firebase Hosting**. No Cloud Functions, no Cloud Run, no Blaze plan.

Estimated effort: 20–30 minutes, most of it clicking in the console.

---

## 1. Create the project

1. Open <https://console.firebase.google.com>.
2. **Add project** → name it (e.g. `tuman-attendance`) → **Google Analytics off**
   → **Create**.
3. Stay on the **Spark (free)** plan. Everything below works on it.

> The project id (not the display name) is what the app and the CLI use. It is
> shown in **Project settings → General → Project ID** and usually looks like
> `tuman-attendance-12345`.

## 2. Register the web app

**Project settings → Your apps → Web → </> (Firebase SDK)**:

- App nickname: `Tuman Attendance`
- Do **not** tick "Also set up Firebase Hosting" here — the CLI does it later.
- Copy the `firebaseConfig` object — this is what goes into
  `src/environments/environment.prod.ts`:

```ts
export const environment = {
  production: true,
  useEmulators: false,
  firebase: {
    apiKey: 'AIza...',
    authDomain: 'tuman-attendance-12345.firebaseapp.com',
    projectId: 'tuman-attendance-12345',
    storageBucket: 'tuman-attendance-12345.appspot.com',
    messagingSenderId: '123456789',
    appId: '1:123456789:web:abcdef',
  },
  emulator: { /* not used in production */ },
};
```

## 3. Turn on Authentication

**Authentication → Sign-in method → Email/Password → Enable → Save**.

No other provider is used. (Google sign-in can be added later — the client
would only have to pass the additional provider to `signInWithPopup`.)

## 4. Create the Firestore database

**Firestore Database → Create database**:

- Location: pick the region closest to the users.
- Mode: **Production mode** (the rules deployed in step 6 replace the default
  deny-all rules anyway).

## 5. Point the CLI at the project

```bash
firebase login
firebase use --add          # pick the project from the list
```

Or edit `.firebaserc`:

```json
{
  "projects": {
    "default": "tuman-attendance-12345"
  }
}
```

## 6. Deploy the rules and the indexes

```bash
npm run deploy:rules       # firestore:rules + firestore:indexes
```

The composite indexes in `firestore.indexes.json` cover the attendance queries
(department + date, employee + date, archived + date …). Firestore builds them
in the background and prints the state of each one.

## 7. Seed the first users

The seed script creates the Auth accounts and the matching `users/{uid}`
profiles:

```bash
npm run seed                       # against the real project
```

It is idempotent — existing accounts are updated, not duplicated.

**Change the password immediately.** The script seeds the legacy demo password
`Tuman123`; edit `tools/seed.mjs` (`DEFAULT_PASSWORD`) before running it against
a real project, or change the passwords afterwards in the Firebase console.

Seeded accounts:

| Role | Email | Department |
| --- | --- | --- |
| HR Staff | `maria.reyes@tuman.local` | Human Resources |
| Department Head | `jose.cruz@tuman.local` | IT |
| Department Head | `ricardo.santiago@tuman.local` | Operations |
| Employee | `ana.ramos@tuman.local` | IT |
| Employee | `paolo.dela.cruz@tuman.local` | IT |
| Employee | `kristine.lim@tuman.local` | Human Resources |
| Employee | `grace.aquino@tuman.local` | Finance |
| Employee | `daniel.villanueva@tuman.local` | Finance |

## 8. Build and deploy the PWA

```bash
npm run build
npm run deploy:hosting
```

`firebase.json` already points Hosting at `www/` and rewrites every path to
`index.html` so the Angular router works on a hard refresh. The service worker
(`ngsw-worker.js`) and `ngsw.json` are served with `Cache-Control: no-cache` so
updates are picked up immediately.

The live URL is shown after the deploy and also listed under
**Hosting → Your sites**.

## 9. Check it works

1. Open the Hosting URL and sign in as `maria.reyes@tuman.local`.
2. Open **Attendance Records** — the HR account sees every department.
3. Sign in as `ana.ramos@tuman.local` — only her own records are listed and the
   scanner / directory / shifts entries disappear from the menu.
4. Try a write from the browser console with a non-privileged token — it must be
   rejected by the rules, not by the UI.

---

## Optional: Firebase Authentication domains

**Authentication → Settings → Authorized domains**: add your Hosting domain
(`tuman-attendance-12345.web.app`) and any custom domain. The default
`localhost` and the Firebase Hosting domains are pre-authorised.

---

## Cost notes (Spark)

- Firestore: 50k reads / 20k writes / 1 GB stored per day.
- Auth: unlimited email/password users.
- Hosting: 10 GB storage, 360 MB/day transfer.
- The rules read the caller's profile with `get()` for every evaluated
  document. For a full-day attendance list of a few hundred records this stays
  comfortably inside the free quota, but it is worth watching the usage tab
  during the first month.
