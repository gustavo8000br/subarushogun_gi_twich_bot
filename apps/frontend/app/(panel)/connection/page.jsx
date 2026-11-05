import PanelRoot from '../panel-root.jsx';
import ConnectionPageContent from '../../../features/connection/connection-page-content.jsx';
import { loadFirstPartyPanelFallback } from '../../../lib/i18n/load-first-party-panel-fallback.mjs';

export default async function ConnectionPage() {
  const fallbackCatalog = await loadFirstPartyPanelFallback();
  return <div data-next-panel-entry><PanelRoot fallbackCatalog={fallbackCatalog} activePage="connection"><ConnectionPageContent /></PanelRoot></div>;
}
