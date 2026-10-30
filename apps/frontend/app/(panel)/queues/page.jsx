import PanelRoot from '../panel-root.jsx';
import QueuesPageContent from '../../../features/queues/queues-page-content.jsx';
import { loadFirstPartyPanelFallback } from '../../../lib/i18n/load-first-party-panel-fallback.mjs';

export default async function QueuesPage() {
  const fallbackCatalog = await loadFirstPartyPanelFallback();
  return (
    <div data-next-panel-entry>
      <PanelRoot fallbackCatalog={fallbackCatalog} activePage="queues">
        <QueuesPageContent />
      </PanelRoot>
    </div>
  );
}
