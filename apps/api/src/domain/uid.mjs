/** @typedef {{value?: unknown, mode: 'visible'|'hidden', required?: boolean}} UidInput */

/** @param {string} code */
function invalidUidError(code = 'INVALID_UID') {
  return Object.assign(new Error('The provided UID is invalid'), { code });
}

/** @param {UidInput} input */
export function validateUidInput(input) {
  const { value, mode, required = false } = input;
  if (mode === 'hidden') return { uid: null };
  if (mode !== 'visible') throw invalidUidError('INVALID_UID_MODE');
  if (value === undefined || value === null || value === '') {
    if (required) throw invalidUidError();
    return { uid: null };
  }
  if (typeof value !== 'string') throw invalidUidError();

  const uid = value.trim();
  if (!/^[0-9]{9}$/.test(uid)) throw invalidUidError();
  return { uid };
}
