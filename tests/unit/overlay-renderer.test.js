import { describe, expect, it, vi } from 'vitest';
import { mountOverlayWidget } from '../../apps/web/overlay-renderer.mjs';

function createDocument() {
  const listeners = new Map();
  const classes = (initial = []) => {
    const values = new Set(initial);
    return { add: (value) => values.add(value), remove: (value) => values.delete(value), contains: (value) => values.has(value) };
  };
  const value = { textContent: '', style: {}, classList: classes(), dataset: {} };
  const status = { textContent: '', style: {}, classList: classes(), dataset: {} };
  const widget = { textContent: '', style: {}, classList: classes(), dataset: {} };
  return {
    body: { dataset: {} },
    visibilityState: 'visible',
    getElementById(id) { return ({ 'overlay-value': value, 'overlay-status': status, 'overlay-widget': widget })[id] ?? null; },
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    dispatch(type) { listeners.get(type)?.(); },
    elements: { value, status, widget },
  };
}

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

describe('OBS overlay renderer', () => {
  it('reads the capability only from the fragment, removes it from the visible URL, and sends it as a bearer token', async () => {
    const document = createDocument();
    const fetch = vi.fn(async () => response(200, { sourceType: 'fixed_text', value: 'Olá', fallbackText: '', style: {} }));
    const history = { replaceState: vi.fn() };

    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'a'.repeat(43)}`, pathname: '/overlay.html', search: '?view=1' }, history });
    await renderer.pollNow();

    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/overlay.html?view=1');
    expect(fetch).toHaveBeenCalledWith('/overlay/api/widget', expect.objectContaining({ headers: { authorization: `Bearer ${'a'.repeat(43)}` }, cache: 'no-store' }));
    expect(document.elements.value.textContent).toBe('Olá');
  });

  it('renders remote values as inert text and applies only constrained style properties', async () => {
    const document = createDocument();
    const fetch = vi.fn(async () => response(200, { sourceType: 'fixed_text', value: '<img src=x onerror=alert(1)>', fallbackText: '', style: { textColor: '#12ABEF', fontSize: 48, fontFamily: 'Arial, sans-serif', effect: 'shadow', shadowOffsetX: 2, shadowOffsetY: 3, shadowBlur: 4, arbitraryCss: 'url(https://evil.test)' } }));
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'b'.repeat(43)}`, pathname: '/overlay.html', search: '' }, history: { replaceState() {} } });
    await renderer.pollNow();

    expect(document.elements.value.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.elements.value.innerHTML).toBeUndefined();
    expect(document.elements.widget.style.color).toBe('#12ABEF');
    expect(document.elements.widget.style.fontSize).toBe('48px');
    expect(document.elements.value.style.textShadow).toBe('2px 3px 4px #000000');
    expect(document.elements.widget.style.arbitraryCss).toBeUndefined();
  });

  it('uses a configured fallback when a source has no current value and localizes queue state', async () => {
    const document = createDocument();
    const payloads = [
      { sourceType: 'queue_name', value: null, fallbackText: 'Sem pessoas aguardando', style: {} },
      { sourceType: 'queue_state', value: 'open', fallbackText: 'Indisponível', style: {} },
    ];
    const fetch = vi.fn(async () => response(200, payloads.shift()));
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'c'.repeat(43)}`, pathname: '/overlay.html', search: '' }, history: { replaceState() {} } });
    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('Sem pessoas aguardando');
    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('Aberta');
  });

  it('retains the last good value on a transient failure, marks stale, and clears stale after recovery', async () => {
    const document = createDocument();
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(200, { sourceType: 'fixed_text', value: 'Fila: 3', fallbackText: '', style: {} }))
      .mockResolvedValueOnce(response(503, { error: 'unavailable' }))
      .mockResolvedValueOnce(response(200, { sourceType: 'fixed_text', value: 'Fila: 2', fallbackText: '', style: {} }));
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'d'.repeat(43)}`, pathname: '/overlay.html', search: '' }, history: { replaceState() {} } });
    await renderer.pollNow();
    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('Fila: 3');
    expect(document.elements.status.textContent).toBe('Atualização atrasada');
    expect(document.elements.widget.classList.contains('is-stale')).toBe(true);
    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('Fila: 2');
    expect(document.elements.status.textContent).toBe('');
    expect(document.elements.widget.classList.contains('is-stale')).toBe(false);
  });

  it.each([401, 403, 404])('clears displayed data when the capability is rejected with HTTP %i', async (statusCode) => {
    const document = createDocument();
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(200, { sourceType: 'fixed_text', value: 'Pessoa chamada', fallbackText: '', style: {} }))
      .mockResolvedValueOnce(response(statusCode, { error: 'unavailable' }));
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'e'.repeat(43)}`, pathname: '/overlay.html', search: '' }, history: { replaceState() {} } });
    await renderer.pollNow();
    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('');
    expect(document.elements.status.textContent).toBe('Fonte indisponível');
  });

  it('rejects a missing capability without making a request and fetches immediately when the page becomes visible', async () => {
    const document = createDocument();
    const fetch = vi.fn(async () => response(200, { sourceType: 'fixed_text', value: 'OK', fallbackText: '', style: {} }));
    const setInterval = vi.fn(() => 17);
    const clearInterval = vi.fn();
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: '#invalid', pathname: '/overlay.html', search: '' }, history: { replaceState() {} }, setInterval, clearInterval });
    await renderer.pollNow();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.elements.status.textContent).toBe('Fonte indisponível');

    const valid = mountOverlayWidget({ document, fetch, location: { hash: `#${'f'.repeat(43)}`, pathname: '/overlay.html', search: '' }, history: { replaceState() {} }, setInterval, clearInterval });
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    document.visibilityState = 'visible';
    document.dispatch('visibilitychange');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
    valid.destroy();
    expect(clearInterval).toHaveBeenCalledWith(17);
    renderer.destroy();
  });
});
