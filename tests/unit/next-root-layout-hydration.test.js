import { describe, expect, it } from 'vitest';
import PanelLayout, { metadata as panelMetadata } from '../../apps/frontend/app/(panel)/layout.jsx';
import OverlayLayout, { metadata as overlayMetadata } from '../../apps/frontend/app/(overlay)/layout.jsx';

describe('Next root layouts', () => {
  it.each([
    ['panel', PanelLayout, panelMetadata, 'Fila Local — Painel'],
    ['overlay', OverlayLayout, overlayMetadata, 'Fila Local — Overlay'],
  ])('sets an accessible page title and suppresses browser injected root HTML attributes for the %s', (_name, Layout, metadata, expectedTitle) => {
    const tree = Layout({ children: 'content' });

    expect(tree.type).toBe('html');
    expect(tree.props.suppressHydrationWarning).toBe(true);
    expect(metadata.title).toBe(expectedTitle);
  });
});
