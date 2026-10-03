import { describe, expect, it } from 'vitest';
import { validateUidInput } from '../../apps/api/src/domain/uid.mjs';

describe('UID input validation', () => {
  it('accepts exactly nine ASCII digits and trims only outer whitespace', () => {
    expect(validateUidInput({ value: ' 123456789\n', mode: 'visible', required: true }))
      .toEqual({ uid: '123456789' });
  });

  it.each([
    '12345678',
    '1234567890',
    '1234 56789',
    'uid: 123456789',
    '１２３４５６７８９',
    '١٢٣٤٥٦٧٨٩',
    'user@example.com',
  ])('rejects malformed visible UID without echoing input: %s', (value) => {
    try {
      validateUidInput({ value, mode: 'visible', required: true });
      throw new Error('Expected invalid UID to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_UID' });
      expect(error.message).not.toContain(value);
    }
  });

  it('allows a missing UID for a manual visible entry when optional', () => {
    expect(validateUidInput({ mode: 'visible', required: false })).toEqual({ uid: null });
  });

  it('rejects a missing visible UID when the reward requires it', () => {
    expect(() => validateUidInput({ mode: 'visible', required: true }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_UID' }));
  });

  it('discards any UID in hidden mode without returning or echoing its content', () => {
    const secretLikeValue = '123456789 login=private';
    const result = validateUidInput({ value: secretLikeValue, mode: 'hidden', required: true });

    expect(result).toEqual({ uid: null });
    expect(JSON.stringify(result)).not.toContain(secretLikeValue);
  });
});
