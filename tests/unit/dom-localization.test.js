import { describe, expect, it, vi } from 'vitest';
import { applyPanelTranslations } from '../../apps/web/dom-localization.mjs';

describe('safe panel catalog application', () => {
  it('translates a label text node without removing its form control', () => {
    const labelText = { nodeType: 3, textContent: 'Nome antigo' };
    const input = { nodeType: 1, tagName: 'INPUT' };
    const label = {
      dataset: { i18n: 'panel.form.label' },
      childNodes: [labelText, input],
      get firstChild() { return this.childNodes[0]; },
      get textContent() { return this.childNodes.map((node) => node.textContent ?? '').join(''); },
      set textContent(value) { this.childNodes = [{ nodeType: 3, textContent: value }]; },
    };
    const root = { querySelectorAll: (selector) => selector === '[data-i18n]' ? [label] : [] };

    applyPanelTranslations(root, 'en', { en: { 'panel.form.label': 'New label' } });

    expect(label.childNodes[0].textContent).toBe('New label');
    expect(label.childNodes[1]).toBe(input);
  });

  it('translates checkbox label copy after preserving its leading input', () => {
    const input = { nodeType: 1, tagName: 'INPUT' };
    const labelText = { nodeType: 3, textContent: 'Old option' };
    const label = {
      dataset: { i18n: 'panel.form.checkbox' },
      childNodes: [input, labelText],
      get firstChild() { return this.childNodes[0]; },
      get textContent() { return this.childNodes.map((node) => node.textContent ?? '').join(''); },
      set textContent(value) { this.childNodes = [{ nodeType: 3, textContent: value }]; },
    };
    const root = { querySelectorAll: (selector) => selector === '[data-i18n]' ? [label] : [] };

    applyPanelTranslations(root, 'en', { en: { 'panel.form.checkbox': 'New option' } });

    expect(label.childNodes[0]).toBe(input);
    expect(label.childNodes[1].textContent).toBe('New option');
  });

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

  it('preserves documented placeholder tokens in static help text', () => {
    const node = { dataset: { i18n: 'panel.queue_settings.call_placeholders' }, textContent: '' };
    const root = { querySelectorAll: (selector) => selector === '[data-i18n]' ? [node] : [] };
    const placeholders = { 'panel.queue_settings.call_placeholders': ['user', 'queue', 'position', 'uid', 'account'] };

    applyPanelTranslations(root, 'pt-BR', {
      'pt-BR': { 'panel.queue_settings.call_placeholders': 'Campos: {user}, {queue}, {position}, {uid}, {account}.' },
    }, placeholders);

    expect(node.textContent).toBe('Campos: {user}, {queue}, {position}, {uid}, {account}.');
  });
});
