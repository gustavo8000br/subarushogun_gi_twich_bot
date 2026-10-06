/**
 * Bound an external test operation so a broken native service cannot hang cleanup.
 * @template T
 * @param {Promise<T>} operation
 * @param {number} timeoutMs
 * @param {string} message
 * @returns {Promise<T>}
 */
export async function withTimeout(operation, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
