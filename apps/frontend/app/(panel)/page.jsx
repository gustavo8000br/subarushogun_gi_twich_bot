import PanelRoot from './panel-root.jsx';
import { loadFirstPartyPanelFallback } from '../../lib/i18n/load-first-party-panel-fallback.mjs';

export default async function PanelPage() {
  const fallbackCatalog = await loadFirstPartyPanelFallback();
  return (
    <div data-next-panel-entry>
      <PanelRoot fallbackCatalog={fallbackCatalog} activePage="overview" />
    </div>
  );
}
