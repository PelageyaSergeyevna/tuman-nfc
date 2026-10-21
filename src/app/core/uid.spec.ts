import { describe, expect, it } from 'vitest';

import { describeUid, formatUid, isValidUid, normalizeUid, UID_BYTE_LENGTHS } from './uid';

describe('normalizeUid', () => {
  it('keeps a plain upper-case UID untouched', () => {
    expect(normalizeUid('A1B2C3D4')).toBe('A1B2C3D4');
  });

  it('upper-cases lower-case input', () => {
    expect(normalizeUid('a1b2c3d4')).toBe('A1B2C3D4');
  });

  it('strips colon separators', () => {
    expect(normalizeUid('52:C2:8E:DE')).toBe('52C28EDE');
  });

  it('strips dashes, spaces and tabs', () => {
    expect(normalizeUid(' 52-c2 8e\tde ')).toBe('52C28EDE');
  });

  it('strips a 0x prefix', () => {
    expect(normalizeUid('0x52C28EDE')).toBe('52C28EDE');
    expect(normalizeUid('0X52:C2:8E:DE')).toBe('52C28EDE');
  });

  it('keeps a 7 byte UID intact', () => {
    expect(normalizeUid('04:A1:B2:C3:D4:E5:F6')).toBe('04A1B2C3D4E5F6');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeUid('')).toBe('');
    expect(normalizeUid('   ')).toBe('');
    expect(normalizeUid(null)).toBe('');
    expect(normalizeUid(undefined)).toBe('');
  });

  it('keeps characters that are not hex digits', () => {
    expect(normalizeUid('ZZZZ')).toBe('ZZZZ');
    expect(normalizeUid('A1B2C3D4G')).toBe('A1B2C3D4G');
  });
});

describe('isValidUid', () => {
  it('accepts 4, 7 and 10 byte UIDs', () => {
    for (const bytes of UID_BYTE_LENGTHS) {
      expect(isValidUid('AB'.repeat(bytes))).toBe(true);
    }
  });

  it('accepts colon separated input', () => {
    expect(isValidUid('52:C2:8E:DE')).toBe(true);
  });

  it('rejects a fragment of a UID', () => {
    expect(isValidUid('52C28E')).toBe(false);
    expect(isValidUid('8E:DE')).toBe(false);
  });

  it('rejects non hex characters', () => {
    expect(isValidUid('ZZZZZZZZ')).toBe(false);
    expect(isValidUid('A1B2C3D4G')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(isValidUid('')).toBe(false);
  });

  it('rejects a length that is not a whole number of bytes', () => {
    expect(isValidUid('A1B2C3')).toBe(false);
  });
});

describe('formatUid', () => {
  it('groups the bytes in pairs', () => {
    expect(formatUid('52C28EDE')).toBe('52:C2:8E:DE');
    expect(formatUid('04A1B2C3D4E5F6')).toBe('04:A1:B2:C3:D4:E5:F6');
  });

  it('normalises before formatting', () => {
    expect(formatUid('52:c2:8e:de')).toBe('52:C2:8E:DE');
  });

  it('returns an empty string for empty input', () => {
    expect(formatUid('')).toBe('');
  });
});

describe('describeUid', () => {
  it('reports the byte count', () => {
    expect(describeUid('52:C2:8E:DE')).toBe('52C28EDE · 4 bytes');
    expect(describeUid('04A1B2C3D4E5F6')).toBe('04A1B2C3D4E5F6 · 7 bytes');
  });

  it('returns an empty string for empty input', () => {
    expect(describeUid('')).toBe('');
  });

  it('does not report a byte count for a half byte', () => {
    expect(describeUid('52C')).toBe('52C');
  });
});
