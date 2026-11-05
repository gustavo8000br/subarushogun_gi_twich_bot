import { describe, expect, it, vi } from 'vitest';
import { mountOverlayWidget } from '../../apps/shared/panel/overlay-renderer.mjs';

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

    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'a'.repeat(43)}`, pathname: '/overlay', search: '?view=1' }, history });
    await renderer.pollNow();

    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/overlay?view=1');
    expect(fetch).toHaveBeenCalledWith('/overlay/api/widget', expect.objectContaining({ headers: { authorization: `Bearer ${'a'.repeat(43)}` }, cache: 'no-store' }));
    expect(document.elements.value.textContent).toBe('Olá');
  });

  it('retains the capability for a browser-source reload without exposing it in the URL', async () => {
    const document = createDocument();
    const values = new Map();
    const sessionStorage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
      removeItem: vi.fn((key) => values.delete(key)),
    };
    const token = 'r'.repeat(43);
    const fetch = vi.fn(async () => response(200, { sourceType: 'account_label', value: 'Viewer', fallbackText: '', style: {} }));
    const reference = 'a'.repeat(22);
    const location = { hash: `#${token}`, pathname: '/overlay', search: `?ref=${reference}` };
    const history = { replaceState: vi.fn() };

    const firstLoad = mountOverlayWidget({ document, fetch, location, history, sessionStorage });
    await firstLoad.pollNow();
    expect(sessionStorage.setItem).toHaveBeenCalledWith(`overlay-capability:${reference}`, token);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', `/overlay?ref=${reference}`);

    const reloaded = mountOverlayWidget({
      document: createDocument(), fetch,
      location: { hash: '', pathname: '/overlay', search: `?ref=${reference}` },
      history, sessionStorage,
    });
    await reloaded.pollNow();
    expect(fetch).toHaveBeenLastCalledWith('/overlay/api/widget', expect.objectContaining({
      headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
    }));
    expect(reloaded).toBeDefined();
    firstLoad.destroy();
    reloaded.destroy();
  });

  it('renders a newly projected current account on the next poll', async () => {
    const document = createDocument();
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(200, { sourceType: 'account_label', value: 'First Viewer', fallbackText: '', style: {} }))
      .mockResolvedValueOnce(response(200, { sourceType: 'account_label', value: 'Second Viewer', fallbackText: '', style: {} }));
    const renderer = mountOverlayWidget({
      document, fetch,
      location: { hash: `#${'t'.repeat(43)}`, pathname: '/overlay', search: `?ref=${'b'.repeat(22)}` },
      history: { replaceState() {} }, sessionStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    });

    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('First Viewer');
    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('Second Viewer');
    renderer.destroy();
  });

  it('clears the retained capability after the server rejects it on reload', async () => {
    const rejectedReference = 'c'.repeat(22);
    const values = new Map([[`overlay-capability:${rejectedReference}`, 's'.repeat(43)]]);
    const sessionStorage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
      removeItem: vi.fn((key) => values.delete(key)),
    };
    const document = createDocument();
    const fetch = vi.fn(async () => response(404, { error: 'unavailable' }));
    const renderer = mountOverlayWidget({
      document, fetch,
      location: { hash: '', pathname: '/overlay', search: `?ref=${rejectedReference}` },
      history: { replaceState() {} }, sessionStorage,
    });

    await renderer.pollNow();

    expect(document.elements.status.textContent).toBe('Fonte indisponível');
    expect(values.has(`overlay-capability:${rejectedReference}`)).toBe(false);
    renderer.destroy();
  });

  it('isolates rotated capability references when OBS sources share session storage', async () => {
    const values = new Map();
    const sessionStorage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
      removeItem: vi.fn((key) => values.delete(key)),
    };
    const oldToken = 'o'.repeat(43);
    const newToken = 'n'.repeat(43);
    const oldReference = 'o'.repeat(22);
    const newReference = 'n'.repeat(22);
    const oldFetch = vi.fn(async () => response(404, { error: 'revoked' }));
    const oldSource = mountOverlayWidget({
      document: createDocument(), fetch: oldFetch,
      location: { hash: `#${oldToken}`, pathname: '/overlay', search: `?ref=${oldReference}` },
      history: { replaceState() {} }, sessionStorage,
    });

    const newFetch = vi.fn(async () => response(200, { sourceType: 'account_label', value: 'Current', fallbackText: '', style: {} }));
    const newSource = mountOverlayWidget({
      document: createDocument(), fetch: newFetch,
      location: { hash: `#${newToken}`, pathname: '/overlay', search: `?ref=${newReference}` },
      history: { replaceState() {} }, sessionStorage,
    });
    await newSource.pollNow();
    await oldSource.pollNow();

    expect(values.get(`overlay-capability:${newReference}`)).toBe(newToken);
    expect(values.has(`overlay-capability:${oldReference}`)).toBe(false);
    const newReload = mountOverlayWidget({
      document: createDocument(), fetch: newFetch,
      location: { hash: '', pathname: '/overlay', search: `?ref=${newReference}` },
      history: { replaceState() {} }, sessionStorage,
    });
    await newReload.pollNow();
    expect(newFetch).toHaveBeenLastCalledWith('/overlay/api/widget', expect.objectContaining({
      headers: { authorization: `Bearer ${newToken}` },
    }));

    oldSource.destroy();
    newSource.destroy();
    newReload.destroy();
  });

  it('renders remote values as inert text and applies only constrained style properties', async () => {
    const document = createDocument();
    const fetch = vi.fn(async () => response(200, { sourceType: 'fixed_text', value: '<img src=x onerror=alert(1)>', fallbackText: '', style: { textColor: '#12ABEF', fontSize: 48, fontFamily: 'Arial, sans-serif', effect: 'shadow', shadowOffsetX: 2, shadowOffsetY: 3, shadowBlur: 4, arbitraryCss: 'url(https://evil.test)' } }));
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'b'.repeat(43)}`, pathname: '/overlay', search: '' }, history: { replaceState() {} } });
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
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'c'.repeat(43)}`, pathname: '/overlay', search: '' }, history: { replaceState() {} } });
    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('Sem pessoas aguardando');
    await renderer.pollNow();
    expect(document.elements.value.textContent).toBe('Aberta');
  });

  it('uses the installation locale for queue-state and status copy in the OBS widget', async () => {
    const document = createDocument();
    document.documentElement = { lang: 'pt-BR' };
    const fetch = vi.fn(async () => response(200, {
      sourceType: 'queue_state', value: 'open', fallbackText: '', style: {}, productLocale: 'en',
      messages: { 'overlay.document.title': 'Local widget', 'overlay.state.open': 'Open', 'overlay.status.stale': 'Update delayed' },
    }));
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'g'.repeat(43)}`, pathname: '/overlay', search: '' }, history: { replaceState() {} } });
    await renderer.pollNow();
    expect(document.documentElement.lang).toBe('en');
    expect(document.elements.value.textContent).toBe('Open');
    renderer.destroy();
  });

  it('retains the last good value on a transient failure, marks stale, and clears stale after recovery', async () => {
    const document = createDocument();
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(200, { sourceType: 'fixed_text', value: 'Fila: 3', fallbackText: '', style: {} }))
      .mockResolvedValueOnce(response(503, { error: 'unavailable' }))
      .mockResolvedValueOnce(response(200, { sourceType: 'fixed_text', value: 'Fila: 2', fallbackText: '', style: {} }));
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'d'.repeat(43)}`, pathname: '/overlay', search: '' }, history: { replaceState() {} } });
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
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: `#${'e'.repeat(43)}`, pathname: '/overlay', search: '' }, history: { replaceState() {} } });
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
    const renderer = mountOverlayWidget({ document, fetch, location: { hash: '#invalid', pathname: '/overlay', search: '' }, history: { replaceState() {} }, setInterval, clearInterval });
    await renderer.pollNow();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.elements.status.textContent).toBe('Fonte indisponível');

    const valid = mountOverlayWidget({ document, fetch, location: { hash: `#${'f'.repeat(43)}`, pathname: '/overlay', search: '' }, history: { replaceState() {} }, setInterval, clearInterval });
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
