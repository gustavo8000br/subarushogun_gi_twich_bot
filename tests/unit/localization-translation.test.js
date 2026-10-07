import { describe, expect, it } from 'vitest';
import { translateCatalog } from '../../apps/shared/localization/translate-catalog.mjs';

const catalogs = {
  'pt-BR': {
    'setup.title': 'Conecte seu canal',
    'setup.greeting': 'Olá, {user}!',
    'translation.unavailable': 'Texto do produto indisponível.',
  },
  en: {
    'setup.title': 'Connect your channel',
    'setup.greeting': 'Hello, {user}!',
    'translation.unavailable': 'Product text unavailable.',
  },
  es: {
    'setup.title': 'Conecta tu canal',
    'setup.greeting': '¡Hola, {user}!',
    'translation.unavailable': 'Texto del producto no disponible.',
  },
};

describe('translateCatalog', () => {
  it('selects the requested supported locale', () => {
    expect(translateCatalog(catalogs, 'es', 'setup.title')).toBe('Conecta tu canal');
  });

  it('uses a newly added valid locale without a hard-coded locale registry', () => {
    const extendedCatalogs = {
      ...catalogs,
      de: { ...catalogs.en, 'setup.title': 'Verbinde deinen Kanal' },
    };

    expect(translateCatalog(extendedCatalogs, 'de', 'setup.title')).toBe('Verbinde deinen Kanal');
  });

  it('falls back to the source locale when a translation key is missing', () => {
    const incompleteCatalogs = { ...catalogs, es: { 'translation.unavailable': 'No disponible.' } };
    expect(translateCatalog(incompleteCatalogs, 'es', 'setup.title')).toBe('Conecte seu canal');
  });

  it('falls back to pt-BR for an unsupported locale without exposing it', () => {
    expect(translateCatalog(catalogs, 'fr', 'setup.title')).toBe('Conecte seu canal');
  });

  it('uses safe localized fallback instead of returning an unknown key', () => {
    expect(translateCatalog(catalogs, 'en', 'backend.SECRET_ERROR')).toBe('Product text unavailable.');
    expect(translateCatalog(catalogs, 'fr', 'backend.SECRET_ERROR')).toBe('Texto do produto indisponível.');
  });

  it('interpolates only allowlisted scalar values as literal text', () => {
    const text = '<img src=x onerror=alert(1)>';
    expect(translateCatalog(catalogs, 'en', 'setup.greeting', {
      values: { user: text }, placeholders: { 'setup.greeting': ['user'] },
    })).toBe(`Hello, ${text}!`);
  });

  it('fails closed when a catalog contains an unapproved placeholder', () => {
    expect(translateCatalog(catalogs, 'en', 'setup.greeting', {
      values: { user: 'Ari' }, placeholders: { 'setup.greeting': [] },
    })).toBe('Product text unavailable.');
  });

  it('fails closed when interpolation receives an object or an unapproved value', () => {
    expect(translateCatalog(catalogs, 'en', 'setup.greeting', {
      values: { user: { toString: () => 'unsafe' } }, placeholders: { 'setup.greeting': ['user'] },
    })).toBe('Product text unavailable.');
    expect(translateCatalog(catalogs, 'en', 'setup.greeting', {
      values: { user: 'Ari', secret: 'do-not-show' }, placeholders: { 'setup.greeting': ['user'] },
    })).toBe('Product text unavailable.');
  });
});
