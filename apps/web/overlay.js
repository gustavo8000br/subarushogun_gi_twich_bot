import { mountOverlayWidget } from './overlay-renderer.mjs';

const widget = mountOverlayWidget({ document, fetch, location: window.location, history: window.history });
void widget.pollNow();
window.addEventListener('pagehide', () => widget.destroy(), { once: true });
