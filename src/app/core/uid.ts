/**
 * NFC card UID helpers.
 *
 * A card is identified by the raw UID of the tag (`Tag.getId()`), which the
 * scanner reports as an upper-case hex string without separators. Staff,
 * however, tend to type the number printed on the card, which is usually
 * written in colon separated form (`52:C2:8E:DE`). These helpers accept
 * both and always produce the canonical form used as the Firestore
 * document id.
 *
 * The module is deliberately free of any Firebase import so the rules can be
 * unit tested on their own.
 */

/** UID lengths, in bytes, that NFC tags are commonly seen with. */
export const UID_BYTE_LENGTHS: readonly number[] = [4, 7, 10];

/** Shown when a card UID cannot be used. */
export const UID_FORMAT_HINT =
  'Card UID must be 4, 7 or 10 hex bytes — for example 52:C2:8E:DE or 52C28EDE.';

/**
 * Strip separators, a `0x` prefix and whitespace and upper-case the rest.
 *
 * `52:C2:8E:DE`, `52-c2-8e-de` and `52 C2 8E DE` all become `52C28EDE`.
 * Characters that are not hex digits are left in place — `isValidUid()`
 * reports them instead of silently dropping them.
 */
export function normalizeUid(raw: string | null | undefined): string {
  if (!raw) {
    return '';
  }
  return raw
    .trim()
    .toUpperCase()
    .replace(/^0X/, '')
    .replace(/[\s:.-]/g, '');
}

/**
 * True when the value is a plausible NFC tag UID: hex digits only, and a
 * length of 4, 7 or 10 bytes.
 *
 * Shorter values are rejected on purpose. Ultralight and NTAG cards print
 * only the last three bytes of their UID, and such a fragment can never
 * match a full UID read by the scanner.
 */
export function isValidUid(raw: string | null | undefined): boolean {
  const uid = normalizeUid(raw);
  if (!/^[0-9A-F]+$/.test(uid)) {
    return false;
  }
  return UID_BYTE_LENGTHS.includes(uid.length / 2);
}

/** Colon separated form of a UID, for display only. */
export function formatUid(raw: string | null | undefined): string {
  return normalizeUid(raw).replace(/(.{2})(?=.)/g, '$1:');
}

/** A short description of a UID, e.g. `52C28EDE · 4 bytes`. */
export function describeUid(raw: string | null | undefined): string {
  const uid = normalizeUid(raw);
  if (!uid) {
    return '';
  }
  if (!/^[0-9A-F]+$/.test(uid)) {
    return uid;
  }
  if (uid.length % 2 !== 0) {
    // Not a whole number of bytes, so there is no byte count to report.
    return uid;
  }
  const bytes = uid.length / 2;
  return `${uid} · ${bytes} byte${bytes === 1 ? '' : 's'}`;
}
