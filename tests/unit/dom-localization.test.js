import { describe, expect, it, vi } from 'vitest';
import { applyPanelTranslations } from '../../apps/web/dom-localization.mjs';

describe('safe panel catalog application', () => {
  it('sets literal text and allowlisted attributes without parsing translation markup', () => {
    const textNode = { dataset: { i18n: 'panel.title' }, textContent: 'old' };
    const placeholderNode = { dataset: { i18nPlaceholder: 'panel.search' }, setAttribute: vi.fn() };
    const documentElement = { lang: 'pt-BR' };
    const root = {
      documentElement,
      querySelectorAll: vi.fn((selector) => selector === '[data-i18n]'
        ? [textNode]
        : selector === '[data-i18n-placeholder]' ? [placeholderNode] : []),
    };

    applyPanelTranslations(root, 'en', {
      'pt-BR': { 'panel.title': 'Título', 'panel.search': 'Pesquisar' },
      en: { 'panel.title': '<img src=x onerror=alert(1)>', 'panel.search': 'Search queues' },
    });

    expect(documentElement.lang).toBe('en');
    expect(textNode.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(placeholderNode.setAttribute).toHaveBeenCalledWith('placeholder', 'Search queues');
  });

  it('uses a safe translated unavailable fallback for missing keys', () => {
    const node = { dataset: { i18n: 'panel.unknown' }, textContent: '' };
    const root = { querySelectorAll: (selector) => selector === '[data-i18n]' ? [node] : [] };
    applyPanelTranslations(root, 'en', { 'pt-BR': { 'translation.unavailable': 'Texto indisponível.' }, en: { 'translation.unavailable': 'Product text unavailable.' } });
    expect(node.textContent).toBe('Product text unavailable.');
  });
});
