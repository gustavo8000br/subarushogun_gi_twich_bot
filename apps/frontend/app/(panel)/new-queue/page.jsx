import PanelRoot from '../panel-root.jsx';
import NewQueuePageContent from '../../../features/queues/new-queue-page-content.jsx';
import { loadFirstPartyPanelFallback } from '../../../lib/i18n/load-first-party-panel-fallback.mjs';

export default async function NewQueuePage() {
  const fallbackCatalog = await loadFirstPartyPanelFallback();
  return (
    <div data-next-panel-entry>
      <PanelRoot fallbackCatalog={fallbackCatalog} activePage="new_queue">
        <NewQueuePageContent />
      </PanelRoot>
    </div>
  );
}
