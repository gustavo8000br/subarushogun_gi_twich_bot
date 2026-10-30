import { describe, expect, it, vi } from 'vitest';
import { persistProductLocale } from '../../apps/frontend/lib/i18n/persist-product-locale.mjs';

describe('persisted product locale', () => {
  it('sends the selected locale with the current persisted revision', async () => {
    const request = vi.fn(async () => ({ locale: 'es', revision: 8 }));
    await expect(persistProductLocale({ request, locale: 'es', current: { locale: 'en', revision: 7 } })).resolves.toEqual({ locale: 'es', revision: 8 });
    expect(request).toHaveBeenCalledWith('/api/localization/locale', {
      method: 'PATCH',
      body: JSON.stringify({ locale: 'es', expectedRevision: 7 }),
    });
  });

  it('does not issue a write for an unchanged locale', async () => {
    const request = vi.fn();
    await expect(persistProductLocale({ request, locale: 'en', current: { locale: 'en', revision: 3 } })).resolves.toEqual({ locale: 'en', revision: 3 });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects invalid locale state without issuing a write', async () => {
    const request = vi.fn();
    await expect(persistProductLocale({ request, locale: 'es', current: { locale: 'en', revision: 0 } })).rejects.toMatchObject({ code: 'INVALID_LOCALE_STATE' });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a successful HTTP response that does not confirm the requested locale and next revision', async () => {
    const request = vi.fn(async () => ({ locale: 'pt-BR', revision: 7 }));
    await expect(persistProductLocale({ request, locale: 'es', current: { locale: 'en', revision: 7 } }))
      .rejects.toMatchObject({ code: 'INVALID_PRODUCT_LOCALE_RESPONSE' });
  });

  it('accepts only the requested locale at the next revision', async () => {
    const request = vi.fn(async () => ({ locale: 'es', revision: 8 }));
    await expect(persistProductLocale({ request, locale: 'es', current: { locale: 'en', revision: 7 } }))
      .resolves.toEqual({ locale: 'es', revision: 8 });
  });
});
