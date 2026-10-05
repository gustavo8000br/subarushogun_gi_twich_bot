import { describe, expect, it, vi } from 'vitest';
import { createApplicationSetupSubmitHandler } from '../../apps/web/application-setup.mjs';

describe('application setup form submission', () => {
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
