/**
 * NFC scanning service.
 *
 * Two delivery paths are supported on Android:
 *
 * 1. Reader mode via `@capgo/capacitor-nfc` - the normal path.
 * 2. Foreground dispatch via the local `TumanNfcDispatch` plugin - a fallback
 *    for OEM builds that cancel reader mode and re-dispatch the tag as a
 *    `TAG_DISCOVERED` intent (OPPO/ColorOS does this).
 *
 * Both paths report the same tag, so they are merged into one stream and the
 * duplicates that occur when both paths fire for a single tap are filtered out.
 *
 * The card UID is the raw Mifare Classic identifier (`Tag.getId()`), which
 * the plugins expose as `tag.id` (an array of bytes). It is normalised to an
 * upper-case hex string, e.g. `A1B2C3D4`.
 */
import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorNfc, NfcEvent, NfcTag } from '@capgo/capacitor-nfc';

import { TumanNfcDispatch } from './nfc-dispatch';

export interface ScannedTag {
  /** Upper-case hex UID, e.g. `A1B2C3D4`. */
  uid: string;
  /** Android tech strings, e.g. `android.nfc.tech.MifareClassic`. */
  techTypes: string[];
  /** Human readable tag type, e.g. `MIFARE Classic`. */
  type: string | null;
  /** True when the tag is a Mifare Classic card. */
  isMifareClassic: boolean;
}

/**
 * Reader mode flags: NFC-A, NFC-B, NFC-F and NFC-V.
 *
 * The plugin's own default also sets FLAG_READER_NO_PLATFORM_SOUNDS, which
 * makes the scan completely silent; dropping that flag lets the phone give
 * its usual beep and vibration so the user knows the card was read.
 */
const READER_MODE_FLAGS = 0x1 | 0x2 | 0x4 | 0x8;

/** The same card can be reported twice; ignore a repeat within this window. */
const DUPLICATE_WINDOW_MS = 2000;

/** How long a scanned card stays usable for a cold start handover. */
export const PENDING_TAG_TTL_MS = 30000;

/** Convert the raw UID bytes to an upper-case hex string. */
export function bytesToHex(bytes: number[] | undefined): string {
  if (!bytes?.length) {
    return '';
  }
  return bytes.map((b) => (b & 0xff).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function isMifareClassicTag(techTypes: string[]): boolean {
  return techTypes.some((t) => t.toLowerCase().includes('mifareclassic'));
}

@Injectable({ providedIn: 'root' })
export class NfcService {
  /** The most recently scanned tag. */
  readonly lastTag = signal<ScannedTag | null>(null);

  /** When the most recent tag was scanned (epoch milliseconds). */
  readonly lastTagAt = signal(0);

  readonly scanning = signal(false);

  readonly error = signal<string | null>(null);

  private listener: { remove: () => Promise<void> } | null = null;
  private dispatchListener: { remove: () => Promise<void> } | null = null;
  private readonly subscribers = new Set<(tag: ScannedTag) => void>();
  private lastUid = '';
  private lastUidAt = 0;

  constructor() {
    void this.attachDispatchListener();
  }

  /** True when running inside the native Android shell. */
  get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /** True when the device has NFC hardware. */
  async isSupported(): Promise<boolean> {
    if (!this.isNative) {
      return false;
    }
    try {
      const result = await CapacitorNfc.isSupported();
      return !!result.supported;
    } catch {
      return false;
    }
  }

  /**
   * True when the NFC adapter is present *and* switched on.
   * `NFC_OK` is the only status that means the radio is usable.
   */
  async isEnabled(): Promise<boolean> {
    if (!this.isNative) {
      return false;
    }
    try {
      const result = await CapacitorNfc.getStatus();
      return result.status === 'NFC_OK';
    } catch {
      return false;
    }
  }

  /** Open the system settings page so the user can switch NFC on. */
  async openSettings(): Promise<void> {
    if (!this.isNative) {
      return;
    }
    try {
      await CapacitorNfc.showSettings();
    } catch {
      /* ignored — not every device exposes the settings screen */
    }
  }

  /**
   * Listen for scanned cards from any delivery path.
   *
   * Returns a function that removes the listener again.
   */
  subscribe(onTag: (tag: ScannedTag) => void): () => void {
    this.subscribers.add(onTag);
    return () => {
      this.subscribers.delete(onTag);
    };
  }

  /**
   * Take the card that was scanned while nobody was listening, e.g. when the
   * app was opened by the tap itself. Returns `null` when there is no fresh
   * card.
   */
  takePendingTag(): ScannedTag | null {
    const tag = this.lastTag();
    if (!tag || Date.now() - this.lastTagAt() > PENDING_TAG_TTL_MS) {
      return null;
    }
    this.lastTag.set(null);
    this.lastTagAt.set(0);
    return tag;
  }

  /**
   * Start scanning.
   *
   * The native reader (our own reader mode) is preferred because it owns the
   * adapter slot that OEM builds hand to their own card features. The Capgo
   * plugin is only used as a fallback.
   *
   * Calling this while the reader is already armed does nothing, so it can be
   * called from several places (the app shell and the scanner page).
   */
  async startScanning(onTag?: (tag: ScannedTag) => void): Promise<void> {
    if (!this.isNative) {
      throw new Error('NFC scanning is only available in the Android app.');
    }
    this.error.set(null);

    if (onTag) {
      this.subscribe(onTag);
    }

    if (this.scanning()) {
      return;
    }

    if (!(await this.isSupported())) {
      throw new Error('This device does not have NFC hardware.');
    }
    if (!(await this.isEnabled())) {
      throw new Error('NFC is switched off. Turn it on and try again.');
    }

    this.listener = await CapacitorNfc.addListener('tagDiscovered', (event: NfcEvent) => {
      const tag = this.toScannedTag(event.tag);
      if (tag) {
        this.acceptTag(tag);
      }
    });

    try {
      await TumanNfcDispatch.startScanning({
        androidReaderModeFlags: READER_MODE_FLAGS,
      });
    } catch {
      // Fall back to the plugin's own reader mode.
      await CapacitorNfc.startScanning({
        androidReaderModeFlags: READER_MODE_FLAGS,
      });
    }

    this.scanning.set(true);
  }

  /** Stop scanning and release the reader mode. */
  async stopScanning(): Promise<void> {
    if (this.listener) {
      await this.listener.remove();
      this.listener = null;
    }
    if (this.isNative) {
      try {
        await TumanNfcDispatch.stopScanning();
      } catch {
        /* ignored - nothing to stop */
      }
      try {
        await CapacitorNfc.stopScanning();
      } catch {
        /* ignored - nothing to stop */
      }
    }
    this.scanning.set(false);
  }

  /**
   * Listen for the OEM dispatch fallback. The native side keeps the tag until
   * a listener exists, so a card that opened the app is not lost.
   */
  private async attachDispatchListener(): Promise<void> {
    if (!this.isNative) {
      return;
    }
    try {
      this.dispatchListener = await TumanNfcDispatch.addListener('tagDiscovered', (event) => {
        const tag = this.toScannedTag(event.tag);
        if (tag) {
          this.acceptTag(tag);
        }
      });
    } catch {
      /* ignored — builds without the native fallback use reader mode only */
    }
  }

  /** Record a scanned card and hand it to every listener. */
  private acceptTag(tag: ScannedTag): void {
    const now = Date.now();
    if (tag.uid === this.lastUid && now - this.lastUidAt < DUPLICATE_WINDOW_MS) {
      return;
    }
    this.lastUid = tag.uid;
    this.lastUidAt = now;
    this.lastTag.set(tag);
    this.lastTagAt.set(now);

    for (const subscriber of [...this.subscribers]) {
      subscriber(tag);
    }
  }

  private toScannedTag(tag: NfcTag | undefined): ScannedTag | null {
    const uid = bytesToHex(tag?.id);
    if (!uid) {
      return null;
    }
    const techTypes = tag?.techTypes ?? [];
    return {
      uid,
      techTypes,
      type: tag?.type ?? null,
      isMifareClassic: isMifareClassicTag(techTypes),
    };
  }
}
