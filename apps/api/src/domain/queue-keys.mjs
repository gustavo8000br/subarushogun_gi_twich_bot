/** @typedef {{slug: unknown, aliases?: unknown}} QueueKeysInput */

const queueKeyPattern = /^[a-z0-9-]{2,24}$/;
const reservedQueueKeys = new Set([
  'add', 'remover', 'sair', 'posicao', 'proximo', 'atender', 'concluir', 'mover',
  'abrir', 'fechar', 'limpar', 'confirmar', 'filas', 'conta', 'lista',
]);

/** @param {string} code */
function queueKeyError(code) {
  return Object.assign(new Error('Queue name or alias is invalid'), { code });
}

function normalizeOneKey(value) {
  if (typeof value !== 'string') throw queueKeyError('INVALID_QUEUE_KEY');
  const key = value.toLowerCase();
  if (!queueKeyPattern.test(key)) throw queueKeyError('INVALID_QUEUE_KEY');
  if (reservedQueueKeys.has(key)) throw queueKeyError('RESERVED_QUEUE_KEY');
  return key;
}

/** @param {QueueKeysInput} input */
export function normalizeQueueKeys(input) {
  if (!input || typeof input !== 'object') throw queueKeyError('INVALID_QUEUE_KEY');
  const slug = normalizeOneKey(input.slug);
  const aliasesInput = input.aliases ?? [];
  if (!Array.isArray(aliasesInput)) throw queueKeyError('INVALID_QUEUE_ALIASES');
  const aliases = aliasesInput.map(normalizeOneKey);
  const normalized = [slug, ...aliases];
  if (new Set(normalized).size !== normalized.length) throw queueKeyError('DUPLICATE_QUEUE_KEY');

  return {
    slug,
    aliases,
    keys: [
      { key: slug, keyType: 'slug' },
      ...aliases.map((key) => ({ key, keyType: 'alias' })),
    ],
  };
}
