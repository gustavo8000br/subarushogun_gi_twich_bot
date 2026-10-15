import PanelRoot from '../panel-root.jsx';
import WidgetsPageContent from '../../../features/widgets/widgets-page-content.jsx';
import { loadFirstPartyPanelFallback } from '../../../lib/i18n/load-first-party-panel-fallback.mjs';

export default async function WidgetsPage() {
  const fallbackCatalog = await loadFirstPartyPanelFallback();
  return <div data-next-panel-entry><PanelRoot fallbackCatalog={fallbackCatalog} activePage="widgets"><WidgetsPageContent /></PanelRoot></div>;
}
