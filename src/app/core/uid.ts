/**
 * NFC card UID helpers. Accepts both the scanner's plain hex and the
 * staff-typed colon-separated form, always producing the canonical form used
 * as the Firestore document id. Deliberately free of Firebase imports so the
 * rules can be unit tested on their own.
 */

/** UID lengths, in bytes, that NFC tags are commonly seen with. */
export const UID_BYTE_LENGTHS: readonly number[] = [4, 7, 10];

/** Shown when a card UID cannot be used. */
export const UID_FORMAT_HINT =
  'Card UID must be 4, 7 or 10 hex bytes — for example 52:C2:8E:DE or 52C28EDE.';

/**
 * Strip separators, a `0x` prefix and whitespace, then upper-case. Non-hex
 * characters are left in place so `isValidUid()` can report them.
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
 * True when the value is a plausible UID: hex only, 4/7/10 bytes. Shorter
 * values are rejected because a printed partial UID (Ultralight/NTAG) can
 * never match a full UID read by the scanner.
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
