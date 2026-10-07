import { describe, expect, it } from 'vitest';
import { translateCatalog, translatePluralCatalog } from '../../apps/shared/localization/translate-catalog.mjs';

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

  it('selects locale plural categories and formats the count using Intl', () => {
    const pluralCatalogs = Object.fromEntries(Object.entries(catalogs).map(([locale, catalog]) => [locale, {
      ...catalog,
      'item.count.one': locale === 'en' ? '{count} item' : locale === 'es' ? '{count} elemento' : '{count} item',
      'item.count.other': locale === 'en' ? '{count} items' : locale === 'es' ? '{count} elementos' : '{count} itens',
      ...(locale !== 'en' ? { 'item.count.many': locale === 'es' ? '{count} elementos' : '{count} itens' } : {}),
    }]));
    const placeholders = { 'item.count': ['count'] };
    expect(translatePluralCatalog(pluralCatalogs, 'en', 'item.count', 1, { placeholders })).toBe('1 item');
    expect(translatePluralCatalog(pluralCatalogs, 'en', 'item.count', 2, { placeholders })).toBe('2 items');
    expect(translatePluralCatalog(pluralCatalogs, 'pt-BR', 'item.count', 1000, { placeholders })).toBe('1.000 itens');
  });

  it('selects locale-specific plural categories for community locales', () => {
    const arabic = {
      ...catalogs.en,
      'item.count.zero': '{count} عنصر', 'item.count.one': '{count} عنصر',
      'item.count.two': '{count} عنصران', 'item.count.few': '{count} عناصر',
      'item.count.many': '{count} عنصرًا', 'item.count.other': '{count} عنصر',
    };
    const pluralCatalogs = { ...catalogs, ar: arabic };
    const placeholders = { 'item.count': ['count'] };
    expect(translatePluralCatalog(pluralCatalogs, 'ar', 'item.count', 3, { placeholders })).toBe('3 عناصر');
  });
});
