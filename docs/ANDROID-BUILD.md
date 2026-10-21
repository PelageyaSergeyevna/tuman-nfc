# Building and installing the Android app

The native shell is a Capacitor project in `android/`. It wraps the same PWA
build that is served to browsers, and adds the NFC reader.

---

## Requirements

| Tool | Version |
| --- | --- |
| JDK | 21 (Capacitor 8 / AGP 8.13 need it) |
| Android SDK | platform **36**, build-tools 35+, platform-tools |
| Node | 22 |

Local env (already set up in this machine's `~/.tuman-env.sh`):

```bash
export JAVA_HOME="$HOME/opt/jdk-21.0.12.1+1"
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$HOME/opt/node-v22.23.3-linux-x64/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$JAVA_HOME/bin:$PATH"
```

## Build a debug APK

```bash
npm run build            # the PWA build -> www/
npx cap sync android     # copy www/ + plugins + capacitor.config.json
cd android
./gradlew assembleDebug
```

Result:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected device:

```bash
adb devices                              # the device must be listed
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

or install by hand: copy the APK to the phone and open it (allow "install from
unknown sources").

## Build a release APK

```bash
cd android
./gradlew assembleRelease
```

The result is unsigned. To sign it, create a keystore and a `signingConfigs`
entry in `android/app/build.gradle`:

```bash
keytool -genkey -v -keystore tuman-release.keystore \
  -alias tuman -keyalg RSA -keysize 2048 -validity 10000
```

```gradle
android {
  signingConfigs {
    release {
      storeFile file('tuman-release.keystore')
      storePassword System.getenv('TUMAN_STORE_PASSWORD')
      keyAlias 'tuman'
      keyPassword System.getenv('TUMAN_KEY_PASSWORD')
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
      minifyEnabled true
      proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
  }
}
```

Keep the keystore and the passwords out of git.

---

## NFC

### Permissions

`android/app/src/main/AndroidManifest.xml` declares:

```xml
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

- `NFC` is a **normal** permission — it is granted at install time, there is no
  runtime prompt.
- The feature is declared **optional**, so the app still installs on devices
  without NFC hardware. Those devices get the record-keeping part of the app
  and the scanner screen reports that the hardware is missing.

### How the scan works

`@capgo/capacitor-nfc` puts the NFC reader in **reader mode** while the scanner
screen is open, so no other app can read the tag in the meantime.

1. The user opens **NFC Scanner** (HR Staff and Department Heads only).
2. `NfcService.startScanning()` checks that the adapter exists
   (`isSupported()`) and is switched on (`getStatus() === 'NFC_OK'`); if it is
   off, the app offers a button that opens the system NFC settings.
3. On `tagDiscovered` the raw UID bytes (`tag.id`) are converted to an
   upper-case hex string, e.g. `A1B2C3D4` — this is the document id in the
   `nfcCards` collection.
4. The card is looked up in Firestore and the linked employee is opened.

### Card preparation

The UID is the one the phone reads from the tag, so a card must be registered
exactly as the phone sees it:

1. Open **NFC Cards** → **Scan card** (or scan with the scanner screen) to read
   the UID of the physical card.
2. Assign that UID to an employee of your own department.

Cards are not written to — the app only reads the UID. Any NFC-A/B card with a
stable UID works; Mifare Classic (1K/4K) is the intended target.

> **UID length.** Mifare Classic tags have a 4-byte UID (8 hex characters),
> but the app stores whatever the hardware reports, so 7-byte UID tags work as
> well.

---

## App identity

| | |
| --- | --- |
| Application id | `io.tuman.attendance` |
| App name | Tuman Attendance |
| Launcher icon | `android/app/src/main/res/mipmap-*/ic_launcher.png` (+ adaptive icon) |

Both are set in `capacitor.config.ts` and `android/app/src/main/res/values/strings.xml`.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `SDK location not found` | `export ANDROID_HOME=~/Android/Sdk` |
| `Failed to find target with hash string 'android-36'` | `sdkmanager "platforms;android-36" "build-tools;35.0.0"` |
| `Unsupported class file major version` | a wrong JDK is active — check `java -version` (needs 21) |
| Scanner says "NFC is switched off" | enable NFC in the system settings; the app can open that screen for you |
| Scanner never fires | another app may still hold reader mode — close it and reopen the scanner |
| App shows the login screen but no data | the build still points at the emulators — the production build must be made with `npm run build` (which uses `environment.prod.ts`) |
