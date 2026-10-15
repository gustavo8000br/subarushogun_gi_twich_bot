import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import OverlayRoot from '../../apps/frontend/app/(overlay)/overlay/overlay-root.jsx';
import OverlayPage from '../../apps/frontend/app/(overlay)/overlay/page.jsx';

describe('Next OBS overlay entry', () => {
  it('renders the accessible overlay contract and no panel UI', () => {
    const markup = renderToStaticMarkup(React.createElement(OverlayRoot));
    expect(markup).toContain('id="overlay-widget"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-atomic="true"');
    expect(markup).toContain('id="overlay-value"');
    expect(markup).toContain('id="overlay-status"');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('panel-sidebar');
    expect(markup).not.toContain('Fila Local');
  });

  it('uses one main landmark for the overlay page', () => {
    const markup = renderToStaticMarkup(React.createElement(OverlayPage));
    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup).toContain('data-next-overlay-entry');
  });
});
