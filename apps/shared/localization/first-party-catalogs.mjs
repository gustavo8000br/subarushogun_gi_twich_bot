import { resolve } from 'node:path';

/**
 * Repository-root-relative directory of the first-party TSV catalogs (`<module>/<locale>.tsv`).
 * It stays root-relative because the Next panel pages read it at `next build` time through
 * `process.cwd()`, where `import.meta.url` points into the bundle instead of the source tree.
 */
export const FIRST_PARTY_CATALOG_DIRECTORY = 'apps/shared/localization/catalogs';

/**
 * Resolve the first-party catalog directory from the repository (or image `/app`) root.
 * @param {string} repositoryRoot
 * @returns {string}
 */
export function resolveFirstPartyCatalogRoot(repositoryRoot) {
  return resolve(repositoryRoot, FIRST_PARTY_CATALOG_DIRECTORY);
}
