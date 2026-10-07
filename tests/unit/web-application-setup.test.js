import { describe, expect, it, vi } from 'vitest';
import { createApplicationSetupSubmitHandler } from '../../apps/web/application-setup.mjs';
import { presentPanelError } from '../../apps/web/panel-error-presentation.mjs';

describe('application setup form submission', () => {
  it('renders a localized safe error instead of the raw Twitch/backend message', async () => {
    const clientSecret = { value: 'temporary-secret' };
    const form = {
      elements: { namedItem: (name) => name === 'clientSecret' ? clientSecret : null },
      values: { clientId: 'client-id', clientSecret: 'temporary-secret' },
    };
    const notice = { textContent: '' };
    const handler = createApplicationSetupSubmitHandler({
      request: vi.fn(async () => { throw Object.assign(new Error('provider body contains token=secret'), { code: 'PRODUCT_LOCALE_VERSION_CONFLICT' }); }),
      notice,
      refresh: vi.fn(),
      presentError: (error) => presentPanelError(error, 'en', {
        en: { 'panel.error.locale_conflict': 'The language changed. Refresh the page.' },
        'pt-BR': { 'panel.error.generic': 'Não foi possível concluir. Tente novamente.' },
      }),
      formDataFactory: (target) => ({ get: (name) => target.values[name] }),
    });

    await handler({ currentTarget: form, preventDefault: vi.fn() });

    expect(notice.textContent).toBe('The language changed. Refresh the page.');
    expect(notice.textContent).not.toContain('token=secret');
  });

  it('clears the secret after async validation even after the event dispatch releases currentTarget', async () => {
    let resolveRequest;
    const request = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const clientSecret = { value: 'temporary-secret' };
    const form = {
      elements: { namedItem: (name) => name === 'clientSecret' ? clientSecret : null },
      values: { clientId: 'client-id', clientSecret: 'temporary-secret' },
    };
    const notice = { textContent: '' };
    const refresh = vi.fn(async () => undefined);
    const handler = createApplicationSetupSubmitHandler({
      request, notice, refresh,
      formDataFactory: (target) => ({ get: (name) => target.values[name] }),
    });
    const event = { currentTarget: form, preventDefault: vi.fn() };

    const submitting = handler(event);
    event.currentTarget = null;
    resolveRequest({});
    await submitting;

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/api/setup/application', {
      method: 'POST', body: JSON.stringify({ clientId: 'client-id', clientSecret: 'temporary-secret' }),
    });
    expect(clientSecret.value).toBe('');
    expect(notice.textContent).toBe('Aplicativo validado e salvo com segurança.');
    expect(refresh).toHaveBeenCalledOnce();
  });
});
