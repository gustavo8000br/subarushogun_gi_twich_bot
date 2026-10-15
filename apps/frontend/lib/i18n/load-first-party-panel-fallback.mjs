import { resolve } from 'node:path';
import { discoverCatalogBundle } from '../../../shared/localization/discover-catalog-bundle.mjs';

const firstPartyCatalogRoot = resolve(process.cwd(), 'apps/web/localization/catalogs');

export async function loadFirstPartyPanelFallback() {
  const bundle = await discoverCatalogBundle(firstPartyCatalogRoot);
  const catalogs = /** @type {{modules: {panel: {catalogs: Record<string, Record<string, string>>}}}} */ (bundle).modules.panel.catalogs;
  return { 'pt-BR': { ...catalogs['pt-BR'] } };
}
