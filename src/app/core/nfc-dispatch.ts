/**
 * Native NFC reader for this app.
 *
 * Android's reader mode is a single global adapter slot. The Capgo plugin's
 * callback variant is swallowed on some OEM builds (OPPO/ColorOS) that hand
 * MIFARE cards to their own card feature. This plugin takes the same slot with
 * its own PendingIntent and reports tags in the Capgo event shape.
 */
import { registerPlugin } from '@capacitor/core';
import type { NfcTag } from '@capgo/capacitor-nfc';

export interface TumanNfcDispatchPlugin {
  /** Resolves when the native reader is available in this build. */
  ping(): Promise<void>;
  /**
   * Take the reader slot and start reporting tags. `mode` picks `callback`
   * (documented reader mode) or `pending` (PendingIntent, for OEM builds).
   */
  startScanning(options?: { androidReaderModeFlags?: number; mode?: 'callback' | 'pending' }): Promise<void>;
  /** Release the reader slot. */
  stopScanning(): Promise<void>;
  /** True while this plugin owns the reader slot. */
  isScanning(): Promise<boolean>;
  addListener(
    eventName: 'tagDiscovered',
    listenerFunc: (event: { tag: NfcTag }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const TumanNfcDispatch = registerPlugin<TumanNfcDispatchPlugin>('TumanNfcDispatch');
