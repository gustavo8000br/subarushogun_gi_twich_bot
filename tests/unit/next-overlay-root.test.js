/** @vitest-environment jsdom */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const overlay = vi.hoisted(() => {
  const controls = { pollNow: vi.fn(), destroy: vi.fn() };
  return { controls, mountOverlayWidget: vi.fn(() => controls) };
});

vi.mock('../../apps/web/overlay-renderer.mjs', () => ({ mountOverlayWidget: overlay.mountOverlayWidget }));

import OverlayRoot from '../../apps/frontend/app/(overlay)/overlay/overlay-root.jsx';
import OverlayPage from '../../apps/frontend/app/(overlay)/overlay/page.jsx';

afterEach(cleanup);

beforeEach(() => {
  overlay.mountOverlayWidget.mockClear();
  overlay.controls.pollNow.mockClear();
  overlay.controls.destroy.mockClear();
});

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

  it('mounts the shared renderer, polls immediately, and cleans up on unmount', () => {
    const { unmount } = render(React.createElement(OverlayRoot));

    expect(overlay.mountOverlayWidget).toHaveBeenCalledOnce();
    expect(overlay.mountOverlayWidget).toHaveBeenCalledWith({
      document: globalThis.document, fetch: globalThis.fetch,
      location: globalThis.window.location, history: globalThis.window.history,
    });
    expect(overlay.controls.pollNow).toHaveBeenCalledOnce();
    unmount();
    expect(overlay.controls.destroy).toHaveBeenCalledOnce();
  });
});
