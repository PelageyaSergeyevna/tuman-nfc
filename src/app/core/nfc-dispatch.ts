/**
 * Native NFC reader for this app.
 *
 * Android's reader mode is a single global slot on the NFC adapter. The
 * `@capgo/capacitor-nfc` plugin uses the callback variant, which some OEM
 * builds (OPPO/ColorOS) override for MIFARE Classic cards: they register their
 * own PendingIntent with the NFC service and swallow the card before the
 * callback fires.
 *
 * This plugin registers its own reader mode with a PendingIntent, which takes
 * the same slot, and reports the tag through the same event shape the Capgo
 * plugin uses.
 */
import { registerPlugin } from '@capacitor/core';
import type { NfcTag } from '@capgo/capacitor-nfc';

export interface TumanNfcDispatchPlugin {
  /** True when the native reader is available in this build. */
  ping(): Promise<void>;
  /**
   * Take the reader slot and start reporting tags.
   *
   * `mode` picks the delivery mechanism: `callback` (documented reader mode)
   * or `pending` (the older PendingIntent based reader mode, used on OEM
   * builds that hand MIFARE tags to their own card feature).
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
