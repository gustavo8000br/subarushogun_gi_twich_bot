'use client';

import { useEffect } from 'react';
import { mountOverlayWidget } from '../../../../shared/panel/overlay-renderer.mjs';

export default function OverlayRoot() {
  useEffect(() => {
    const widget = mountOverlayWidget({ document, fetch, location: window.location, history: window.history });
    void widget.pollNow();
    const onPageHide = () => widget.destroy();
    window.addEventListener('pagehide', onPageHide, { once: true });
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      widget.destroy();
    };
  }, []);

  return (
    <main id="overlay-widget" className="overlay-widget" aria-live="polite" aria-atomic="true">
      <span id="overlay-value" className="overlay-value" />
      <span id="overlay-status" className="overlay-status" role="status" />
    </main>
  );
}
