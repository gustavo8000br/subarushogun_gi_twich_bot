import { discoverCatalogBundle } from '../../../shared/localization/discover-catalog-bundle.mjs';
import { resolveFirstPartyCatalogRoot } from '../../../shared/localization/first-party-catalogs.mjs';

// Root-relative on purpose: the panel pages are prerendered by `next build` from the repository (or image `/app`) root.
const firstPartyCatalogRoot = resolveFirstPartyCatalogRoot(process.cwd());

export async function loadFirstPartyPanelFallback() {
  const bundle = await discoverCatalogBundle(firstPartyCatalogRoot);
  const catalogs = /** @type {{modules: {panel: {catalogs: Record<string, Record<string, string>>}}}} */ (bundle).modules.panel.catalogs;
  return { 'pt-BR': { ...catalogs['pt-BR'] } };
}
