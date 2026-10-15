import PanelShell from '../../features/panel-shell/panel-shell.jsx';

export default function PanelRoot({ fallbackCatalog, activePage, children }) {
  return <PanelShell fallbackCatalog={fallbackCatalog} activePage={activePage}>{children}</PanelShell>;
}
