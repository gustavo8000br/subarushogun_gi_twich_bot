import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { discoverCatalogBundle } from '../../shared/localization/discover-catalog-bundle.mjs';
import { resolveFirstPartyCatalogRoot } from '../../shared/localization/first-party-catalogs.mjs';

/** @param {string[]} [argumentsList] */
export async function validateLocalizationCatalogs(argumentsList = process.argv.slice(2)) {
  const catalogRoot = argumentsList[0]
    ? resolve(argumentsList[0])
    : resolveFirstPartyCatalogRoot(fileURLToPath(new URL('../../../', import.meta.url)));
  const bundle = await discoverCatalogBundle(catalogRoot);
  return {
    status: 'valid',
    modules: Object.keys(bundle.modules),
    locales: [...bundle.locales],
  };
}

async function main() {
  try {
    const result = await validateLocalizationCatalogs();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch {
    process.stderr.write('Localization catalogs are invalid or unavailable. Check the locale files and required key/placeholder parity.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
