import { describe, expect, it } from 'vitest';
import { validateCatalogSet } from '../../apps/shared/localization/validate-catalog-set.mjs';

const validCatalogs = () => ({
  'pt-BR': {
    'queue.called': 'Olá, {user}!',
    'translation.unavailable': 'Texto indisponível.',
  },
  en: {
    'queue.called': 'Hello, {user}!',
    'translation.unavailable': 'Text unavailable.',
  },
  es: {
    'queue.called': '¡Hola, {user}!',
    'translation.unavailable': 'Texto no disponible.',
  },
});

describe('validateCatalogSet', () => {
  it('accepts matching locales, keys, and declared placeholders', () => {
    expect(validateCatalogSet(validCatalogs(), {
      placeholders: { 'queue.called': ['user'] },
    })).toBe(true);
  });

  it('rejects missing or unsupported locale catalogs', () => {
    const catalogs = validCatalogs();
    delete catalogs.es;

    expect(() => validateCatalogSet(catalogs)).toThrow('Catalog bundle must include required locales: en, es, pt-BR');
  });

  it('rejects a locale with missing or additional keys', () => {
    const catalogs = validCatalogs();
    delete catalogs.en['queue.called'];

    expect(() => validateCatalogSet(catalogs, {
      placeholders: { 'queue.called': ['user'] },
    })).toThrow('Catalog keys differ for locale en');
  });

  it('rejects placeholder differences between translations', () => {
    const catalogs = validCatalogs();
    catalogs.es['queue.called'] = '¡Hola!';

    expect(() => validateCatalogSet(catalogs, {
      placeholders: { 'queue.called': ['user'] },
    })).toThrow('Placeholder allowlist mismatch for key queue.called');
  });

  it('rejects placeholders not declared by the module contract', () => {
    const catalogs = validCatalogs();
    catalogs.en['queue.called'] = 'Hello, {user} in {queue}!';

    expect(() => validateCatalogSet(catalogs, {
      placeholders: { 'queue.called': ['user'] },
    })).toThrow('Placeholder allowlist mismatch for key queue.called');
  });

  it('rejects malformed placeholder braces', () => {
    const catalogs = validCatalogs();
    catalogs.es['queue.called'] = '¡Hola, {user!';

    expect(() => validateCatalogSet(catalogs, {
      placeholders: { 'queue.called': ['user'] },
    })).toThrow('Invalid template placeholder for key queue.called');
  });

  it('accepts a new complete locale without changing a locale registry', () => {
    const catalogs = validCatalogs();
    catalogs.de = {
      'queue.called': 'Hallo, {user}!',
      'translation.unavailable': 'Text nicht verfügbar.',
    };

    expect(validateCatalogSet(catalogs, {
      placeholders: { 'queue.called': ['user'] },
    })).toBe(true);
  });

  it('rejects invalid locale identifiers', () => {
    expect(() => validateCatalogSet({ ...validCatalogs(), pt_br: {} })).toThrow('Invalid locale identifier');
  });
});
