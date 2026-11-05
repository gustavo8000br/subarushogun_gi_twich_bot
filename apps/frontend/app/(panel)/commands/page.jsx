import PanelRoot from '../panel-root.jsx';
import CommandPermissionsPageContent from '../../../features/commands/command-permissions-page-content.jsx';
import { loadFirstPartyPanelFallback } from '../../../lib/i18n/load-first-party-panel-fallback.mjs';

export default async function CommandsPage() {
  const fallbackCatalog = await loadFirstPartyPanelFallback();
  return <div data-next-panel-entry><PanelRoot fallbackCatalog={fallbackCatalog} activePage="commands"><CommandPermissionsPageContent /></PanelRoot></div>;
}
