import PanelRoot from '../panel-root.jsx';
import AccountSettingsPageContent from '../../../features/settings/account-settings-page-content.jsx';
import { loadFirstPartyPanelFallback } from '../../../lib/i18n/load-first-party-panel-fallback.mjs';

export default async function SettingsPage() {
  const fallbackCatalog = await loadFirstPartyPanelFallback();
  return <div data-next-panel-entry><PanelRoot fallbackCatalog={fallbackCatalog} activePage="settings"><AccountSettingsPageContent /></PanelRoot></div>;
}
