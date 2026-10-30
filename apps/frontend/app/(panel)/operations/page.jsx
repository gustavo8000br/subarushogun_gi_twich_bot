import PanelRoot from '../panel-root.jsx';
import { OperationsPanelPageContent } from '../../../features/operations/operations-page-content.jsx';
import { loadFirstPartyPanelFallback } from '../../../lib/i18n/load-first-party-panel-fallback.mjs';

export default async function OperationsPage() {
  const fallbackCatalog = await loadFirstPartyPanelFallback();
  return (
    <div data-next-panel-entry>
      <PanelRoot fallbackCatalog={fallbackCatalog} activePage="operations">
        <OperationsPanelPageContent />
      </PanelRoot>
    </div>
  );
}
